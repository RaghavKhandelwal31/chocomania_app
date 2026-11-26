import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Calendar, Check, Clock, RotateCcw, Send, Sparkles, XCircle } from "lucide-react";
import { apiRequest } from "../lib/api";
import { addDaysYYYYMMDD, formatINR, getTodayIST } from "../../shared/format";
import type {
  FulfillmentType,
  OrderSource,
  OrderStatus,
  OwnerOrderDTO,
  PaymentMode,
  TimeSlot,
} from "../../shared/types";

export function OrderFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: editOrderId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editOrderId);

  const todayStr = getTodayIST();
  const tomorrowStr = addDaysYYYYMMDD(todayStr, 1);
  const dayAfterStr = addDaysYYYYMMDD(todayStr, 2);

  const [loadingOrder, setLoadingOrder] = useState(isEditMode);
  const [editOrderNumber, setEditOrderNumber] = useState<number | null>(null);
  const [editOrderStatus, setEditOrderStatus] = useState<OrderStatus>("draft");
  const [editOrderVersion, setEditOrderVersion] = useState<number | undefined>(undefined);
  const [existingPaidPaise, setExistingPaidPaise] = useState(0);

  // Form states
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [repeatOrderData, setRepeatOrderData] = useState<{
    itemName: string;
    sizeWeight: string;
    flavor: string;
    isEggless: boolean;
    fulfillmentType: FulfillmentType;
    deliveryAddress: string;
  } | null>(null);

  const [itemName, setItemName] = useState("");
  const [popularItems, setPopularItems] = useState<string[]>([]);
  const [sizeWeight, setSizeWeight] = useState("1 kg");
  const [flavor, setFlavor] = useState("");
  const [isEggless, setIsEggless] = useState(true);
  const [cakeMessage, setCakeMessage] = useState("");
  const [customizationNotes, setCustomizationNotes] = useState("");

  const [scheduledDate, setScheduledDate] = useState(todayStr);
  const [scheduledSlot, setScheduledSlot] = useState<TimeSlot>("afternoon");
  const [scheduledTime, setScheduledTime] = useState<string>("");

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderSource, setOrderSource] = useState<OrderSource>("whatsapp");

  const [totalPriceStr, setTotalPriceStr] = useState("");
  const [advancePaidStr, setAdvancePaidStr] = useState("");
  const [advancePaymentMode, setAdvancePaymentMode] = useState<PaymentMode>("cash");
  const [internalNotes, setInternalNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load popular item chips
  useEffect(() => {
    apiRequest<{ items: string[] }>("/api/orders/recent-items")
      .then((res) => {
        if (res.items && res.items.length > 0) {
          setPopularItems(res.items);
        }
      })
      .catch(() => undefined);
  }, []);

  // Load existing order in edit mode
  useEffect(() => {
    if (!editOrderId) return;
    setLoadingOrder(true);
    apiRequest<{ order: OwnerOrderDTO }>(`/api/orders/${editOrderId}`)
      .then(({ order }) => {
        setEditOrderNumber(order.orderNumber);
        setEditOrderStatus(order.status);
        setEditOrderVersion(order.orderVersion);
        setExistingPaidPaise(order.paidPaise);

        setCustomerPhone(order.customerPhone.replace(/^\+91/, ""));
        setCustomerName(order.customerFullName);
        setItemName(order.itemName);
        setSizeWeight(order.sizeWeight);
        setFlavor(order.flavor);
        setIsEggless(order.isEggless);
        setCakeMessage(order.cakeMessage);
        setCustomizationNotes(order.customizationNotes);
        setScheduledDate(order.scheduledDate);
        setScheduledSlot(order.scheduledSlot);
        setScheduledTime(order.scheduledTime ?? "");
        setFulfillmentType(order.fulfillmentType);
        setDeliveryAddress(order.deliveryAddress);
        setOrderSource(order.orderSource);
        setTotalPriceStr(order.totalPricePaise ? String(order.totalPricePaise / 100) : "");
        setInternalNotes(order.internalNotes);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("common.errorGeneric"));
      })
      .finally(() => setLoadingOrder(false));
  }, [editOrderId, t]);

  // Customer phone auto-lookup (only in create mode)
  useEffect(() => {
    if (isEditMode) return;
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length === 10) {
      apiRequest<{
        customer: {
          id: string;
          fullName: string;
          recentOrder: {
            itemName: string;
            sizeWeight: string;
            flavor: string;
            isEggless: boolean;
            fulfillmentType: FulfillmentType;
            deliveryAddress: string;
          } | null;
        } | null;
      }>(`/api/orders/customer-lookup?phone=${digits}`)
        .then((res) => {
          if (res.customer) {
            setCustomerName(res.customer.fullName);
            if (res.customer.recentOrder) {
              setRepeatOrderData(res.customer.recentOrder);
            }
          }
        })
        .catch(() => undefined);
    } else {
      setRepeatOrderData(null);
    }
  }, [customerPhone]);

  const handleRepeatOrder = () => {
    if (!repeatOrderData) return;
    setItemName(repeatOrderData.itemName);
    setSizeWeight(repeatOrderData.sizeWeight);
    setFlavor(repeatOrderData.flavor);
    setIsEggless(repeatOrderData.isEggless);
    setFulfillmentType(repeatOrderData.fulfillmentType);
    if (repeatOrderData.deliveryAddress) {
      setDeliveryAddress(repeatOrderData.deliveryAddress);
    }
  };

  const totalPricePaise = Math.round((Number(totalPriceStr) || 0) * 100);
  const advancePaidPaise = isEditMode
    ? existingPaidPaise
    : Math.round((Number(advancePaidStr) || 0) * 100);
  const balanceDuePaise = Math.max(0, totalPricePaise - advancePaidPaise);

  const handleSubmit = async (sendToWorker: boolean) => {
    setError(null);
    if (!customerPhone.trim()) {
      setError(t("orders.customerPhone") + " is required");
      return;
    }
    if (!customerName.trim()) {
      setError(t("orders.customerName") + " is required");
      return;
    }
    if (!itemName.trim()) {
      setError(t("orders.item") + " is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        itemName: itemName.trim(),
        sizeWeight: sizeWeight.trim(),
        flavor: flavor.trim(),
        isEggless,
        cakeMessage: cakeMessage.trim(),
        customizationNotes: customizationNotes.trim(),
        internalNotes: internalNotes.trim(),
        scheduledDate,
        scheduledTime: scheduledSlot === "exact" && scheduledTime ? scheduledTime : null,
        scheduledSlot,
        fulfillmentType,
        deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : "",
        orderSource,
        totalPricePaise,
        advancePaidPaise: isEditMode ? 0 : advancePaidPaise,
        advancePaymentMode,
        sendToWorker,
        expectedVersion: editOrderVersion,
      };

      if (isEditMode && editOrderId) {
        await apiRequest(`/api/orders/${editOrderId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest<{ orderId: string; orderNumber: number }>("/api/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      navigate("/orders");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.errorGeneric");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!editOrderId || !window.confirm(t("orders.confirmCancelOrder"))) return;
    setSubmitting(true);
    try {
      await apiRequest(`/api/orders/${editOrderId}/cancel`, { method: "POST" });
      navigate("/orders");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.errorGeneric"));
      setSubmitting(false);
    }
  };

  if (loadingOrder) {
    return (
      <div className="py-12 text-center text-lg font-bold text-[#6E5444]">{t("common.loading")}</div>
    );
  }

  return (
    <div className="pb-16 text-[#1F1612]">
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#D9C7B8] bg-white px-3 py-2 text-base font-bold text-[#4A2511] active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>{t("common.back")}</span>
        </button>
        <h1 className="text-xl font-extrabold text-[#4A2511]">
          {isEditMode
            ? t("orders.editOrderTitle", { number: editOrderNumber ?? "" })
            : t("orders.newOrderTitle")}
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-base font-bold text-red-900"
        >
          {error}
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* Section 1: Customer */}
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-[#4A2511]">{t("orders.customerSection")}</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="customerPhone" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.customerPhone")} <span className="text-red-600">*</span>
              </label>
              <input
                id="customerPhone"
                type="tel"
                inputMode="numeric"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t("orders.customerPhonePlaceholder")}
                className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-lg font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="customerName" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.customerName")} <span className="text-red-600">*</span>
              </label>
              <input
                id="customerName"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t("orders.customerNamePlaceholder")}
                className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-lg font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>

            {repeatOrderData && (
              <button
                type="button"
                onClick={handleRepeatOrder}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#4A2511] bg-[#FBF4EC] px-4 text-base font-extrabold text-[#4A2511] active:scale-95"
              >
                <RotateCcw className="h-5 w-5" />
                <span>
                  {t("orders.repeatOrderBtn")} ({repeatOrderData.itemName})
                </span>
              </button>
            )}

            <div>
              <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.source")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["whatsapp", "call", "walk_in"] as OrderSource[]).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setOrderSource(src)}
                    className={`min-h-[50px] rounded-2xl border-2 px-2 text-sm font-extrabold transition ${
                      orderSource === src
                        ? "border-[#4A2511] bg-[#4A2511] text-white"
                        : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                    }`}
                  >
                    {src === "whatsapp" && t("orders.sourceWhatsapp")}
                    {src === "call" && t("orders.sourceCall")}
                    {src === "walk_in" && t("orders.sourceWalkIn")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Cake / Item Details */}
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-[#4A2511]">{t("orders.orderDetailsSection")}</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="itemName" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.item")} <span className="text-red-600">*</span>
              </label>
              <input
                id="itemName"
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("orders.itemPlaceholder")}
                className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-lg font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />

              {popularItems.length > 0 && (
                <div className="mt-2.5">
                  <span className="text-xs font-bold text-[#6E5444]">{t("orders.quickItems")}</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {popularItems.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setItemName(item)}
                        className="inline-flex min-h-[38px] items-center rounded-xl border border-[#CBB8A6] bg-[#FFFDF9] px-3 py-1 text-xs font-bold text-[#4A2511] hover:bg-[#FBF4EC] active:scale-95"
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5 text-amber-600" />
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.sizeWeight")}</label>
                <input
                  type="text"
                  value={sizeWeight}
                  onChange={(e) => setSizeWeight(e.target.value)}
                  placeholder={t("orders.sizeWeightPlaceholder")}
                  className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
                <div className="mt-1 flex gap-1">
                  {["500g", "1 kg", "1.5 kg", "2 kg"].map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setSizeWeight(sw)}
                      className="rounded-lg border border-[#D9C7B8] bg-white px-2 py-0.5 text-xs font-bold text-[#5C4538]"
                    >
                      {sw}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.flavor")}</label>
                <input
                  type="text"
                  value={flavor}
                  onChange={(e) => setFlavor(e.target.value)}
                  placeholder={t("orders.flavorPlaceholder")}
                  className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
              </div>
            </div>

            {/* Eggless Toggle */}
            <div>
              <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.eggless")}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsEggless(true)}
                  className={`flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border-2 font-extrabold transition ${
                    isEggless
                      ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#6E5444]"
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm border-2 border-emerald-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />
                  </span>
                  <span>{t("orders.egglessYes")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEggless(false)}
                  className={`flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border-2 font-extrabold transition ${
                    !isEggless
                      ? "border-amber-700 bg-amber-50 text-amber-900"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#6E5444]"
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm border-2 border-amber-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-700" />
                  </span>
                  <span>{t("orders.egglessNo")}</span>
                </button>
              </div>
            </div>

            {/* Cake Message */}
            <div>
              <label htmlFor="cakeMessage" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.cakeMessage")}
              </label>
              <input
                id="cakeMessage"
                type="text"
                value={cakeMessage}
                onChange={(e) => setCakeMessage(e.target.value)}
                placeholder={t("orders.cakeMessagePlaceholder")}
                className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>

            {/* Customization */}
            <div>
              <label htmlFor="customizationNotes" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.customization")}
              </label>
              <textarea
                id="customizationNotes"
                rows={2}
                value={customizationNotes}
                onChange={(e) => setCustomizationNotes(e.target.value)}
                placeholder={t("orders.customizationPlaceholder")}
                className="w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Schedule & Delivery */}
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-[#4A2511]">{t("orders.scheduleSection")}</h2>

          <div className="mt-4 space-y-4">
            {/* Date Quick picks */}
            <div>
              <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.scheduledDate")}</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduledDate(todayStr)}
                  className={`min-h-[52px] rounded-2xl border-2 font-extrabold transition ${
                    scheduledDate === todayStr
                      ? "border-[#4A2511] bg-[#4A2511] text-white"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                  }`}
                >
                  {t("orders.today")}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduledDate(tomorrowStr)}
                  className={`min-h-[52px] rounded-2xl border-2 font-extrabold transition ${
                    scheduledDate === tomorrowStr
                      ? "border-[#4A2511] bg-[#4A2511] text-white"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                  }`}
                >
                  {t("orders.tomorrow")}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduledDate(dayAfterStr)}
                  className={`min-h-[52px] rounded-2xl border-2 font-extrabold transition ${
                    scheduledDate === dayAfterStr
                      ? "border-[#4A2511] bg-[#4A2511] text-white"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                  }`}
                >
                  {t("orders.dayAfter")}
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#6E5444]" />
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="min-h-[48px] flex-1 rounded-xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-3 font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
              </div>
            </div>

            {/* Time slot */}
            <div>
              <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.timeSlot")}</label>
              <div className="grid grid-cols-2 gap-2">
                {(["morning", "afternoon", "evening", "exact"] as TimeSlot[]).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setScheduledSlot(slot)}
                    className={`min-h-[50px] rounded-2xl border-2 px-2 text-xs font-extrabold transition ${
                      scheduledSlot === slot
                        ? "border-[#4A2511] bg-[#4A2511] text-white"
                        : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                    }`}
                  >
                    {slot === "morning" && t("orders.morning")}
                    {slot === "afternoon" && t("orders.afternoon")}
                    {slot === "evening" && t("orders.evening")}
                    {slot === "exact" && t("orders.exactTime")}
                  </button>
                ))}
              </div>

              {scheduledSlot === "exact" && (
                <div className="mt-2 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#6E5444]" />
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="min-h-[48px] flex-1 rounded-xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-3 font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Fulfillment type */}
            <div>
              <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.fulfillment")}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillmentType("pickup")}
                  className={`min-h-[54px] rounded-2xl border-2 font-extrabold transition ${
                    fulfillmentType === "pickup"
                      ? "border-[#4A2511] bg-[#4A2511] text-white"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                  }`}
                >
                  {t("orders.pickup")}
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType("delivery")}
                  className={`min-h-[54px] rounded-2xl border-2 font-extrabold transition ${
                    fulfillmentType === "delivery"
                      ? "border-[#4A2511] bg-[#4A2511] text-white"
                      : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                  }`}
                >
                  {t("orders.delivery")}
                </button>
              </div>

              {fulfillmentType === "delivery" && (
                <div className="mt-3">
                  <label htmlFor="deliveryAddress" className="mb-1 block text-base font-bold text-[#1F1612]">
                    {t("orders.deliveryAddress")}
                  </label>
                  <textarea
                    id="deliveryAddress"
                    rows={2}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder={t("orders.deliveryAddressPlaceholder")}
                    className="w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Pricing & Advance (Owner only) */}
        <div className="rounded-3xl border-2 border-[#E7D8C9] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-[#4A2511]">{t("orders.pricingSection")}</h2>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="totalPrice" className="mb-1 block text-base font-bold text-[#1F1612]">
                  {t("orders.totalPrice")}
                </label>
                <input
                  id="totalPrice"
                  type="number"
                  inputMode="numeric"
                  value={totalPriceStr}
                  onChange={(e) => setTotalPriceStr(e.target.value)}
                  placeholder="0"
                  className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-xl font-extrabold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                />
              </div>

              {!isEditMode ? (
                <div>
                  <label htmlFor="advancePaid" className="mb-1 block text-base font-bold text-[#1F1612]">
                    {t("orders.advancePaid")}
                  </label>
                  <input
                    id="advancePaid"
                    type="number"
                    inputMode="numeric"
                    value={advancePaidStr}
                    onChange={(e) => setAdvancePaidStr(e.target.value)}
                    placeholder="0"
                    className="min-h-[56px] w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] px-4 text-xl font-extrabold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <span className="mb-1 block text-base font-bold text-[#1F1612]">
                    {t("orders.paid")}
                  </span>
                  <div className="flex min-h-[56px] items-center rounded-2xl border-2 border-[#E7D8C9] bg-[#FBF4EC] px-4 text-xl font-extrabold text-emerald-800">
                    {formatINR(existingPaidPaise)}
                  </div>
                </div>
              )}
            </div>

            {/* Balance Due calculation badge */}
            <div className="flex items-center justify-between rounded-2xl border border-[#D9C7B8] bg-[#FBF4EC] p-3">
              <span className="text-base font-bold text-[#5C4538]">{t("orders.balanceDue")}:</span>
              <span className="text-xl font-extrabold text-[#4A2511]">{formatINR(balanceDuePaise)}</span>
            </div>

            {Number(advancePaidStr) > 0 && (
              <div>
                <label className="mb-1 block text-base font-bold text-[#1F1612]">{t("orders.paymentMode")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["cash", "upi", "card", "bank_transfer"] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAdvancePaymentMode(mode)}
                      className={`min-h-[46px] rounded-xl border-2 px-1 text-xs font-extrabold transition ${
                        advancePaymentMode === mode
                          ? "border-[#4A2511] bg-[#4A2511] text-white"
                          : "border-[#D9C7B8] bg-[#FFFDF9] text-[#5C4538]"
                      }`}
                    >
                      {mode === "cash" && t("orders.modeCash")}
                      {mode === "upi" && t("orders.modeUpi")}
                      {mode === "card" && t("orders.modeCard")}
                      {mode === "bank_transfer" && t("orders.modeBank")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="internalNotes" className="mb-1 block text-base font-bold text-[#1F1612]">
                {t("orders.internalNotes")}
              </label>
              <textarea
                id="internalNotes"
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder={t("orders.internalNotesPlaceholder")}
                className="w-full rounded-2xl border-2 border-[#CBB8A6] bg-[#FFFDF9] p-3 text-base font-semibold text-[#1F1612] focus:border-[#4A2511] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Big Action Buttons */}
        <div className="space-y-3 pt-2">
          {!isEditMode || editOrderStatus === "draft" ? (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit(true)}
                className="flex min-h-[62px] w-full items-center justify-center gap-3 rounded-2xl bg-[#4A2511] text-xl font-extrabold text-white shadow-md active:scale-[0.99] disabled:opacity-60"
              >
                <Send className="h-6 w-6" />
                <span>{submitting ? t("orders.submitting") : t("orders.sendToWorkshop")}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit(false)}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#CBB8A6] bg-white text-lg font-bold text-[#4A2511] active:scale-[0.99] disabled:opacity-60"
              >
                <Check className="h-5 w-5" />
                <span>{t("orders.saveDraft")}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit(true)}
              className="flex min-h-[62px] w-full items-center justify-center gap-3 rounded-2xl bg-[#4A2511] text-xl font-extrabold text-white shadow-md active:scale-[0.99] disabled:opacity-60"
            >
              <Check className="h-6 w-6" />
              <span>{submitting ? t("orders.submitting") : t("orders.saveChanges")}</span>
            </button>
          )}

          {isEditMode && editOrderStatus !== "handed_off" && editOrderStatus !== "cancelled" && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCancelOrder()}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-300 bg-red-50 text-base font-extrabold text-red-800 active:scale-[0.99] disabled:opacity-60"
            >
              <XCircle className="h-5 w-5" />
              <span>{t("orders.cancelOrder")}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
