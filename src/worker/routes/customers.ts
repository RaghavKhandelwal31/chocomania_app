import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, WorkerEnv } from "../types";
import { requireAuth, requireRole } from "../middleware/security";
import { createAdminClient } from "../lib/supabase";
import { writeAuditLog } from "../lib/audit";
import type {
  CustomerProfileDTO,
  CustomerSummaryDTO,
  OwnerOrderDTO,
  PaymentEntryDTO,
  PaymentStatus,
} from "../../shared/types";

export const customersRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

// Strictly Owner and Admin ONLY. Worker & Viewer are denied.
customersRoutes.use("*", requireAuth, requireRole("admin", "owner"));

const updateNotesSchema = z.object({
  notes: z.string().trim().max(2000),
});

/**
 * GET /api/customers?q=...
 * List all customers with order count, total spent, and outstanding dues.
 */
customersRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const adminClient = createAdminClient(c.env);

  const { data: rows, error } = await adminClient
    .from("customers")
    .select(`
      id, first_name, created_at,
      customer_contacts(full_name, phone_e164),
      orders(
        id, status, scheduled_date, deleted_at,
        order_pricing(total_price_paise),
        order_payments(amount_paise, voided_at)
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: "Failed to load customers" }, 500);
  }

  const summaries: CustomerSummaryDTO[] = [];

  for (const row of rows ?? []) {
    const contacts = Array.isArray(row.customer_contacts)
      ? row.customer_contacts[0]
      : row.customer_contacts;
    const fullName = (contacts?.full_name as string | undefined) ?? (row.first_name as string);
    const phone = (contacts?.phone_e164 as string | undefined) ?? "";

    if (q) {
      const matchesName = fullName.toLowerCase().includes(q);
      const matchesPhone = phone.toLowerCase().includes(q);
      if (!matchesName && !matchesPhone) continue;
    }

    const rawOrders = Array.isArray(row.orders) ? row.orders : [];
    const activeOrders = rawOrders.filter((o) => !o.deleted_at && o.status !== "cancelled");

    let totalSpentPaise = 0;
    let totalPaidPaise = 0;
    let duesPaise = 0;
    let lastOrderDate: string | null = null;

    for (const o of activeOrders) {
      const pricing = Array.isArray(o.order_pricing) ? o.order_pricing[0] : o.order_pricing;
      const orderTotal = (pricing?.total_price_paise as number | undefined) ?? 0;
      const payments = Array.isArray(o.order_payments) ? o.order_payments : [];
      const orderPaid = payments
        .filter((p) => !p.voided_at)
        .reduce((sum, p) => sum + ((p.amount_paise as number) || 0), 0);

      totalSpentPaise += orderTotal;
      totalPaidPaise += orderPaid;
      duesPaise += Math.max(0, orderTotal - orderPaid);

      const sDate = o.scheduled_date as string | undefined;
      if (sDate && (!lastOrderDate || sDate > lastOrderDate)) {
        lastOrderDate = sDate;
      }
    }

    summaries.push({
      id: row.id as string,
      firstName: row.first_name as string,
      fullName,
      phone,
      orderCount: activeOrders.length,
      totalSpentPaise,
      totalPaidPaise,
      duesPaise,
      lastOrderDate,
    });
  }

  // Sort by dues descending, then name
  summaries.sort((a, b) => {
    if (b.duesPaise !== a.duesPaise) return b.duesPaise - a.duesPaise;
    return a.fullName.localeCompare(b.fullName);
  });

  return c.json({ customers: summaries });
});

/**
 * GET /api/customers/:id
 * Customer profile with editable private notes and full order history.
 */
customersRoutes.get("/:id", async (c) => {
  const customerId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: cust, error: custErr } = await adminClient
    .from("customers")
    .select(`
      id, first_name,
      customer_contacts(full_name, phone_e164),
      customer_private_notes(notes)
    `)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (custErr || !cust) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const contacts = Array.isArray(cust.customer_contacts)
    ? cust.customer_contacts[0]
    : cust.customer_contacts;
  const notesRow = Array.isArray(cust.customer_private_notes)
    ? cust.customer_private_notes[0]
    : cust.customer_private_notes;

  const fullName = (contacts?.full_name as string | undefined) ?? (cust.first_name as string);
  const phone = (contacts?.phone_e164 as string | undefined) ?? "";

  const { data: orderRows, error: ordErr } = await adminClient
    .from("orders")
    .select(`
      id, order_number, customer_id, customer_first_name, status, item_name, size_weight, flavor, is_eggless,
      cake_message, customization_notes, scheduled_date, scheduled_time, scheduled_slot, fulfillment_type,
      order_source, order_version, sent_to_worker_at, created_at, updated_at,
      order_delivery_details(delivery_address),
      order_pricing(total_price_paise),
      order_internal_notes(internal_notes),
      order_payments(id, amount_paise, payment_mode, payment_date, is_advance, recorded_by, voided_at, created_at),
      created_by_profile:user_profiles!created_by(display_name)
    `)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (ordErr) {
    return c.json({ error: "Failed to load customer orders" }, 500);
  }

  let totalSpentPaise = 0;
  let totalPaidPaise = 0;
  let duesPaise = 0;
  let lastOrderDate: string | null = null;
  let activeCount = 0;

  const orders: OwnerOrderDTO[] = (orderRows ?? []).map((r) => {
    const delivery = Array.isArray(r.order_delivery_details)
      ? r.order_delivery_details[0]
      : r.order_delivery_details;
    const pricing = Array.isArray(r.order_pricing) ? r.order_pricing[0] : r.order_pricing;
    const notes = Array.isArray(r.order_internal_notes)
      ? r.order_internal_notes[0]
      : r.order_internal_notes;
    const rawPayments = Array.isArray(r.order_payments) ? r.order_payments : [];
    const creator = Array.isArray(r.created_by_profile)
      ? r.created_by_profile[0]
      : r.created_by_profile;

    const totalPricePaise = (pricing?.total_price_paise as number | undefined) ?? 0;
    const payments: PaymentEntryDTO[] = rawPayments.map((p) => ({
      id: p.id as string,
      orderId: r.id as string,
      amountPaise: p.amount_paise as number,
      paymentMode: p.payment_mode,
      paymentDate: p.payment_date as string,
      isAdvance: Boolean(p.is_advance),
      recordedByName: null,
      voidedAt: p.voided_at as string | null,
      createdAt: p.created_at as string,
    }));

    const validPayments = payments.filter((p) => !p.voidedAt);
    const paidPaise = validPayments.reduce((sum, p) => sum + p.amountPaise, 0);
    const balanceDuePaise = Math.max(0, totalPricePaise - paidPaise);

    let paymentStatus: PaymentStatus = "unpaid";
    if (paidPaise >= totalPricePaise && totalPricePaise > 0) {
      paymentStatus = "paid";
    } else if (paidPaise > 0) {
      paymentStatus = "partially_paid";
    }

    if (r.status !== "cancelled") {
      activeCount += 1;
      totalSpentPaise += totalPricePaise;
      totalPaidPaise += paidPaise;
      duesPaise += balanceDuePaise;
      const sDate = r.scheduled_date as string;
      if (!lastOrderDate || sDate > lastOrderDate) {
        lastOrderDate = sDate;
      }
    }

    return {
      id: r.id as string,
      orderNumber: r.order_number as number,
      customerId: r.customer_id as string,
      customerFirstName: r.customer_first_name as string,
      customerFullName: fullName,
      customerPhone: phone,
      status: r.status,
      paymentStatus,
      itemName: r.item_name as string,
      sizeWeight: (r.size_weight as string) || "",
      flavor: (r.flavor as string) || "",
      isEggless: Boolean(r.is_eggless),
      cakeMessage: (r.cake_message as string) || "",
      customizationNotes: (r.customization_notes as string) || "",
      internalNotes: (notes?.internal_notes as string | undefined) ?? "",
      scheduledDate: r.scheduled_date as string,
      scheduledTime: (r.scheduled_time as string | null) ? (r.scheduled_time as string).slice(0, 5) : null,
      scheduledSlot: r.scheduled_slot,
      fulfillmentType: r.fulfillment_type,
      deliveryAddress: (delivery?.delivery_address as string | undefined) ?? "",
      orderSource: r.order_source,
      totalPricePaise,
      paidPaise,
      balanceDuePaise,
      payments,
      photos: [],
      orderVersion: r.order_version as number,
      sentToWorkerAt: r.sent_to_worker_at as string | null,
      createdByName: (creator?.display_name as string | undefined) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });

  const profile: CustomerProfileDTO = {
    id: cust.id as string,
    firstName: cust.first_name as string,
    fullName,
    phone,
    notes: (notesRow?.notes as string | undefined) ?? "",
    orderCount: activeCount,
    totalSpentPaise,
    totalPaidPaise,
    duesPaise,
    lastOrderDate,
    orders,
  };

  return c.json({ customer: profile });
});

/**
 * PATCH /api/customers/:id/notes
 * Save private bakery notes for a customer.
 */
customersRoutes.patch("/:id/notes", async (c) => {
  const user = c.get("user");
  const customerId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateNotesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid notes" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  const { error } = await adminClient.from("customer_private_notes").upsert({
    customer_id: customerId,
    notes: parsed.data.notes,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return c.json({ error: "Failed to save notes" }, 500);
  }

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "customer_notes_updated",
    targetType: "customer",
    targetId: customerId,
  });

  return c.json({ ok: true });
});
