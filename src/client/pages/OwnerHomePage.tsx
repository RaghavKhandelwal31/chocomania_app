import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChefHat,
  Clock,
  IndianRupee,
  PackageCheck,
  Phone,
  Plus,
  UserCheck,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { formatINR, formatTime12h, getTodayIST } from "../../shared/format";
import type { OrderStatus, OwnerOrderDTO } from "../../shared/types";

export function OwnerHomePage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OwnerOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ orders: OwnerOrderDTO[] }>("/api/orders")
      .then((res) => setOrders(res.orders || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const todayStr = getTodayIST();
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const todayOrders = activeOrders.filter((o) => o.scheduledDate === todayStr);
  const withYou = activeOrders.filter((o) => o.status === "draft");
  const inWorkshop = activeOrders.filter((o) => o.status === "sent_to_worker");
  const readyForHandoff = activeOrders.filter((o) => o.status === "completed");
  const totalDuesPaise = activeOrders.reduce((sum, o) => sum + o.balanceDuePaise, 0);

  const getMiniStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case "draft":
        return { text: t("orders.statusDraft"), cls: "bg-amber-100 text-amber-900 border-amber-300" };
      case "sent_to_worker":
        return { text: t("orders.statusSent"), cls: "bg-blue-100 text-blue-900 border-blue-300" };
      case "completed":
        return { text: t("orders.statusCompleted"), cls: "bg-emerald-100 text-emerald-900 border-emerald-300" };
      case "handed_off":
        return { text: t("orders.statusHandedOff"), cls: "bg-purple-100 text-purple-900 border-purple-300" };
      case "cancelled":
        return { text: t("orders.statusCancelled"), cls: "bg-red-100 text-red-900 border-red-300" };
    }
  };

  return (
    <div className="space-y-4 pb-4 text-[#1F1612]">
      {/* Always-visible Hero New Order button */}
      <Link
        to="/orders/new"
        className="flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-[#5B2E16] to-[#4A2511] text-lg font-extrabold text-white shadow-md transition active:scale-[0.99]"
      >
        <Plus className="h-5 w-5" />
        <span>{t("home.newOrder")}</span>
      </Link>

      {/* 2x2 Operational Queue Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/orders"
          className="rounded-2xl border border-[#E5D7C6] bg-white p-4 shadow-2xs transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#6E5444]">
            <Calendar className="h-4 w-4 text-[#4A2511]" />
            <span>{t("home.statToday")}</span>
          </div>
          <div className="font-display mt-2 text-3xl font-extrabold text-[#4A2511]">
            {loading ? "—" : todayOrders.length}
          </div>
        </Link>

        <Link
          to="/orders?filter=draft"
          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-2xs transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
            <UserCheck className="h-4 w-4 text-amber-700" />
            <span>{t("home.statWithYou")}</span>
          </div>
          <div className="font-display mt-2 text-3xl font-extrabold text-amber-950">
            {loading ? "—" : withYou.length}
          </div>
        </Link>

        <Link
          to="/orders?filter=sent_to_worker"
          className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-2xs transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900">
            <ChefHat className="h-4 w-4 text-blue-700" />
            <span>{t("home.statWorkshop")}</span>
          </div>
          <div className="font-display mt-2 text-3xl font-extrabold text-blue-950">
            {loading ? "—" : inWorkshop.length}
          </div>
        </Link>

        <Link
          to="/orders?filter=completed"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
            <PackageCheck className="h-4 w-4 text-emerald-700" />
            <span>{t("home.statReady")}</span>
          </div>
          <div className="font-display mt-2 text-3xl font-extrabold text-emerald-950">
            {loading ? "—" : readyForHandoff.length}
          </div>
        </Link>
      </div>

      {/* Outstanding Dues Strip */}
      <Link
        to="/dues"
        className="flex items-center justify-between rounded-2xl border border-amber-300/80 bg-gradient-to-r from-[#FFF8EC] to-white px-4 py-3.5 shadow-2xs transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <IndianRupee className="h-4 w-4" />
          </span>
          <span className="text-sm font-extrabold text-amber-950">{t("home.statDues")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-extrabold text-amber-950">
            {loading ? "—" : formatINR(totalDuesPaise)}
          </span>
          <ArrowRight className="h-4 w-4 text-amber-800" />
        </div>
      </Link>

      {/* Ready for Handoff Quick List */}
      <section className="rounded-3xl border border-[#E5D7C6] bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-[#4A2511]">
            {t("home.readySectionTitle")}
          </h2>
          <Link to="/orders?filter=completed" className="text-xs font-extrabold text-[#4A2511] underline">
            {t("home.viewAll")}
          </Link>
        </div>

        {loading ? (
          <p className="mt-3 text-sm font-bold text-[#6E5444]">{t("common.loading")}</p>
        ) : readyForHandoff.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-[#6E5444]">{t("home.noOrdersYet")}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {readyForHandoff.slice(0, 4).map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-extrabold text-[#1F1612]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="truncate">
                      #{order.orderNumber} {order.customerFullName}
                    </span>
                  </div>
                  <p className="truncate text-xs font-bold text-[#5C4538]">
                    {order.itemName} • {t("orders.due")}: {formatINR(order.balanceDuePaise)}
                  </p>
                </div>
                {order.customerPhone && (
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white active:scale-95"
                    aria-label={`Call ${order.customerFullName}`}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Today's Schedule */}
      <section className="rounded-3xl border border-[#E5D7C6] bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-[#4A2511]">
            {t("home.todaySectionTitle")}
          </h2>
          <Link to="/orders" className="text-xs font-extrabold text-[#4A2511] underline">
            {t("home.viewAll")}
          </Link>
        </div>

        {loading ? (
          <p className="mt-3 text-sm font-bold text-[#6E5444]">{t("common.loading")}</p>
        ) : todayOrders.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-[#6E5444]">{t("home.noTodayOrders")}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {todayOrders.slice(0, 6).map((order) => {
              const badge = getMiniStatusLabel(order.status);
              return (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}/edit`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-3 transition active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-[#1F1612]">
                      #{order.orderNumber} {order.itemName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-bold text-[#6E5444]">
                      <span>{order.customerFullName}</span>
                      {order.scheduledTime && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime12h(order.scheduledTime)}
                        </span>
                      )}
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-xl bg-[#F4ECE1] px-2.5 py-1 text-xs font-extrabold text-[#4A2511]">
                    {formatINR(order.totalPricePaise)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
