import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  CheckCircle,
  Clock,
  Layers,
  Phone,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";
import { formatDateDDMMYYYY, formatTime12h, getTodayIST } from "../../shared/format";
import type { WorkerOrderDTO } from "../../shared/types";

export function WorkerProductionPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [orders, setOrders] = useState<WorkerOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      const res = await apiRequest<{ orders: WorkerOrderDTO[] }>("/api/orders");
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

  const handleMarkCompleted = async (orderId: string) => {
    setCompletingId(orderId);
    try {
      await apiRequest(`/api/orders/${orderId}/complete`, { method: "POST" });
      await fetchOrders();
    } catch {
      // Handle error
    } finally {
      setCompletingId(null);
    }
  };

  const handleAckUpdate = async (orderId: string) => {
    try {
      await apiRequest(`/api/orders/${orderId}/ack-update`, { method: "POST" });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, isUpdated: false } : o)),
      );
    } catch {
      // Ignore
    }
  };

  const todayStr = getTodayIST();
  const activeOrders = orders.filter(
    (o) => o.status === "sent_to_worker" || o.status === "cancelled",
  );
  const completedOrders = orders.filter((o) => o.status === "completed");

  // Aggregated Summary of items currently in production (exclude cancelled)
  const summaryMap = new Map<string, number>();
  for (const o of activeOrders) {
    if (o.status !== "sent_to_worker") continue;
    const key = [o.itemName, o.sizeWeight].filter(Boolean).join(" ");
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }

  return (
    <div className="space-y-4 pb-16 text-[#1F1612]">
      {/* 1. Call Owner button at top */}
      {user?.ownerPhone && (
        <a
          href={`tel:${user.ownerPhone}`}
          className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-xl font-extrabold text-white shadow-md active:scale-[0.99]"
        >
          <Phone className="h-6 w-6" />
          <span>{t("common.callOwner")}</span>
        </a>
      )}

      {/* 2. Header and description (NO mention of prices or phone hiding!) */}
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[#4A2511]">{t("home.workerTitle")}</h1>
        <p className="mt-1 text-base text-[#5C4538]">{t("home.workerDesc")}</p>

        {/* Aggregated totals */}
        {summaryMap.size > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Layers className="h-4 w-4" />
              <span>Summary to Bake:</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(summaryMap.entries()).map(([item, count]) => (
                <span
                  key={item}
                  className="rounded-xl border border-amber-300 bg-white px-2.5 py-1 text-sm font-extrabold text-amber-950 shadow-xs"
                >
                  {item} <span className="text-amber-700">× {count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Orders List */}
      {loading ? (
        <div className="py-12 text-center text-lg font-bold text-[#6E5444]">
          {t("common.loading")}
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-[#CBB8A6]" />
          <h3 className="mt-3 text-lg font-extrabold text-[#4A2511]">
            {t("home.noOrdersYet")}
          </h3>
        </div>
      ) : (
        <div className="space-y-4">
          {activeOrders.map((order) => {
            const isToday = order.scheduledDate === todayStr;

            return (
              <div
                key={order.id}
                className={`rounded-3xl border-2 bg-white p-5 shadow-sm ${
                  isToday ? "border-amber-400 ring-2 ring-amber-100" : "border-[#E7D8C9]"
                }`}
              >
                {/* Header: Order #, Scheduled Date/Time */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-extrabold text-[#4A2511]">
                        #{order.orderNumber}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs font-bold text-[#6E5444]">
                      <Calendar className="h-4 w-4 text-[#4A2511]" />
                      <span className={isToday ? "font-extrabold text-amber-800" : ""}>
                        {formatDateDDMMYYYY(order.scheduledDate)} {isToday && "(Today)"}
                      </span>
                      {order.scheduledTime && (
                        <>
                          <Clock className="ml-1 h-4 w-4 text-[#4A2511]" />
                          <span>{formatTime12h(order.scheduledTime)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {order.isUpdated && (
                    <button
                      type="button"
                      onClick={() => void handleAckUpdate(order.id)}
                      className="rounded-xl border border-amber-400 bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900 active:scale-95"
                    >
                      {t("orders.updatedBadge")} ✕
                    </button>
                  )}
                </div>

                {/* Cake / Item Details */}
                <div className="mt-3.5 rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xl font-extrabold text-[#1F1612]">
                      {order.itemName}
                    </span>
                    {order.isEggless && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                        {t("orders.egglessYes")}
                      </span>
                    )}
                  </div>

                  {(order.sizeWeight || order.flavor) && (
                    <p className="mt-1.5 text-base font-bold text-[#6E5444]">
                      {[order.sizeWeight, order.flavor].filter(Boolean).join(" • ")}
                    </p>
                  )}

                  {/* Cake Message box */}
                  {order.cakeMessage && (
                    <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5">
                      <span className="text-xs font-bold text-amber-900">Message to write:</span>
                      <p className="mt-0.5 text-base font-extrabold text-amber-950">
                        "{order.cakeMessage}"
                      </p>
                    </div>
                  )}

                  {/* Customization notes */}
                  {order.customizationNotes && (
                    <div className="mt-2 text-xs font-semibold text-[#5C4538]">
                      <span className="font-bold">Notes:</span> {order.customizationNotes}
                    </div>
                  )}
                </div>

                {/* Action: Mark Completed or Cancelled Banner */}
                <div className="mt-4">
                  {order.status === "cancelled" ? (
                    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-3 text-center text-base font-extrabold text-red-800">
                      {t("orders.statusCancelled")}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={completingId === order.id}
                      onClick={() => void handleMarkCompleted(order.id)}
                      className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-lg font-extrabold text-white shadow-md active:scale-[0.99] disabled:opacity-60"
                    >
                      <CheckCircle className="h-6 w-6" />
                      <span>
                        {completingId === order.id ? t("common.loading") : t("orders.markCompleted")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Orders accordion/section */}
      {completedOrders.length > 0 && (
        <div className="mt-8 pt-4 border-t border-[#E7D8C9]">
          <h2 className="mb-3 text-lg font-extrabold text-[#6E5444]">
            Completed Today ({completedOrders.length})
          </h2>
          <div className="space-y-2 opacity-80">
            {completedOrders.slice(0, 5).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-2xl border border-[#D9C7B8] bg-white p-3 text-sm font-bold text-[#5C4538]"
              >
                <span>
                  #{o.orderNumber} {o.itemName}
                </span>
                <span className="text-emerald-700">✓ Done</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
