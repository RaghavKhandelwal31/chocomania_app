import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, MessageCircle } from "lucide-react";
import { buildCustomerDueReminderMessage, buildWhatsappUrl } from "../lib/notify";

export function DueReminderModal({
  customerName,
  customerPhone,
  duesPaise,
  onClose,
}: {
  customerName: string;
  customerPhone: string;
  duesPaise: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(() =>
    buildCustomerDueReminderMessage(customerName, duesPaise),
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border-4 border-[#4A2511] bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-black text-[#4A2511]">{t("customers.reminderTitle")}</h2>
        <p className="mt-1 font-bold text-[#6E5444]">
          {customerName} {customerPhone ? `(${customerPhone})` : ""}
        </p>

        <textarea
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-4 w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-sm font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
        />

        <div className="mt-4 space-y-2.5">
          <a
            href={buildWhatsappUrl(customerPhone, message)}
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
              onClick={() => void handleCopy()}
              className="flex min-h-[50px] items-center justify-center gap-1.5 rounded-2xl border-2 border-[#4A2511] bg-[#FBF4EC] font-extrabold text-[#4A2511] active:scale-95"
            >
              {copied ? <Check className="h-5 w-5 text-emerald-700" /> : <Copy className="h-5 w-5" />}
              <span>{copied ? t("orders.copied") : t("orders.copyMessage")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[50px] rounded-2xl border-2 border-[#D9C7B8] font-extrabold text-[#6E5444] active:scale-95"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
