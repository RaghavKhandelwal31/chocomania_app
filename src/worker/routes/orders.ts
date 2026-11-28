import { Hono } from "hono";
import type { AppVariables, WorkerEnv } from "../types";
import { requireAuth, requireRole } from "../middleware/security";
import { createAdminClient } from "../lib/supabase";
import { writeAuditLog } from "../lib/audit";
import { extractFirstName, getTodayIST } from "../../shared/format";
import {
  handoffConfirmSchema,
  indianPhoneSchema,
  orderInputSchema,
  paymentInputSchema,
} from "../../shared/validation";
import type {
  OwnerOrderDTO,
  PaymentEntryDTO,
  PaymentStatus,
  ViewerHandoffOrderDTO,
  WorkerOrderDTO,
} from "../../shared/types";

export const ordersRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

ordersRoutes.use("*", requireAuth);

/**
 * GET /api/orders
 * Returns list of orders customized strictly per the caller's role.
 */
ordersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const adminClient = createAdminClient(c.env);

  // 1. WORKER ROLE: Strictly isolated WorkerOrderDTO[]
  // NO prices, NO payments, NO phone numbers, NO customer name, NO delivery address, NO internal notes.
  if (user.role === "worker") {
    const { data: rows, error } = await adminClient
      .from("orders")
      .select(
        "id, order_number, status, item_name, size_weight, flavor, is_eggless, cake_message, customization_notes, scheduled_date, scheduled_time, scheduled_slot, fulfillment_type, order_version, worker_seen_version, updated_at",
      )
      .is("deleted_at", null)
      .not("sent_to_worker_at", "is", null)
      .in("status", ["sent_to_worker", "completed", "cancelled"])
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true, nullsFirst: false });

    if (error) {
      return c.json({ error: "Failed to fetch orders" }, 500);
    }

    const workerOrders: WorkerOrderDTO[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      orderNumber: r.order_number as number,
      customerFirstName: "",
      status: r.status as WorkerOrderDTO["status"],
      itemName: r.item_name as string,
      sizeWeight: (r.size_weight as string) || "",
      flavor: (r.flavor as string) || "",
      isEggless: Boolean(r.is_eggless),
      cakeMessage: (r.cake_message as string) || "",
      customizationNotes: (r.customization_notes as string) || "",
      scheduledDate: r.scheduled_date as string,
      scheduledTime: (r.scheduled_time as string | null) ? (r.scheduled_time as string).slice(0, 5) : null,
      scheduledSlot: r.scheduled_slot,
      fulfillmentType: r.fulfillment_type,
      isUpdated: (r.order_version as number) > (r.worker_seen_version as number),
      orderVersion: r.order_version as number,
      photos: [],
      updatedAt: r.updated_at as string,
    }));

    return c.json({ orders: workerOrders });
  }

  // 2. VIEWER ROLE: Strictly completed orders awaiting handoff
  if (user.role === "viewer") {
    const { data: rows, error } = await adminClient
      .from("orders")
      .select(`
        id, order_number, status, item_name, size_weight, flavor, is_eggless, scheduled_date, scheduled_time, scheduled_slot, fulfillment_type, order_version,
        customers!inner(customer_contacts!inner(full_name, phone_e164)),
        order_delivery_details(delivery_address),
        order_pricing(total_price_paise),
        order_payments(amount_paise, voided_at)
      `)
      .is("deleted_at", null)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: true });

    if (error) {
      return c.json({ error: "Failed to fetch handoff orders" }, 500);
    }

    const viewerOrders: ViewerHandoffOrderDTO[] = (rows ?? []).map((r) => {
      const customerObj = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      const rawContacts = customerObj?.customer_contacts;
      const contacts = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts;
      const delivery = Array.isArray(r.order_delivery_details)
        ? r.order_delivery_details[0]
        : r.order_delivery_details;
      const pricing = Array.isArray(r.order_pricing) ? r.order_pricing[0] : r.order_pricing;
      const payments = Array.isArray(r.order_payments) ? r.order_payments : [];

      const totalPrice = (pricing?.total_price_paise as number | undefined) ?? 0;
      const paid = payments
        .filter((p) => !p.voided_at)
        .reduce((sum, p) => sum + (p.amount_paise as number), 0);
      const balanceDue = Math.max(0, totalPrice - paid);

      return {
        id: r.id as string,
        orderNumber: r.order_number as number,
        customerFullName: (contacts?.full_name as string | undefined) ?? "Customer",
        customerPhone: (contacts?.phone_e164 as string | undefined) ?? "",
        itemName: r.item_name as string,
        sizeWeight: (r.size_weight as string) || "",
        flavor: (r.flavor as string) || "",
        isEggless: Boolean(r.is_eggless),
        scheduledDate: r.scheduled_date as string,
        scheduledTime: (r.scheduled_time as string | null) ? (r.scheduled_time as string).slice(0, 5) : null,
        scheduledSlot: r.scheduled_slot,
        fulfillmentType: r.fulfillment_type,
        deliveryAddress: (delivery?.delivery_address as string | undefined) ?? "",
        amountToCollectPaise: balanceDue,
        orderVersion: r.order_version as number,
        photos: [],
      };
    });

    return c.json({ orders: viewerOrders });
  }

  // 3. OWNER & ADMIN: Full OwnerOrderDTO[]
  const { data: rows, error } = await adminClient
    .from("orders")
    .select(`
      id, order_number, customer_id, customer_first_name, status, item_name, size_weight, flavor, is_eggless,
      cake_message, customization_notes, scheduled_date, scheduled_time, scheduled_slot, fulfillment_type,
      order_source, order_version, sent_to_worker_at, created_at, updated_at,
      customers(customer_contacts(full_name, phone_e164)),
      order_delivery_details(delivery_address),
      order_pricing(total_price_paise),
      order_internal_notes(internal_notes),
      order_payments(id, amount_paise, payment_mode, payment_date, is_advance, recorded_by, voided_at, created_at),
      created_by_profile:user_profiles!created_by(display_name)
    `)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: "Failed to fetch orders" }, 500);
  }

  const ownerOrders: OwnerOrderDTO[] = (rows ?? []).map((r) => {
    const customerObj = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const rawContacts = customerObj?.customer_contacts;
    const contacts = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts;
    const delivery = Array.isArray(r.order_delivery_details)
      ? r.order_delivery_details[0]
      : r.order_delivery_details;
    const pricing = Array.isArray(r.order_pricing) ? r.order_pricing[0] : r.order_pricing;
    const notes = Array.isArray(r.order_internal_notes)
      ? r.order_internal_notes[0]
      : r.order_internal_notes;
    const rawPayments = Array.isArray(r.order_payments) ? r.order_payments : [];
    const creator = Array.isArray(r.created_by_profile) ? r.created_by_profile[0] : r.created_by_profile;

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

    return {
      id: r.id as string,
      orderNumber: r.order_number as number,
      customerId: r.customer_id as string,
      customerFirstName: r.customer_first_name as string,
      customerFullName: (contacts?.full_name as string | undefined) ?? r.customer_first_name as string,
      customerPhone: (contacts?.phone_e164 as string | undefined) ?? "",
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

  return c.json({ orders: ownerOrders });
});

/**
 * POST /api/orders
 * Create a new order (Owner / Admin only).
 */
ordersRoutes.post("/", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = orderInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid order data" }, 400);
  }

  const data = parsed.data;
  const adminClient = createAdminClient(c.env);
  const customerFirstName = extractFirstName(data.customerName);

  // 1. Look up or create Customer and Contact
  let customerId: string;
  const { data: existingContact } = await adminClient
    .from("customer_contacts")
    .select("customer_id")
    .eq("phone_e164", data.customerPhone)
    .maybeSingle();

  if (existingContact?.customer_id) {
    customerId = existingContact.customer_id as string;
    // Update contact full name if changed
    await adminClient
      .from("customer_contacts")
      .update({ full_name: data.customerName, updated_at: new Date().toISOString() })
      .eq("customer_id", customerId);
  } else {
    // Create new customer
    const { data: newCust, error: custErr } = await adminClient
      .from("customers")
      .insert({ first_name: customerFirstName })
      .select("id")
      .single();
    if (custErr || !newCust) {
      return c.json({ error: "Failed to create customer record" }, 500);
    }
    customerId = newCust.id as string;

    const { error: contactErr } = await adminClient.from("customer_contacts").insert({
      customer_id: customerId,
      full_name: data.customerName,
      phone_e164: data.customerPhone,
    });
    if (contactErr) {
      return c.json({ error: "Failed to record customer contact details" }, 500);
    }
  }

  // 2. Insert into orders table (Worker safe fields)
  const isSent = Boolean(data.sendToWorker);
  const nowIso = new Date().toISOString();

  const { data: orderRow, error: orderErr } = await adminClient
    .from("orders")
    .insert({
      customer_id: customerId,
      customer_first_name: customerFirstName,
      status: isSent ? "sent_to_worker" : "draft",
      item_name: data.itemName,
      size_weight: data.sizeWeight,
      flavor: data.flavor,
      is_eggless: data.isEggless,
      cake_message: data.cakeMessage,
      customization_notes: data.customizationNotes,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime ? `${data.scheduledTime}:00` : null,
      scheduled_slot: data.scheduledSlot,
      fulfillment_type: data.fulfillmentType,
      order_source: data.orderSource,
      order_version: 1,
      worker_seen_version: 0,
      sent_to_worker_at: isSent ? nowIso : null,
      created_by: user.id,
    })
    .select("id, order_number")
    .single();

  if (orderErr || !orderRow) {
    return c.json({ error: "Failed to create order record" }, 500);
  }

  const orderId = orderRow.id as string;

  // 3. Insert Delivery details (isolated from Worker)
  await adminClient.from("order_delivery_details").insert({
    order_id: orderId,
    delivery_address: data.deliveryAddress,
  });

  // 4. Insert Pricing (isolated from Worker)
  await adminClient.from("order_pricing").insert({
    order_id: orderId,
    total_price_paise: data.totalPricePaise,
  });

  // 5. Insert Internal Notes (Owner/Admin only)
  if (data.internalNotes) {
    await adminClient.from("order_internal_notes").insert({
      order_id: orderId,
      internal_notes: data.internalNotes,
    });
  }

  // 6. Record Advance Payment if any
  if (data.advancePaidPaise > 0) {
    await adminClient.from("order_payments").insert({
      order_id: orderId,
      amount_paise: data.advancePaidPaise,
      payment_mode: data.advancePaymentMode,
      payment_date: getTodayIST(),
      is_advance: true,
      recorded_by: user.id,
    });
  }

  // 7. Audit log
  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "order_created",
    targetType: "order",
    targetId: orderId,
    metadata: {
      order_number: orderRow.order_number,
      sent_to_worker: isSent,
      assigned_to: isSent ? "baker" : "owner",
      total_price_paise: data.totalPricePaise,
    },
  });

  return c.json({
    orderId,
    orderNumber: orderRow.order_number,
  });
});

/**
 * POST /api/orders/:id/send
 * Send an existing draft order to the workshop.
 */
ordersRoutes.post("/:id/send", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, order_number, status, order_version")
    .eq("id", orderId)
    .is("deleted_at", null)
    .single();

  if (error || !order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const nowIso = new Date().toISOString();
  await adminClient
    .from("orders")
    .update({
      status: "sent_to_worker",
      sent_to_worker_at: nowIso,
      order_version: ((order.order_version as number) || 1) + 1,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "order_sent_to_worker",
    targetType: "order",
    targetId: orderId,
    metadata: { order_number: order.order_number },
  });

  return c.json({ ok: true });
});

/**
 * POST /api/orders/:id/complete
 * Mark order as completed by Workshop (Worker) or Owner.
 */
ordersRoutes.post("/:id/complete", requireRole("admin", "owner", "worker"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, order_number, status, order_version")
    .eq("id", orderId)
    .is("deleted_at", null)
    .single();

  if (error || !order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const allowedStatuses =
    user.role === "owner" || user.role === "admin"
      ? ["sent_to_worker", "draft"]
      : ["sent_to_worker"];

  if (!allowedStatuses.includes(order.status as string)) {
    return c.json({ error: "Order cannot be completed from its current status" }, 400);
  }

  const nowIso = new Date().toISOString();
  await adminClient
    .from("orders")
    .update({
      status: "completed",
      completed_at: nowIso,
      order_version: ((order.order_version as number) || 1) + 1,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "order_completed",
    targetType: "order",
    targetId: orderId,
    metadata: { order_number: order.order_number },
  });

  return c.json({ ok: true });
});

/**
 * POST /api/orders/:id/ack-update
 * Worker acknowledges seeing updated order (clears "Updated" badge).
 */
ordersRoutes.post("/:id/ack-update", requireRole("worker"), async (c) => {
  const orderId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: order } = await adminClient
    .from("orders")
    .select("order_version")
    .eq("id", orderId)
    .single();

  if (order) {
    await adminClient
      .from("orders")
      .update({ worker_seen_version: order.order_version })
      .eq("id", orderId);
  }

  return c.json({ ok: true });
});

/**
 * POST /api/orders/:id/cancel
 * Cancel order (Owner / Admin only).
 */
ordersRoutes.post("/:id/cancel", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, order_number, status, order_version")
    .eq("id", orderId)
    .is("deleted_at", null)
    .single();

  if (error || !order) {
    return c.json({ error: "Order not found" }, 404);
  }

  if (order.status === "handed_off") {
    return c.json({ error: "Cannot cancel an already handed-off order" }, 400);
  }

  const nowIso = new Date().toISOString();
  await adminClient
    .from("orders")
    .update({
      status: "cancelled",
      order_version: ((order.order_version as number) || 1) + 1,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "order_cancelled",
    targetType: "order",
    targetId: orderId,
    metadata: { order_number: order.order_number },
  });

  return c.json({ ok: true });
});

/**
 * POST /api/orders/:id/handoff
 * Atomic handoff via handoff_order_tx RPC (Owner, Admin, Viewer).
 */
ordersRoutes.post("/:id/handoff", requireRole("admin", "owner", "viewer"), async (c) => {
  const orderId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = handoffConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid handoff data" }, 400);
  }

  const { amountCollectedPaise, paymentMode, expectedVersion } = parsed.data;
  const sbUserClient = c.get("sbUserClient");

  const { data, error } = await sbUserClient.rpc("handoff_order_tx", {
    p_order_id: orderId,
    p_amount_paise: amountCollectedPaise,
    p_payment_mode: paymentMode,
    p_expected_version: expectedVersion,
  });

  if (error) {
    if (error.code === "40001" || error.message?.includes("version_conflict")) {
      return c.json({ error: "Order was updated elsewhere. Please refresh and try again." }, 409);
    }
    return c.json({ error: error.message || "Failed to complete handoff" }, 400);
  }

  return c.json({ ok: true, result: data });
});

/**
 * POST /api/orders/:id/undo-handoff
 * Undo handoff via undo_handoff_tx RPC.
 */
ordersRoutes.post("/:id/undo-handoff", requireRole("admin", "owner", "viewer"), async (c) => {
  const orderId = c.req.param("id");
  const sbUserClient = c.get("sbUserClient");

  const { data, error } = await sbUserClient.rpc("undo_handoff_tx", {
    p_order_id: orderId,
  });

  if (error) {
    return c.json({ error: error.message || "Cannot undo this handoff" }, 400);
  }

  return c.json({ ok: true, result: data });
});

/**
 * GET /api/customers/lookup?phone=...
 * Owner/Admin auto-fill customer info by phone.
 */
ordersRoutes.get("/customer-lookup", requireRole("admin", "owner"), async (c) => {
  const rawPhone = c.req.query("phone") ?? "";
  const parsedPhone = indianPhoneSchema.safeParse(rawPhone);
  if (!parsedPhone.success) {
    return c.json({ customer: null });
  }

  const phoneE164 = parsedPhone.data;
  const adminClient = createAdminClient(c.env);

  const { data: contact } = await adminClient
    .from("customer_contacts")
    .select("customer_id, full_name, customers(first_name)")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (!contact) {
    return c.json({ customer: null });
  }

  // Also get their most recent order to allow repeating order details
  const { data: recentOrder } = await adminClient
    .from("orders")
    .select("item_name, size_weight, flavor, is_eggless, fulfillment_type, order_delivery_details(delivery_address)")
    .eq("customer_id", contact.customer_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const delivery = Array.isArray(recentOrder?.order_delivery_details)
    ? recentOrder?.order_delivery_details[0]
    : recentOrder?.order_delivery_details;

  return c.json({
    customer: {
      id: contact.customer_id,
      fullName: contact.full_name,
      phone: phoneE164,
      recentOrder: recentOrder
        ? {
            itemName: recentOrder.item_name,
            sizeWeight: recentOrder.size_weight,
            flavor: recentOrder.flavor,
            isEggless: recentOrder.is_eggless,
            fulfillmentType: recentOrder.fulfillment_type,
            deliveryAddress: delivery?.delivery_address ?? "",
          }
        : null,
    },
  });
});

/**
 * GET /api/items/recent
 * Returns distinct recent item names for quick tap chips.
 */
ordersRoutes.get("/recent-items", requireRole("admin", "owner"), async (c) => {
  const adminClient = createAdminClient(c.env);
  const { data } = await adminClient
    .from("orders")
    .select("item_name")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const itemSet = new Set<string>();
  for (const row of data ?? []) {
    if (row.item_name?.trim()) {
      itemSet.add(row.item_name.trim());
    }
  }

  // Provide fallback bakery favorites if nothing ordered yet
  if (itemSet.size === 0) {
    ["Chocolate Truffle Cake", "Black Forest Cake", "Butterscotch Cake", "Red Velvet Cake", "Assorted Chocolates"].forEach(
      (item) => itemSet.add(item),
    );
  }

  return c.json({ items: Array.from(itemSet).slice(0, 8) });
});

/**
 * GET /api/orders/:id
 * Fetch a single order for editing (Owner / Admin only).
 */
ordersRoutes.get("/:id", requireRole("admin", "owner"), async (c) => {
  const orderId = c.req.param("id");
  const adminClient = createAdminClient(c.env);

  const { data: r, error } = await adminClient
    .from("orders")
    .select(`
      id, order_number, customer_id, customer_first_name, status, item_name, size_weight, flavor, is_eggless,
      cake_message, customization_notes, scheduled_date, scheduled_time, scheduled_slot, fulfillment_type,
      order_source, order_version, sent_to_worker_at, created_at, updated_at,
      customers(customer_contacts(full_name, phone_e164)),
      order_delivery_details(delivery_address),
      order_pricing(total_price_paise),
      order_internal_notes(internal_notes),
      order_payments(id, amount_paise, payment_mode, payment_date, is_advance, recorded_by, voided_at, created_at),
      created_by_profile:user_profiles!created_by(display_name)
    `)
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !r) {
    return c.json({ error: "Order not found" }, 404);
  }

  const customerObj = Array.isArray(r.customers) ? r.customers[0] : r.customers;
  const rawContacts = customerObj?.customer_contacts;
  const contacts = Array.isArray(rawContacts) ? rawContacts[0] : rawContacts;
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

  const order: OwnerOrderDTO = {
    id: r.id as string,
    orderNumber: r.order_number as number,
    customerId: r.customer_id as string,
    customerFirstName: r.customer_first_name as string,
    customerFullName: (contacts?.full_name as string | undefined) ?? (r.customer_first_name as string),
    customerPhone: (contacts?.phone_e164 as string | undefined) ?? "",
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

  return c.json({ order });
});

/**
 * PATCH /api/orders/:id
 * Edit an existing order (Owner / Admin only).
 * Allowed in draft, sent_to_worker, and completed statuses so Owner can update even after sending to Workshop.
 */
ordersRoutes.patch("/:id", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = orderInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid order data" }, 400);
  }

  const data = parsed.data;
  const adminClient = createAdminClient(c.env);

  const { data: existing, error: fetchErr } = await adminClient
    .from("orders")
    .select("id, order_number, customer_id, status, order_version, sent_to_worker_at")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !existing) {
    return c.json({ error: "Order not found" }, 404);
  }

  if (existing.status === "handed_off" || existing.status === "cancelled") {
    return c.json({ error: "Cannot edit a handed-off or cancelled order" }, 400);
  }

  if (
    data.expectedVersion !== undefined &&
    existing.order_version !== data.expectedVersion
  ) {
    return c.json({ error: "Order was updated elsewhere. Please refresh and try again." }, 409);
  }

  const customerFirstName = extractFirstName(data.customerName);
  let customerId = existing.customer_id as string;

  // Check if phone belongs to another customer or same customer
  const { data: existingContact } = await adminClient
    .from("customer_contacts")
    .select("customer_id")
    .eq("phone_e164", data.customerPhone)
    .maybeSingle();

  if (existingContact?.customer_id) {
    customerId = existingContact.customer_id as string;
    await adminClient
      .from("customer_contacts")
      .update({ full_name: data.customerName, updated_at: new Date().toISOString() })
      .eq("customer_id", customerId);
  } else {
    await adminClient
      .from("customer_contacts")
      .update({
        full_name: data.customerName,
        phone_e164: data.customerPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId);
  }

  await adminClient
    .from("customers")
    .update({ first_name: customerFirstName, updated_at: new Date().toISOString() })
    .eq("id", customerId);

  const nowIso = new Date().toISOString();
  const nextStatus =
    existing.status === "draft" && data.sendToWorker ? "sent_to_worker" : existing.status;
  const nextSentAt =
    existing.sent_to_worker_at ?? (nextStatus === "sent_to_worker" ? nowIso : null);

  const { error: updateErr } = await adminClient
    .from("orders")
    .update({
      customer_id: customerId,
      customer_first_name: customerFirstName,
      status: nextStatus,
      item_name: data.itemName,
      size_weight: data.sizeWeight,
      flavor: data.flavor,
      is_eggless: data.isEggless,
      cake_message: data.cakeMessage,
      customization_notes: data.customizationNotes,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime ? `${data.scheduledTime}:00` : null,
      scheduled_slot: data.scheduledSlot,
      fulfillment_type: data.fulfillmentType,
      order_source: data.orderSource,
      order_version: ((existing.order_version as number) || 1) + 1,
      sent_to_worker_at: nextSentAt,
      updated_at: nowIso,
    })
    .eq("id", orderId);

  if (updateErr) {
    return c.json({ error: "Failed to update order" }, 500);
  }

  await adminClient.from("order_delivery_details").upsert({
    order_id: orderId,
    delivery_address: data.deliveryAddress,
  });

  await adminClient.from("order_pricing").upsert({
    order_id: orderId,
    total_price_paise: data.totalPricePaise,
    updated_at: nowIso,
  });

  await adminClient.from("order_internal_notes").upsert({
    order_id: orderId,
    internal_notes: data.internalNotes,
    updated_at: nowIso,
  });

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "order_updated",
    targetType: "order",
    targetId: orderId,
    metadata: {
      order_number: existing.order_number,
      status: nextStatus,
      total_price_paise: data.totalPricePaise,
    },
  });

  return c.json({ ok: true, orderId, orderNumber: existing.order_number });
});

/**
 * POST /api/orders/:id/payments
 * Record a partial or full payment on an order (Owner / Admin only).
 */
ordersRoutes.post("/:id/payments", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = paymentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid payment data" }, 400);
  }

  const adminClient = createAdminClient(c.env);
  const { data: order, error: ordErr } = await adminClient
    .from("orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (ordErr || !order) {
    return c.json({ error: "Order not found" }, 404);
  }
  if (order.status === "cancelled") {
    return c.json({ error: "Cannot record payment on a cancelled order" }, 400);
  }

  const { amountPaise, paymentMode, paymentDate, isAdvance } = parsed.data;
  const { data: payment, error: payErr } = await adminClient
    .from("order_payments")
    .insert({
      order_id: orderId,
      amount_paise: amountPaise,
      payment_mode: paymentMode,
      payment_date: paymentDate ?? getTodayIST(),
      is_advance: isAdvance,
      recorded_by: user.id,
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    return c.json({ error: "Failed to record payment" }, 500);
  }

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "payment_recorded",
    targetType: "order",
    targetId: orderId,
    metadata: {
      order_number: order.order_number,
      payment_id: payment.id,
      amount_paise: amountPaise,
      payment_mode: paymentMode,
    },
  });

  return c.json({ ok: true, paymentId: payment.id });
});

/**
 * POST /api/orders/:id/payments/:paymentId/void
 * Void a payment (Owner / Admin only, audit-logged).
 */
ordersRoutes.post("/:id/payments/:paymentId/void", requireRole("admin", "owner"), async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");
  const paymentId = c.req.param("paymentId");
  const body = (await c.req.json().catch(() => null)) as { reason?: string } | null;
  const reason = (body?.reason ?? "owner_voided").trim().slice(0, 200);

  const adminClient = createAdminClient(c.env);
  const { data: updated, error } = await adminClient
    .from("order_payments")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: reason,
    })
    .eq("id", paymentId)
    .eq("order_id", orderId)
    .is("voided_at", null)
    .select("id, amount_paise")
    .maybeSingle();

  if (error || !updated) {
    return c.json({ error: "Payment not found or already voided" }, 404);
  }

  await writeAuditLog(adminClient, {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "payment_voided",
    targetType: "payment",
    targetId: paymentId,
    metadata: {
      order_id: orderId,
      amount_paise: updated.amount_paise,
      reason,
    },
  });

  return c.json({ ok: true });
});
