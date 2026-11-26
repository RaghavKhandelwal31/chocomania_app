import { z } from "zod";
import {
  FULFILLMENT_TYPES,
  LANGUAGES,
  ORDER_SOURCES,
  PAYMENT_MODES,
  TIME_SLOTS,
  USER_ROLES,
} from "./types";

/**
 * Normalizes an Indian mobile phone number into +91XXXXXXXXXX.
 * Accepts 10 digits (starting 6-9), or with leading 0 / +91 / spaces / hyphens.
 */
export function normalizeIndianPhone(raw: string): string | null {
  // Strip all non-digits (handles spaces, hyphens, parentheses, +91, and WhatsApp invisible marks)
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }
  return `+91${digits}`;
}

export const indianPhoneSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    const normalized = normalizeIndianPhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid 10-digit Indian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "Username must be 3-24 lowercase letters, numbers, or _");

export const loginSchema = z.object({
  username: usernameSchema,
  secret: z.string().min(6, "Enter your password or PIN").max(128),
  deviceLabel: z.string().trim().max(120).optional(),
});

export function validateSecretForRole(
  secret: string,
  pinLoginEnabled: boolean,
): { ok: true } | { ok: false; message: string } {
  if (pinLoginEnabled) {
    if (!/^\d{6,12}$/.test(secret)) {
      return { ok: false, message: "PIN must be 6 to 12 digits" };
    }
    return { ok: true };
  }
  if (secret.length < 8 || secret.length > 128) {
    return { ok: false, message: "Password must be 8 to 128 characters" };
  }
  const hasLetter = /[A-Za-z]/.test(secret);
  const hasNumber = /\d/.test(secret);
  if (!hasLetter || !hasNumber) {
    return { ok: false, message: "Password must include at least one letter and one number" };
  }
  return { ok: true };
}

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(USER_ROLES),
  preferredLang: z.enum(LANGUAGES).default("en"),
  pinLoginEnabled: z.boolean().default(false),
  initialSecret: z.string().min(6).max(128),
});

export const resetPasswordSchema = z.object({
  newSecret: z.string().min(6).max(128),
  forceChange: z.boolean().default(true),
});

export const changePasswordSchema = z.object({
  currentSecret: z.string().min(6).max(128),
  newSecret: z.string().min(6).max(128),
});

export const updateLanguageSchema = z.object({
  preferredLang: z.enum(LANGUAGES),
});

export const updateSettingsSchema = z.object({
  ownerPhone: indianPhoneSchema,
});

export const orderInputSchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  customerPhone: indianPhoneSchema,
  itemName: z.string().trim().min(1).max(100),
  sizeWeight: z.string().trim().max(40).default(""),
  flavor: z.string().trim().max(60).default(""),
  isEggless: z.boolean().default(true),
  cakeMessage: z.string().trim().max(160).default(""),
  customizationNotes: z.string().trim().max(500).default(""),
  internalNotes: z.string().trim().max(500).default(""),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  scheduledSlot: z.enum(TIME_SLOTS).default("afternoon"),
  fulfillmentType: z.enum(FULFILLMENT_TYPES).default("pickup"),
  deliveryAddress: z.string().trim().max(300).default(""),
  orderSource: z.enum(ORDER_SOURCES).default("whatsapp"),
  totalPricePaise: z.number().int().min(0).max(100_000_000),
  advancePaidPaise: z.number().int().min(0).max(100_000_000).default(0),
  advancePaymentMode: z.enum(PAYMENT_MODES).default("cash"),
  sendToWorker: z.boolean().default(false),
  expectedVersion: z.number().int().min(1).optional(),
});

export const handoffConfirmSchema = z.object({
  amountCollectedPaise: z.number().int().min(0).max(100_000_000),
  paymentMode: z.enum(PAYMENT_MODES),
  expectedVersion: z.number().int().min(1),
});

export const paymentInputSchema = z.object({
  amountPaise: z.number().int().min(1).max(100_000_000),
  paymentMode: z.enum(PAYMENT_MODES),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isAdvance: z.boolean().default(false),
});
