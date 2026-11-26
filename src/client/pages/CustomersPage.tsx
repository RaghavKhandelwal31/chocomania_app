import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Phone, Search, Users } from "lucide-react";
import { apiRequest } from "../lib/api";
import { formatDateDDMMYYYY, formatINR } from "../../shared/format";
import type { CustomerSummaryDTO } from "../../shared/types";

export function CustomersPage() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<CustomerSummaryDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      const qParam = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      apiRequest<{ customers: CustomerSummaryDTO[] }>(`/api/customers${qParam}`)
        .then((res) => setCustomers(res.customers || []))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-4 pb-12 text-[#1F1612]">
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <h1 className="text-2xl font-extrabold text-[#4A2511]">{t("customers.title")}</h1>
        <p className="mt-1 text-sm font-medium text-[#6E5444]">{t("customers.subtitle")}</p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6E5444]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            className="min-h-[54px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] pl-12 pr-4 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-lg font-bold text-[#6E5444]">
          {t("common.loading")}
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-8 text-center">
          <Users className="mx-auto h-12 w-12 text-[#CBB8A6]" />
          <p className="mt-3 text-base font-bold text-[#6E5444]">{t("customers.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <div
              key={c.id}
              className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-4 shadow-xs transition hover:border-[#CBB8A6]"
            >
              <div className="flex items-start justify-between gap-2">
                <Link to={`/customers/${c.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-lg font-extrabold text-[#4A2511]">
                      {c.fullName}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#6E5444]" />
                  </div>
                  <p className="text-sm font-bold text-[#6E5444]">{c.phone}</p>
                </Link>

                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-xs active:scale-95"
                    aria-label={`Call ${c.fullName}`}
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                )}
              </div>

              <Link
                to={`/customers/${c.id}`}
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] px-3 py-2 text-xs font-bold"
              >
                <span className="text-[#5C4538]">
                  {t("customers.ordersCount", { count: c.orderCount })}
                  {c.lastOrderDate ? ` • ${formatDateDDMMYYYY(c.lastOrderDate)}` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[#1F1612]">
                    {t("customers.spent")}: {formatINR(c.totalSpentPaise)}
                  </span>
                  {c.duesPaise > 0 && (
                    <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 font-extrabold text-amber-900">
                      {t("orders.due")}: {formatINR(c.duesPaise)}
                    </span>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
