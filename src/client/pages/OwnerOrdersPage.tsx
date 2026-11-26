import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Send,
  ShoppingBag,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { buildNotifyMessage, buildWhatsappUrl } from "../lib/notify";
import { formatDateDDMMYYYY, formatINR, formatTime12h } from "../../shared/format";
import type { OrderStatus, OwnerOrderDTO, PaymentMode } from "../../shared/types";

type FilterTab = "all" | "draft" | "sent_to_worker" | "completed" | "handed_off";

export function OwnerOrdersPage() {
  const { t } = useTranslation();

  const [orders, setOrders] = useState<OwnerOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Handoff modal state
  const [handoffOrder, setHandoffOrder] = useState<OwnerOrderDTO | null>(null);
  const [amountCollectedStr, setAmountCollectedStr] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);
  const [lastHandoffId, setLastHandoffId] = useState<string | null>(null);

  // Notify modal state
  const [notifyOrder, setNotifyOrder] = useState<OwnerOrderDTO | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await apiRequest<{ orders: OwnerOrderDTO[] }>("/api/orders");
      setOrders(res.orders || []);
    } catch {
      // Keep existing orders if error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
  }, []);

  const handleSendToWorkshop = async (orderId: string) => {
    setActionInProgress(orderId);
    try {
      await apiRequest(`/api/orders/${orderId}/send`, { method: "POST" });
      await fetchOrders();
    } catch {
      // Handle error
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkCompleted = async (orderId: string) => {
    setActionInProgress(orderId);
    try {
      await apiRequest(`/api/orders/${orderId}/complete`, { method: "POST" });
      await fetchOrders();
    } catch {
      // Handle error
    } finally {
      setActionInProgress(null);
    }
  };

  const openHandoffModal = (order: OwnerOrderDTO) => {
    setHandoffOrder(order);
    setAmountCollectedStr(String(order.balanceDuePaise / 100));
    setPaymentMode("cash");
    setHandoffError(null);
  };

  const handleConfirmHandoff = async (payLater = false) => {
    if (!handoffOrder) return;
    setHandoffSubmitting(true);
    setHandoffError(null);
    try {
      const paise = payLater ? 0 : Math.round((Number(amountCollectedStr) || 0) * 100);
      await apiRequest(`/api/orders/${handoffOrder.id}/handoff`, {
        method: "POST",
        body: JSON.stringify({
          amountCollectedPaise: paise,
          paymentMode: payLater ? "cash" : paymentMode,
          expectedVersion: handoffOrder.orderVersion,
        }),
      });
      setLastHandoffId(handoffOrder.id);
      setHandoffOrder(null);
      await fetchOrders();
    } catch (err: unknown) {
      setHandoffError(err instanceof Error ? err.message : t("common.errorGeneric"));
    } finally {
      setHandoffSubmitting(false);
    }
  };

  const handleUndoHandoff = async () => {
    if (!lastHandoffId) return;
    try {
      await apiRequest(`/api/orders/${lastHandoffId}/undo-handoff`, { method: "POST" });
      setLastHandoffId(null);
      await fetchOrders();
    } catch {
      // Ignore
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
      // Ignore clipboard failure
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === "all") return true;
    return o.status === filter;
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "draft":
        return (
          <span className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">
            {t("orders.statusDraft")}
          </span>
        );
      case "sent_to_worker":
        return (
          <span className="rounded-xl border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-800">
            {t("orders.statusSent")}
          </span>
        );
      case "completed":
        return (
          <span className="rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
            {t("orders.statusCompleted")}
          </span>
        );
      case "handed_off":
        return (
          <span className="rounded-xl border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-extrabold text-purple-800">
            {t("orders.statusHandedOff")}
          </span>
        );
      case "cancelled":
        return (
          <span className="rounded-xl border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-extrabold text-red-800">
            {t("orders.statusCancelled")}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 pb-12 text-[#1F1612]">
      {/* Primary "New Order" Button */}
      <Link
        to="/orders/new"
        className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4A2511] text-xl font-extrabold text-white shadow-md active:scale-[0.99]"
      >
        <Plus className="h-6 w-6" />
        <span>{t("home.newOrder")}</span>
      </Link>

      {/* Undo Banner if an order was just handed off */}
      {lastHandoffId && (
        <div className="flex items-center justify-between rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3.5">
          <span className="text-sm font-extrabold text-emerald-900">Order handed off!</span>
          <button
            type="button"
            onClick={() => void handleUndoHandoff()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-emerald-700 bg-white px-3 text-sm font-extrabold text-emerald-800 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { key: "all", label: t("orders.filterAll") },
          { key: "sent_to_worker", label: t("orders.filterSent") },
          { key: "completed", label: t("orders.filterCompleted") },
          { key: "draft", label: t("orders.filterDraft") },
          { key: "handed_off", label: t("orders.filterHandedOff") },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key as FilterTab)}
            className={`min-h-[42px] whitespace-nowrap rounded-xl border-2 px-3.5 font-extrabold transition ${
              filter === tab.key
                ? "border-[#4A2511] bg-[#4A2511] text-white"
                : "border-[#D9C7B8] bg-white text-[#5C4538]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Order List */}
      {loading ? (
        <div className="py-12 text-center text-lg font-bold text-[#6E5444]">{t("common.loading")}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-8 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-[#CBB8A6]" />
          <h3 className="mt-3 text-lg font-extrabold text-[#4A2511]">{t("orders.noOrders")}</h3>
          <p className="mt-1 text-sm font-semibold text-[#6E5444]">{t("home.noOrdersYet")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-4 shadow-sm transition hover:border-[#CBB8A6]"
            >
              {/* Order header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-[#4A2511]">
                      #{order.orderNumber}
                    </span>
                    <span className="text-lg font-bold text-[#1F1612]">
                      {order.customerFullName}
                    </span>
                  </div>
                  {order.customerPhone && (
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{order.customerPhone}</span>
                    </a>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  {getStatusBadge(order.status)}
                  <span className="rounded-lg bg-[#F5ECE2] px-2 py-0.5 text-xs font-bold text-[#5C4538]">
                    {order.fulfillmentType === "pickup"
                      ? t("orders.pickupBadge")
                      : t("orders.deliveryBadge")}
                  </span>
                </div>
              </div>

              {/* Item Info */}
              <div className="mt-3 rounded-2xl bg-[#FFFDF9] p-3 border border-[#EFE5DB]">
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-[#1F1612]">
                    {order.itemName}
                  </span>
                  {order.isEggless && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                      {t("orders.egglessYes")}
                    </span>
                  )}
                </div>
                {(order.sizeWeight || order.flavor) && (
                  <p className="mt-1 text-xs font-bold text-[#6E5444]">
                    {[order.sizeWeight, order.flavor].filter(Boolean).join(" • ")}
                  </p>
                )}
                {order.cakeMessage && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900 border border-amber-200">
                    "{order.cakeMessage}"
                  </p>
                )}
                {order.customizationNotes && (
                  <p className="mt-1 text-xs italic text-[#6E5444]">
                    {order.customizationNotes}
                  </p>
                )}
              </div>

              {/* Delivery Address if delivery */}
              {order.fulfillmentType === "delivery" && order.deliveryAddress && (
                <div className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[#5C4538]">
                  <MapPin className="h-4 w-4 shrink-0 text-amber-700" />
                  <span>{order.deliveryAddress}</span>
                </div>
              )}

              {/* Date & Time */}
              <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-[#6E5444]">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-[#4A2511]" />
                  <span>{formatDateDDMMYYYY(order.scheduledDate)}</span>
                  {order.scheduledTime && (
                    <>
                      <Clock className="ml-1 h-4 w-4 text-[#4A2511]" />
                      <span>{formatTime12h(order.scheduledTime)}</span>
                    </>
                  )}
                </div>

                {/* Pricing Summary */}
                <div className="text-right">
                  <span className="text-sm font-extrabold text-[#1F1612]">
                    {formatINR(order.totalPricePaise)}
                  </span>
                  {order.balanceDuePaise > 0 ? (
                    <span className="ml-2 font-bold text-amber-800">
                      ({t("orders.due")}: {formatINR(order.balanceDuePaise)})
                    </span>
                  ) : (
                    <span className="ml-2 font-bold text-emerald-800">
                      ({t("orders.paid")})
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              {order.status !== "handed_off" && order.status !== "cancelled" && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#EFE5DB] pt-2">
                  <Link
                    to={`/orders/${order.id}/edit`}
                    className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[#CBB8A6] bg-white px-3 text-sm font-extrabold text-[#4A2511] active:scale-95"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>{t("common.edit")}</span>
                  </Link>

                  {order.status === "draft" && (
                    <button
                      type="button"
                      disabled={actionInProgress === order.id}
                      onClick={() => void handleSendToWorkshop(order.id)}
                      className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4A2511] px-3 text-sm font-extrabold text-white shadow-sm active:scale-95 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      <span>
                        {actionInProgress === order.id
                          ? t("orders.submitting")
                          : t("orders.sendNow")}
                      </span>
                    </button>
                  )}

                  {order.status === "sent_to_worker" && (
                    <button
                      type="button"
                      disabled={actionInProgress === order.id}
                      onClick={() => void handleMarkCompleted(order.id)}
                      className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-sm font-extrabold text-white shadow-sm active:scale-95 disabled:opacity-60"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        {actionInProgress === order.id
                          ? t("common.loading")
                          : t("orders.markCompleted")}
                      </span>
                    </button>
                  )}

                  {order.status === "completed" && (
                    <>
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
                        onClick={() => openHandoffModal(order)}
                        className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4A2511] px-3 text-sm font-extrabold text-white shadow-sm active:scale-95"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t("orders.handOff")}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Handoff Confirmation Modal */}
      {handoffOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border-4 border-[#4A2511] bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-[#4A2511]">{t("orders.confirmHandoff")}</h2>
            <p className="mt-1 font-bold text-[#6E5444]">
              #{handoffOrder.orderNumber} • {handoffOrder.customerFullName}
            </p>

            {handoffError && (
              <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">
                {handoffError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-base font-black text-[#1F1612]">
                  {t("orders.amountCollected")}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amountCollectedStr}
                  onChange={(e) => setAmountCollectedStr(e.target.value)}
                  className="mt-1 min-h-[58px] w-full rounded-2xl border-2 border-[#CBB8A6] px-4 text-2xl font-black text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base font-black text-[#1F1612]">
                  {t("orders.paymentMode")}
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["cash", "upi"] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`min-h-[48px] rounded-xl border-2 px-2 text-sm font-black transition ${
                        paymentMode === mode
                          ? "border-[#4A2511] bg-[#4A2511] text-white"
                          : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                      }`}
                    >
                      {mode === "cash" && t("orders.modeCash")}
                      {mode === "upi" && t("orders.modeUpi")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={handoffSubmitting}
                onClick={() => void handleConfirmHandoff(true)}
                className="min-h-[52px] w-full rounded-2xl border-2 border-amber-600 bg-amber-50 text-base font-black text-amber-950 active:scale-95 disabled:opacity-60"
              >
                {t("orders.willPayLater")}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={handoffSubmitting}
                  onClick={() => setHandoffOrder(null)}
                  className="min-h-[54px] rounded-2xl border-2 border-[#D9C7B8] font-black text-[#6E5444] active:scale-95"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={handoffSubmitting}
                  onClick={() => void handleConfirmHandoff(false)}
                  className="min-h-[54px] rounded-2xl bg-emerald-700 font-black text-white shadow-md active:scale-95 disabled:opacity-60"
                >
                  {handoffSubmitting ? t("common.loading") : t("common.confirm")}
                </button>
              </div>
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
              rows={5}
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
