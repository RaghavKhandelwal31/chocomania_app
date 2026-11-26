import type { OwnerOrderDTO } from "../../shared/types";

export function buildNotifyMessage(order: OwnerOrderDTO): string {
  const remainingRupees = Number((order.balanceDuePaise / 100).toFixed(2));
  if (remainingRupees > 0) {
    return [
      "Hey! Your Chocomania order is ready 🎂✨",
      "",
      "Just sharing the order value and UPI link here for your reference",
      `₹${remainingRupees}`,
      "chocomania@ybl",
      "",
      "You can pay now, or while collecting your cake, whichever is easier for you.",
      "",
      "Thank you for choosing us! 🍫",
      "Visit chocomania.in to explore more treats and share your feedback.",
    ].join("\n");
  }
  return [
    "Hey! Your Chocomania order is ready 🎂✨",
    "",
    `Your ${order.itemName} is ready!`,
    "",
    "Thank you for choosing us! 🍫",
    "Visit chocomania.in to explore more treats and share your feedback.",
  ].join("\n");
}

export function buildCustomerDueReminderMessage(
  _customerFullName: string,
  duesPaise: number,
): string {
  const dueRupees = Number((duesPaise / 100).toFixed(2));
  return [
    "Hey! Hope you enjoyed your Chocomania order! We'd love to know how you liked it ✨",
    "",
    "Just sharing the order value and UPI link here for your reference",
    `₹${dueRupees}`,
    "",
    "chocomania@ybl",
    "",
    "Thank you for choosing us! 🍫",
    "Visit chocomania.in to explore more treats and share your feedback.",
  ].join("\n");
}

export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
