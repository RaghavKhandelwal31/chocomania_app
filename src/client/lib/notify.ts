import type { OwnerOrderDTO } from "../../shared/types";

export function buildNotifyMessage(order: OwnerOrderDTO): string {
  const remainingRupees = Number((order.balanceDuePaise / 100).toFixed(2));
  if (remainingRupees > 0) {
    const upiLink = `upi://pay?pa=7000671411@icici&am=${remainingRupees}&cu=INR&tn=${encodeURIComponent(order.customerFullName)}`;
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

export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
