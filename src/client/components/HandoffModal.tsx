import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banknote, CheckCircle2, Clock, ChevronDown, Smartphone, X } from "lucide-react";
import { apiRequest } from "../lib/api";
import { formatINR } from "../../shared/format";
import type { PaymentMode } from "../../shared/types";

export interface HandoffOrderSummary {
  id: string;
  orderNumber: number;
  customerFullName: string;
  itemName: string;
  orderVersion: number;
  balanceDuePaise: number;
}

interface HandoffModalProps {
  order: HandoffOrderSummary;
  onClose: () => void;
  onSuccess: (orderId: string) => void | Promise<void>;
  large?: boolean;
}

export function HandoffModal({ order, onClose, onSuccess, large = false }: HandoffModalProps) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);
  const [customAmountStr, setCustomAmountStr] = useState(
    String(Math.max(0, Math.round(order.balanceDuePaise / 100))),
  );
  const [customMode, setCustomMode] = useState<PaymentMode>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitHandoff = async (amountPaise: number, mode: PaymentMode) => {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/orders/${order.id}/handoff`, {
        method: "POST",
        body: JSON.stringify({
          amountCollectedPaise: amountPaise,
          paymentMode: mode,
          expectedVersion: order.orderVersion,
        }),
      });
      await onSuccess(order.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const formattedBalance = formatINR(order.balanceDuePaise);
  const hasBalance = order.balanceDuePaise > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl border-4 border-[#4A2511] bg-[#FFFDF9] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-[#E7D8C9] pb-3.5">
          <div className="min-w-0">
            <h2 className={`${large ? "text-2xl" : "text-xl"} font-black text-[#4A2511]`}>
              {t("orders.confirmHandoff")}
            </h2>
            <p className="mt-0.5 truncate text-sm font-bold text-[#6E5444]">
              #{order.orderNumber} • {order.customerFullName}
            </p>
            <p className="truncate text-xs font-semibold text-[#8C6D5A]">{order.itemName}</p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#D9C7B8] bg-white text-[#4A2511] active:scale-95 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">
            {error}
          </div>
        )}

        {!hasBalance ? (
          /* Case 1: Already Paid in Full */
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
              <div className="text-sm font-extrabold uppercase tracking-wide text-emerald-800">
                {t("orders.handoffPaidFull")}
              </div>
              <div className="mt-1 text-3xl font-black text-emerald-950">₹0</div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitHandoff(0, "cash")}
              className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-lg font-black text-white shadow-md active:scale-[0.98] disabled:opacity-60"
            >
              <CheckCircle2 className="h-6 w-6" />
              <span>{submitting ? t("common.loading") : t("orders.handoffConfirmDone")}</span>
            </button>
          </div>
        ) : !showCustom ? (
          /* Case 2: 1-Tap Payment Options */
          <div className="mt-4 space-y-3">
            <p className={`${large ? "text-lg" : "text-base"} font-extrabold text-[#1F1612]`}>
              {t("orders.handoffCollectPrompt", { amount: formattedBalance })}
            </p>

            {/* Cash 1-tap */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitHandoff(order.balanceDuePaise, "cash")}
              className={`flex ${large ? "min-h-[66px] text-xl" : "min-h-[58px] text-lg"} w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-700 px-4 font-black text-white shadow-md active:scale-[0.98] disabled:opacity-60`}
            >
              <Banknote className="h-6 w-6 shrink-0" />
              <span>{t("orders.handoffPaidCash", { amount: formattedBalance })}</span>
            </button>

            {/* UPI 1-tap */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitHandoff(order.balanceDuePaise, "upi")}
              className={`flex ${large ? "min-h-[66px] text-xl" : "min-h-[58px] text-lg"} w-full items-center justify-center gap-2.5 rounded-2xl bg-[#4A2511] px-4 font-black text-white shadow-md active:scale-[0.98] disabled:opacity-60`}
            >
              <Smartphone className="h-6 w-6 shrink-0" />
              <span>{t("orders.handoffPaidUpi", { amount: formattedBalance })}</span>
            </button>

            {/* Will Pay Later 1-tap */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitHandoff(0, "cash")}
              className={`flex ${large ? "min-h-[64px]" : "min-h-[58px]"} w-full flex-col items-center justify-center rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-2 text-amber-950 active:scale-[0.98] disabled:opacity-60`}
            >
              <span className={`flex items-center gap-2 ${large ? "text-xl" : "text-base"} font-black`}>
                <Clock className="h-5 w-5 shrink-0 text-amber-800" />
                {t("orders.willPayLater")}
              </span>
              <span className="text-xs font-bold text-amber-800">{t("orders.willPayLaterSub")}</span>
            </button>

            {/* Expand custom amount */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowCustom(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 pt-1 text-sm font-extrabold text-[#6E5444] underline-offset-4 hover:underline"
            >
              <span>{t("orders.handoffCustomAmount")}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Case 3: Custom / Partial Amount */
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-base font-black text-[#1F1612]">
                {t("orders.amountCollected")}
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={customAmountStr}
                onChange={(e) => setCustomAmountStr(e.target.value)}
                autoFocus
                className="mt-1.5 min-h-[58px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-white px-4 text-2xl font-black text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-[#1F1612]">
                {t("orders.handoffPaymentMethod")}
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(["cash", "upi"] as PaymentMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCustomMode(mode)}
                    className={`min-h-[50px] rounded-xl border-2 px-3 text-sm font-black transition ${
                      customMode === mode
                        ? "border-[#4A2511] bg-[#4A2511] text-white"
                        : "border-[#D9C7B8] bg-white text-[#5C4538]"
                    }`}
                  >
                    {mode === "cash" ? t("orders.modeCash") : t("orders.modeUpi")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCustom(false)}
                className="min-h-[52px] rounded-2xl border-2 border-[#D9C7B8] bg-white font-black text-[#6E5444] active:scale-95"
              >
                {t("common.back")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  void submitHandoff(Math.round((Number(customAmountStr) || 0) * 100), customMode)
                }
                className="min-h-[52px] rounded-2xl bg-emerald-700 font-black text-white shadow-md active:scale-95 disabled:opacity-60"
              >
                {submitting ? t("common.loading") : t("orders.handoffConfirmDone")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
