import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Phone, RotateCcw, ShoppingBag } from "lucide-react";
import { apiRequest } from "../lib/api";
import { HandoffModal } from "../components/HandoffModal";
import { formatINR } from "../../shared/format";
import type { ViewerHandoffOrderDTO } from "../../shared/types";

export function ViewerHomePlaceholder() {
  const { t } = useTranslation();
  const [largeText, setLargeText] = useState(true);
  const [orders, setOrders] = useState<ViewerHandoffOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<ViewerHandoffOrderDTO | null>(null);
  const [lastHandoffId, setLastHandoffId] = useState<string | null>(null);
  const [undoSuccess, setUndoSuccess] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await apiRequest<{ orders: ViewerHandoffOrderDTO[] }>("/api/orders");
      setOrders(res.orders || []);
    } catch {
      // Keep
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
  }, []);

  const handleUndo = async () => {
    if (!lastHandoffId) return;
    try {
      await apiRequest(`/api/orders/${lastHandoffId}/undo-handoff`, { method: "POST" });
      setLastHandoffId(null);
      setUndoSuccess(true);
      setTimeout(() => setUndoSuccess(false), 5000);
      await fetchOrders();
    } catch {
      // Ignore
    }
  };

  const baseTextSize = largeText ? "text-[22px] leading-snug" : "text-[18px] leading-snug";

  return (
    <div className={`space-y-6 pb-20 text-[#1F1612] ${baseTextSize}`}>
      {/* Text Size Control */}
      <div className="flex items-center justify-between rounded-2xl border-2 border-[#D9C7B8] bg-white p-3 shadow-xs">
        <span className="font-extrabold text-[#4A2511]">{t("home.textSize")}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLargeText(false)}
            className={`min-h-[56px] min-w-[56px] rounded-xl border-2 font-extrabold ${
              !largeText ? "border-[#4A2511] bg-[#4A2511] text-white" : "border-[#CBB8A6] bg-white text-[#4A2511]"
            }`}
          >
            {t("home.textNormal")}
          </button>
          <button
            type="button"
            onClick={() => setLargeText(true)}
            className={`min-h-[56px] min-w-[56px] rounded-xl border-2 font-extrabold ${
              largeText ? "border-[#4A2511] bg-[#4A2511] text-white" : "border-[#CBB8A6] bg-white text-[#4A2511]"
            }`}
          >
            {t("home.textLarge")}
          </button>
        </div>
      </div>

      {/* Undo Banner if an order was just handed off */}
      {lastHandoffId && (
        <div className="flex items-center justify-between rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <div className="font-extrabold text-emerald-900">Order handed off!</div>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="flex min-h-[52px] items-center gap-1.5 rounded-xl border-2 border-emerald-700 bg-white px-4 font-extrabold text-emerald-800 active:scale-95"
          >
            <RotateCcw className="h-5 w-5" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {undoSuccess && (
        <div className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-4 font-extrabold text-blue-900">
          Handoff undone. Order returned to list.
        </div>
      )}

      {/* Title */}
      <div className="rounded-3xl border-2 border-[#1F1612] bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-extrabold text-[#4A2511]">{t("home.viewerTitle")}</h1>
        <p className="mt-2 font-medium text-[#5C4538]">{t("home.viewerDesc")}</p>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="py-12 text-center font-bold text-[#6E5444]">{t("common.loading")}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border-2 border-[#D9C7B8] bg-white p-8 text-center shadow-sm">
          <ShoppingBag className="mx-auto h-16 w-16 text-[#CBB8A6]" />
          <h2 className="mt-3 text-2xl font-extrabold text-[#4A2511]">{t("home.noOrdersYet")}</h2>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-3xl border-4 border-[#4A2511] bg-white p-6 shadow-md"
            >
              {/* Customer Name & Order # */}
              <div className="flex items-start justify-between gap-2 border-b-2 border-[#E7D8C9] pb-4">
                <div>
                  <span className="text-xl font-bold text-[#6E5444]">Order #{order.orderNumber}</span>
                  <div className="text-2xl font-black text-[#1F1612]">{order.customerFullName}</div>
                </div>

                {order.customerPhone && (
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm active:scale-95"
                    aria-label={`Call ${order.customerFullName}`}
                  >
                    <Phone className="h-7 w-7" />
                  </a>
                )}
              </div>

              {/* Item Info */}
              <div className="mt-4">
                <div className="text-2xl font-extrabold text-[#4A2511]">{order.itemName}</div>
                {order.sizeWeight && (
                  <div className="font-bold text-[#6E5444]">{order.sizeWeight}</div>
                )}
                {order.deliveryAddress && (
                  <div className="mt-2 rounded-xl bg-amber-50 p-3 text-base font-bold text-amber-950 border border-amber-200">
                    📍 {order.deliveryAddress}
                  </div>
                )}
              </div>

              {/* Big Amount To Collect */}
              <div className="my-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 p-4 text-center">
                <div className="text-base font-extrabold text-emerald-900">
                  {t("orders.balanceDue")}
                </div>
                <div className="mt-1 text-4xl font-black text-emerald-950">
                  {formatINR(order.amountToCollectPaise)}
                </div>
              </div>

              {/* Big Handed Off Button */}
              <button
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-[#4A2511] text-2xl font-black text-white shadow-lg active:scale-[0.98]"
              >
                <CheckCircle2 className="h-8 w-8" />
                <span>{t("orders.handOff")}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedOrder && (
        <HandoffModal
          large={largeText}
          order={{
            id: selectedOrder.id,
            orderNumber: selectedOrder.orderNumber,
            customerFullName: selectedOrder.customerFullName,
            itemName: selectedOrder.itemName,
            orderVersion: selectedOrder.orderVersion,
            balanceDuePaise: selectedOrder.amountToCollectPaise,
          }}
          onClose={() => setSelectedOrder(null)}
          onSuccess={async (orderId) => {
            setLastHandoffId(orderId);
            setSelectedOrder(null);
            await fetchOrders();
          }}
        />
      )}
    </div>
  );
}
