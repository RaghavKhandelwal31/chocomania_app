import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Bell, Check, Edit3, Phone, Save } from "lucide-react";
import { apiRequest } from "../lib/api";
import { DueReminderModal } from "../components/DueReminderModal";
import { formatDateDDMMYYYY, formatINR } from "../../shared/format";
import type { CustomerProfileDTO } from "../../shared/types";

export function CustomerProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [customer, setCustomer] = useState<CustomerProfileDTO | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiRequest<{ customer: CustomerProfileDTO }>(`/api/customers/${id}`)
      .then((res) => {
        setCustomer(res.customer);
        setNotes(res.customer.notes || "");
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      await apiRequest(`/api/customers/${id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-lg font-bold text-[#6E5444]">
        {t("common.loading")}
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/customers")}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#D9C7B8] bg-white px-3 text-sm font-bold text-[#4A2511] shadow-2xs active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </button>
        <p className="text-center font-bold text-[#6E5444]">{t("customers.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4 text-[#1F1612]">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/customers")}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#D9C7B8] bg-white px-3 text-sm font-bold text-[#4A2511] shadow-2xs active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </button>
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-sm font-extrabold text-white shadow-xs active:scale-95"
          >
            <Phone className="h-4 w-4" />
            <span>{t("orders.call")}</span>
          </a>
        )}
      </div>

      {/* Customer Header & Stats */}
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <h1 className="text-2xl font-extrabold text-[#4A2511]">{customer.fullName}</h1>
        <p className="mt-0.5 text-base font-bold text-[#6E5444]">{customer.phone}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-[#FFFDF9] p-3 border border-[#EFE5DB]">
            <div className="text-xs font-bold text-[#6E5444]">{t("nav.orders")}</div>
            <div className="mt-1 text-xl font-black text-[#4A2511]">{customer.orderCount}</div>
          </div>
          <div className="rounded-2xl bg-[#FFFDF9] p-3 border border-[#EFE5DB]">
            <div className="text-xs font-bold text-[#6E5444]">{t("customers.spent")}</div>
            <div className="mt-1 text-lg font-black text-[#1F1612]">
              {formatINR(customer.totalSpentPaise)}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3 border border-amber-200">
            <div className="text-xs font-bold text-amber-900">{t("orders.due")}</div>
            <div className="mt-1 text-lg font-black text-amber-950">
              {formatINR(customer.duesPaise)}
            </div>
          </div>
        </div>

        {customer.duesPaise > 0 && (
          <button
            type="button"
            onClick={() => setShowReminder(true)}
            className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-700 bg-emerald-50 text-base font-extrabold text-emerald-900 active:scale-95"
          >
            <Bell className="h-5 w-5" />
            <span>{t("customers.sendReminder")}</span>
          </button>
        )}
      </div>

      {/* Editable Private Notes */}
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <label htmlFor="customerNotes" className="block text-lg font-extrabold text-[#4A2511]">
          {t("customers.privateNotes")}
        </label>
        <textarea
          id="customerNotes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("customers.notesPlaceholder")}
          className="mt-2 w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
        />
        <button
          type="button"
          disabled={savingNotes}
          onClick={() => void handleSaveNotes()}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4A2511] text-base font-extrabold text-white active:scale-95 disabled:opacity-60"
        >
          {notesSaved ? <Check className="h-5 w-5" /> : <Save className="h-5 w-5" />}
          <span>{notesSaved ? t("customers.notesSaved") : t("common.save")}</span>
        </button>
      </div>

      {/* Order History */}
      <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-xs">
        <h2 className="text-lg font-extrabold text-[#4A2511]">{t("customers.orderHistory")}</h2>
        <div className="mt-3 space-y-3">
          {customer.orders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-[#EFE5DB] bg-[#FFFDF9] p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-extrabold text-[#4A2511]">#{order.orderNumber}</span>{" "}
                  <span className="font-bold text-[#1F1612]">{order.itemName}</span>
                  <div className="mt-0.5 text-xs font-bold text-[#6E5444]">
                    {formatDateDDMMYYYY(order.scheduledDate)} • {order.status}
                  </div>
                </div>
                <div className="text-right text-sm font-extrabold">
                  <div>{formatINR(order.totalPricePaise)}</div>
                  {order.balanceDuePaise > 0 && (
                    <div className="text-xs text-amber-800">
                      {t("orders.due")}: {formatINR(order.balanceDuePaise)}
                    </div>
                  )}
                </div>
              </div>
              {order.status !== "handed_off" && order.status !== "cancelled" && (
                <div className="mt-2 flex justify-end">
                  <Link
                    to={`/orders/${order.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#CBB8A6] bg-white px-3 py-1.5 text-xs font-extrabold text-[#4A2511]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>{t("common.edit")}</span>
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showReminder && (
        <DueReminderModal
          customerName={customer.fullName}
          customerPhone={customer.phone}
          duesPaise={customer.duesPaise}
          onClose={() => setShowReminder(false)}
        />
      )}
    </div>
  );
}
