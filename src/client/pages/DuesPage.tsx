import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Calendar,
  Check,
  Copy,
  IndianRupee,
  MessageCircle,
  Phone,
  PlusCircle,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { buildNotifyMessage, buildWhatsappUrl } from "../lib/notify";
import { formatDateDDMMYYYY, formatINR } from "../../shared/format";
import type { OwnerOrderDTO, PaymentMode } from "../../shared/types";

export function DuesPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OwnerOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment modal
  const [payOrder, setPayOrder] = useState<OwnerOrderDTO | null>(null);
  const [payAmountStr, setPayAmountStr] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Notify modal
  const [notifyOrder, setNotifyOrder] = useState<OwnerOrderDTO | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await apiRequest<{ orders: OwnerOrderDTO[] }>("/api/orders");
      setOrders(res.orders || []);
    } catch {
      // Keep existing
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
  }, []);

  // Orders with outstanding balance, excluding cancelled, sorted oldest first by scheduledDate
  const dueOrders = orders
    .filter((o) => o.status !== "cancelled" && o.balanceDuePaise > 0)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const totalDuePaise = dueOrders.reduce((sum, o) => sum + o.balanceDuePaise, 0);

  const openPayModal = (order: OwnerOrderDTO) => {
    setPayOrder(order);
    setPayAmountStr(String(order.balanceDuePaise / 100));
    setPayMode("cash");
    setPayError(null);
  };

  const handleRecordPayment = async () => {
    if (!payOrder) return;
    const paise = Math.round((Number(payAmountStr) || 0) * 100);
    if (paise <= 0) {
      setPayError("Enter a valid amount greater than 0");
      return;
    }
    setPaySubmitting(true);
    setPayError(null);
    try {
      await apiRequest(`/api/orders/${payOrder.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amountPaise: paise,
          paymentMode: payMode,
          isAdvance: false,
        }),
      });
      setPayOrder(null);
      await fetchOrders();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : t("common.errorGeneric"));
    } finally {
      setPaySubmitting(false);
    }
  };

  const openNotifyModal = (order: OwnerOrderDTO) => {
    setNotifyOrder(order);
    setNotifyMessage(buildNotifyMessage(order));
    setCopied(false);
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(notifyMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-4 pb-12 text-[#1F1612]">
      {/* Total Outstanding Dues Summary */}
      <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
          <IndianRupee className="h-5 w-5" />
          <span>{t("dues.totalOutstanding")}</span>
        </div>
        <div className="mt-1 text-3xl font-black text-amber-950">
          {loading ? "—" : formatINR(totalDuePaise)}
        </div>
        <p className="mt-1 text-xs font-bold text-amber-800">
          {t("dues.ordersPending", { count: dueOrders.length })}
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-lg font-bold text-[#6E5444]">
          {t("common.loading")}
        </div>
      ) : dueOrders.length === 0 ? (
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-8 text-center">
          <Check className="mx-auto h-12 w-12 text-emerald-700" />
          <p className="mt-3 text-lg font-extrabold text-[#4A2511]">{t("dues.allClear")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dueOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    to={`/customers/${order.customerId}`}
                    className="text-lg font-extrabold text-[#4A2511] underline"
                  >
                    {order.customerFullName}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs font-bold text-[#6E5444]">
                    <span>#{order.orderNumber}</span>
                    <span>•</span>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDateDDMMYYYY(order.scheduledDate)}</span>
                  </div>
                </div>

                {order.customerPhone && (
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-xs active:scale-95"
                    aria-label={`Call ${order.customerFullName}`}
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                )}
              </div>

              <div className="mt-2.5 flex items-center justify-between rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-[#1F1612]">
                    {order.itemName}
                  </div>
                  <div className="text-xs font-bold text-[#6E5444]">
                    {t("orders.total")}: {formatINR(order.totalPricePaise)} • {t("orders.paid")}:{" "}
                    {formatINR(order.paidPaise)}
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-right">
                  <div className="text-xs font-bold text-amber-800">{t("orders.due")}</div>
                  <div className="text-xl font-black text-amber-950">
                    {formatINR(order.balanceDuePaise)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openNotifyModal(order)}
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 text-sm font-extrabold text-emerald-900 active:scale-95"
                >
                  <Bell className="h-4 w-4" />
                  <span>{t("orders.notify")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openPayModal(order)}
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4A2511] px-3 text-sm font-extrabold text-white shadow-xs active:scale-95"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{t("dues.recordPayment")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Record Payment Modal */}
      {payOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border-4 border-[#4A2511] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-[#4A2511]">{t("dues.recordPayment")}</h2>
            <p className="mt-1 font-bold text-[#6E5444]">
              #{payOrder.orderNumber} • {payOrder.customerFullName}
            </p>

            {payError && (
              <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">
                {payError}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-base font-black text-[#1F1612]">
                  {t("orders.amountCollected")}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={payAmountStr}
                  onChange={(e) => setPayAmountStr(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] px-4 text-2xl font-black text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base font-black text-[#1F1612]">
                  {t("orders.paymentMode")}
                </label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {(["cash", "upi", "card", "bank_transfer"] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPayMode(mode)}
                      className={`min-h-[48px] rounded-xl border-2 px-1 text-xs font-black transition ${
                        payMode === mode
                          ? "border-[#4A2511] bg-[#4A2511] text-white"
                          : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                      }`}
                    >
                      {mode === "cash" && t("orders.modeCash")}
                      {mode === "upi" && t("orders.modeUpi")}
                      {mode === "card" && t("orders.modeCard")}
                      {mode === "bank_transfer" && t("orders.modeBank")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={paySubmitting}
                onClick={() => setPayOrder(null)}
                className="min-h-[52px] rounded-2xl border-2 border-[#D9C7B8] font-black text-[#6E5444] active:scale-95"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={paySubmitting}
                onClick={() => void handleRecordPayment()}
                className="min-h-[52px] rounded-2xl bg-emerald-700 font-black text-white shadow-md active:scale-95 disabled:opacity-60"
              >
                {paySubmitting ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notify Customer Modal */}
      {notifyOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border-4 border-[#4A2511] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-[#4A2511]">{t("orders.notifyTitle")}</h2>
            <p className="mt-1 font-bold text-[#6E5444]">
              #{notifyOrder.orderNumber} • {notifyOrder.customerFullName} ({notifyOrder.customerPhone})
            </p>

            <textarea
              rows={6}
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              className="mt-4 w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-sm font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
            />

            <div className="mt-4 space-y-2.5">
              <a
                href={buildWhatsappUrl(notifyOrder.customerPhone, notifyMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-lg font-black text-white shadow-md active:scale-95"
              >
                <MessageCircle className="h-6 w-6" />
                <span>{t("orders.sendWhatsapp")}</span>
              </a>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void handleCopyMessage()}
                  className="flex min-h-[50px] items-center justify-center gap-1.5 rounded-2xl border-2 border-[#4A2511] bg-[#FBF4EC] font-extrabold text-[#4A2511] active:scale-95"
                >
                  {copied ? <Check className="h-5 w-5 text-emerald-700" /> : <Copy className="h-5 w-5" />}
                  <span>{copied ? t("orders.copied") : t("orders.copyMessage")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNotifyOrder(null)}
                  className="min-h-[50px] rounded-2xl border-2 border-[#D9C7B8] font-extrabold text-[#6E5444] active:scale-95"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
