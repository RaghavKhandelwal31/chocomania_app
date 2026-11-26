import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  CheckCircle2,
  ChefHat,
  Clock,
  IndianRupee,
  PackageCheck,
  Phone,
  Plus,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { formatINR, formatTime12h, getTodayIST } from "../../shared/format";
import type { OwnerOrderDTO } from "../../shared/types";

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
  const inWorkshop = activeOrders.filter((o) => o.status === "sent_to_worker");
  const readyForHandoff = activeOrders.filter((o) => o.status === "completed");
  const totalDuesPaise = activeOrders.reduce((sum, o) => sum + o.balanceDuePaise, 0);

  return (
    <div className="space-y-5 pb-12 text-[#1F1612]">
      {/* Always-visible New Order button */}
      <Link
        to="/orders/new"
        className="flex min-h-[62px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4A2511] text-xl font-extrabold text-white shadow-md active:scale-[0.99]"
      >
        <Plus className="h-6 w-6" />
        <span>{t("home.newOrder")}</span>
      </Link>

      {/* 2x2 Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/orders"
          className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-4 shadow-xs active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#6E5444]">
            <Calendar className="h-4 w-4 text-[#4A2511]" />
            <span>{t("home.statToday")}</span>
          </div>
          <div className="mt-2 text-3xl font-black text-[#4A2511]">
            {loading ? "—" : todayOrders.length}
          </div>
        </Link>

        <Link
          to="/orders"
          className="rounded-3xl border-2 border-blue-200 bg-blue-50/60 p-4 shadow-xs active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900">
            <ChefHat className="h-4 w-4 text-blue-700" />
            <span>{t("home.statWorkshop")}</span>
          </div>
          <div className="mt-2 text-3xl font-black text-blue-950">
            {loading ? "—" : inWorkshop.length}
          </div>
        </Link>

        <Link
          to="/orders"
          className="rounded-3xl border-2 border-emerald-200 bg-emerald-50/70 p-4 shadow-xs active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
            <PackageCheck className="h-4 w-4 text-emerald-700" />
            <span>{t("home.statReady")}</span>
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-950">
            {loading ? "—" : readyForHandoff.length}
          </div>
        </Link>

        <Link
          to="/dues"
          className="rounded-3xl border-2 border-amber-200 bg-amber-50/80 p-4 shadow-xs active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
            <IndianRupee className="h-4 w-4 text-amber-700" />
            <span>{t("home.statDues")}</span>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-950">
            {loading ? "—" : formatINR(totalDuesPaise)}
          </div>
        </Link>
      </div>

      {/* Ready for Handoff Quick List */}
      <section className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[#4A2511]">
            {t("home.readySectionTitle")}
          </h2>
          <Link to="/orders" className="text-sm font-extrabold text-[#4A2511] underline">
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
                    className="ml-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white active:scale-95"
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
      <section className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[#4A2511]">
            {t("home.todaySectionTitle")}
          </h2>
          <Link to="/orders" className="text-sm font-extrabold text-[#4A2511] underline">
            {t("home.viewAll")}
          </Link>
        </div>

        {loading ? (
          <p className="mt-3 text-sm font-bold text-[#6E5444]">{t("common.loading")}</p>
        ) : todayOrders.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-[#6E5444]">{t("home.noTodayOrders")}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {todayOrders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}/edit`}
                className="flex items-center justify-between rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-3 active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-[#1F1612]">
                    #{order.orderNumber} {order.itemName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs font-bold text-[#6E5444]">
                    <span>{order.customerFullName}</span>
                    {order.scheduledTime && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime12h(order.scheduledTime)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="ml-2 shrink-0 rounded-xl bg-[#F5ECE2] px-2.5 py-1 text-xs font-extrabold text-[#4A2511]">
                  {formatINR(order.totalPricePaise)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
