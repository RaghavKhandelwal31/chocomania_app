const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Formats integer paise into Indian Rupee format (e.g. ₹1,25,000 or ₹1,250.50).
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasDecimals = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(rupees);
}

/**
 * Formats YYYY-MM-DD to DD/MM/YYYY without timezone drift.
 */
export function formatDateDDMMYYYY(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Returns today's date string (YYYY-MM-DD) in Asia/Kolkata.
 */
export function getTodayIST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * Adds N calendar days to a YYYY-MM-DD string safely using UTC noon math.
 */
export function addDaysYYYYMMDD(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Formats HH:MM (24h) into 12-hour readable time (e.g. "5:30 PM").
 */
export function formatTime12h(hhmm: string | null): string {
  if (!hhmm) return "";
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Extracts first name safely for Worker views and production slips.
 */
export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Customer";
  const first = trimmed.split(/\s+/)[0];
  return first || "Customer";
}

/**
 * Escapes and neutralizes CSV formula injection (cells starting with =, +, -, @, tab, CR).
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const trimmedStart = raw.replace(/^[\s\uFEFF\xA0]+/, "");
  const safe =
    /^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(trimmedStart) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
