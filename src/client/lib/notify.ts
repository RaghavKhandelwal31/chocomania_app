import type { OwnerOrderDTO } from "../../shared/types";

export function buildNotifyMessage(order: OwnerOrderDTO): string {
  const remainingRupees = Number((order.balanceDuePaise / 100).toFixed(2));
  if (remainingRupees > 0) {
    const upiLink = `upi://pay?pa=7000671411@icici&am=${remainingRupees}&cu=INR&tn=${encodeURIComponent(order.itemName)}`;
    return [
      `Hello ${order.customerFullName}! 👋`,
      "",
      "Your order is ready! 🎉",
      "",
      `Amount to pay: ₹${remainingRupees}`,
      "",
      "You can pay securely using the link below:",
      "",
      `👉 ${upiLink}`,
      "",
      "Thank you for ordering! 🍫",
    ].join("\n");
  }
  return [
    `Hello ${order.customerFullName}! 👋`,
    "",
    `Your order (#${order.orderNumber} - ${order.itemName}) is ready! 🎉`,
    "",
    "Thank you for ordering! 🍫",
  ].join("\n");
}

export function buildCustomerDueReminderMessage(
  customerFullName: string,
  duesPaise: number,
): string {
  const dueRupees = Number((duesPaise / 100).toFixed(2));
  const upiLink = `upi://pay?pa=7000671411@icici&am=${dueRupees}&cu=INR&tn=${encodeURIComponent("Remaining Balance")}`;
  return [
    `Hello ${customerFullName}! 👋`,
    "",
    "This is a gentle reminder about your pending payment.",
    "",
    `Total due amount: ₹${dueRupees}`,
    "",
    "You can clear it easily using the link below:",
    "",
    `👉 ${upiLink}`,
  ].join("\n");
}

export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
