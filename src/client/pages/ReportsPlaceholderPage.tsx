import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { apiRequest } from "../lib/api";
import { formatINR } from "../../shared/format";
import type { OwnerOrderDTO } from "../../shared/types";

export function ReportsPlaceholderPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OwnerOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ orders: OwnerOrderDTO[] }>("/api/orders")
      .then((res) => setOrders(res.orders || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const active = orders.filter((o) => o.status !== "cancelled");
  const totalOrderValue = active.reduce((sum, o) => sum + o.totalPricePaise, 0);
  const totalCollected = active.reduce((sum, o) => sum + o.paidPaise, 0);
  const totalDues = active.reduce((sum, o) => sum + o.balanceDuePaise, 0);

  return (
    <div className="space-y-4 pb-12 text-[#1F1612]">
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-[#4A2511]" />
          <h1 className="text-2xl font-extrabold text-[#4A2511]">{t("nav.reports")}</h1>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-4">
            <span className="font-bold text-[#5C4538]">{t("reports.orderValue")}</span>
            <span className="text-xl font-black text-[#4A2511]">
              {loading ? "—" : formatINR(totalOrderValue)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <span className="font-bold text-emerald-900">{t("reports.moneyCollected")}</span>
            <span className="text-xl font-black text-emerald-950">
              {loading ? "—" : formatINR(totalCollected)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <span className="font-bold text-amber-900">{t("dues.totalOutstanding")}</span>
            <span className="text-xl font-black text-amber-950">
              {loading ? "—" : formatINR(totalDues)}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold text-[#6E5444]">{t("reports.comingPhase6")}</p>
      </div>
    </div>
  );
}
