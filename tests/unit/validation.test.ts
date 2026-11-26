import { describe, expect, it } from "vitest";
import {
  extractFirstName,
  formatDateDDMMYYYY,
  formatINR,
  sanitizeCsvCell,
} from "../../src/shared/format";
import {
  normalizeIndianPhone,
  validateSecretForRole,
} from "../../src/shared/validation";

describe("Indian phone normalization", () => {
  it("accepts 10-digit numbers and formats as +91", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
  });

  it("rejects invalid or non-Indian numbers", () => {
    expect(normalizeIndianPhone("1234567890")).toBeNull();
    expect(normalizeIndianPhone("98765")).toBeNull();
    expect(normalizeIndianPhone("abc9876543")).toBeNull();
  });
});

describe("Password & PIN rules", () => {
  it("requires 6+ digits for PIN login", () => {
    expect(validateSecretForRole("123456", true).ok).toBe(true);
    expect(validateSecretForRole("12345", true).ok).toBe(false);
    expect(validateSecretForRole("1234ab", true).ok).toBe(false);
  });

  it("requires >= 8 chars with letter and number for passwords", () => {
    expect(validateSecretForRole("Cake2026", false).ok).toBe(true);
    expect(validateSecretForRole("short1", false).ok).toBe(false);
    expect(validateSecretForRole("onlyletters", false).ok).toBe(false);
    expect(validateSecretForRole("12345678", false).ok).toBe(false);
  });
});

describe("Formatting and CSV injection protection", () => {
  it("formats INR with Indian grouping and DD/MM/YYYY dates", () => {
    expect(formatINR(12500000)).toBe("₹1,25,000");
    expect(formatINR(75050)).toBe("₹750.50");
    expect(formatDateDDMMYYYY("2026-11-25")).toBe("25/11/2026");
  });

  it("extracts only customer first name", () => {
    expect(extractFirstName("Aarav Sharma")).toBe("Aarav");
    expect(extractFirstName("  Priya  ")).toBe("Priya");
    expect(extractFirstName("")).toBe("Customer");
  });

  it("neutralizes spreadsheet formula prefixes", () => {
    expect(sanitizeCsvCell("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(sanitizeCsvCell("+1234")).toBe("'+1234");
    expect(sanitizeCsvCell("-500")).toBe("'-500");
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCsvCell("Normal Cake, 1kg")).toBe('"Normal Cake, 1kg"');
  });
});
