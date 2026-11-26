export const USER_ROLES = ["admin", "owner", "worker", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const LANGUAGES = ["en", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const ORDER_STATUSES = [
  "draft",
  "sent_to_worker",
  "completed",
  "handed_off",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_MODES = ["cash", "upi", "card", "bank_transfer"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const FULFILLMENT_TYPES = ["pickup", "delivery"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const ORDER_SOURCES = ["whatsapp", "call", "walk_in"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const TIME_SLOTS = ["morning", "afternoon", "evening", "exact"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  preferredLang: Language;
  mustChangePassword: boolean;
  pinLoginEnabled: boolean;
  ownerPhone: string | null;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  preferredLang: Language;
  mustChangePassword: boolean;
  isDisabled: boolean;
  pinLoginEnabled: boolean;
  createdAt: string;
  activeSessionCount: number;
}

export interface DeviceSessionInfo {
  id: string;
  userId: string;
  deviceLabel: string;
  ipPrefix: string;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OrderPhotoDTO {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Strictly restricted Worker DTO:
 * Contains NO prices, NO payments, NO phone numbers, NO customer last name,
 * NO delivery address, and NO internal notes.
 */
export interface WorkerOrderDTO {
  id: string;
  orderNumber: number;
  customerFirstName: string;
  status: Extract<OrderStatus, "sent_to_worker" | "completed" | "cancelled">;
  itemName: string;
  sizeWeight: string;
  flavor: string;
  isEggless: boolean;
  cakeMessage: string;
  customizationNotes: string;
  scheduledDate: string; // YYYY-MM-DD (IST)
  scheduledTime: string | null; // HH:MM
  scheduledSlot: TimeSlot;
  fulfillmentType: FulfillmentType;
  isUpdated: boolean;
  orderVersion: number;
  photos: OrderPhotoDTO[];
  updatedAt: string;
}

/**
 * Strictly restricted Viewer DTO:
 * Only orders in `completed` status awaiting handoff, plus only the fields needed to hand off.
 */
export interface ViewerHandoffOrderDTO {
  id: string;
  orderNumber: number;
  customerFullName: string;
  customerPhone: string;
  itemName: string;
  sizeWeight: string;
  flavor: string;
  isEggless: boolean;
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledSlot: TimeSlot;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  amountToCollectPaise: number;
  orderVersion: number;
  photos: OrderPhotoDTO[];
}

export interface PaymentEntryDTO {
  id: string;
  orderId: string;
  amountPaise: number;
  paymentMode: PaymentMode;
  paymentDate: string;
  isAdvance: boolean;
  recordedByName: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface OwnerOrderDTO {
  id: string;
  orderNumber: number;
  customerId: string;
  customerFirstName: string;
  customerFullName: string;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  itemName: string;
  sizeWeight: string;
  flavor: string;
  isEggless: boolean;
  cakeMessage: string;
  customizationNotes: string;
  internalNotes: string;
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledSlot: TimeSlot;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  orderSource: OrderSource;
  totalPricePaise: number;
  paidPaise: number;
  balanceDuePaise: number;
  payments: PaymentEntryDTO[];
  photos: OrderPhotoDTO[];
  orderVersion: number;
  sentToWorkerAt: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}
