import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, X } from "lucide-react";

interface PriceCalculatorModalProps {
  initialValue: string;
  onApply: (value: string) => void;
  onClose: () => void;
}

const OPERATORS = new Set(["+", "-", "×", "÷"]);

/**
 * Safely evaluates a basic arithmetic expression (+, -, ×, ÷) with standard operator precedence.
 */
function evaluateExpression(expr: string): number | null {
  const tokens: string[] = [];
  let currentNum = "";

  for (const ch of expr) {
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      currentNum += ch;
    } else if (OPERATORS.has(ch)) {
      if (currentNum === "" && ch === "-" && tokens.length === 0) {
        currentNum = "-";
      } else if (currentNum !== "") {
        tokens.push(currentNum);
        tokens.push(ch);
        currentNum = "";
      } else {
        const lastTok = tokens[tokens.length - 1];
        if (lastTok !== undefined && OPERATORS.has(lastTok)) {
          tokens[tokens.length - 1] = ch;
        }
      }
    }
  }
  if (currentNum !== "" && currentNum !== "-") {
    tokens.push(currentNum);
  }
  if (tokens.length === 0) return null;
  const tailTok = tokens[tokens.length - 1];
  if (tailTok !== undefined && OPERATORS.has(tailTok)) {
    tokens.pop();
  }
  if (tokens.length === 0) return null;

  // Pass 1: × and ÷
  const pass1: (number | string)[] = [];
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === undefined) break;
    if (tok === "×" || tok === "÷") {
      const left = Number(pass1.pop());
      const right = Number(tokens[idx + 1]);
      if (Number.isNaN(left) || Number.isNaN(right)) return null;
      if (tok === "÷" && right === 0) return null;
      pass1.push(tok === "×" ? left * right : left / right);
      idx += 2;
    } else {
      pass1.push(idx % 2 === 0 ? Number(tok) : tok);
      idx += 1;
    }
  }

  // Pass 2: + and -
  let result = Number(pass1[0]);
  if (Number.isNaN(result)) return null;
  for (let i = 1; i < pass1.length; i += 2) {
    const op = pass1[i];
    const right = Number(pass1[i + 1]);
    if (Number.isNaN(right)) return null;
    if (op === "+") result += right;
    else if (op === "-") result -= right;
  }

  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
}

export function PriceCalculatorModal({
  initialValue,
  onApply,
  onClose,
}: PriceCalculatorModalProps) {
  const { t } = useTranslation();
  const cleanInitial = initialValue && Number(initialValue) > 0 ? initialValue : "";
  const [expr, setExpr] = useState(cleanInitial);

  const preview = evaluateExpression(expr);

  const appendDigit = (digit: string) => {
    setExpr((prev) => {
      if (digit === ".") {
        const parts = prev.split(/[+\-×÷]/);
        const lastPart = parts[parts.length - 1] ?? "";
        if (lastPart.includes(".")) return prev;
        return prev === "" || OPERATORS.has(prev.slice(-1)) ? `${prev}0.` : `${prev}.`;
      }
      return prev + digit;
    });
  };

  const appendOperator = (op: string) => {
    setExpr((prev) => {
      if (prev === "") return op === "-" ? "-" : "";
      if (OPERATORS.has(prev.slice(-1))) {
        return prev.slice(0, -1) + op;
      }
      return prev + op;
    });
  };

  const handleEquals = () => {
    if (preview !== null) {
      setExpr(String(preview));
    }
  };

  const handleUseAmount = () => {
    if (preview !== null && preview >= 0) {
      onApply(String(Math.round(preview)));
    } else {
      onApply("0");
    }
  };

  const buttons: { label: string; onClick: () => void; style: string }[] = [
    { label: "C", onClick: () => setExpr(""), style: "bg-red-50 text-red-800 border-red-200" },
    { label: "÷", onClick: () => appendOperator("÷"), style: "bg-[#FBF4EC] text-[#4A2511] border-[#D9C7B8]" },
    { label: "×", onClick: () => appendOperator("×"), style: "bg-[#FBF4EC] text-[#4A2511] border-[#D9C7B8]" },
    { label: "⌫", onClick: () => setExpr((p) => p.slice(0, -1)), style: "bg-[#FBF4EC] text-[#4A2511] border-[#D9C7B8]" },

    { label: "7", onClick: () => appendDigit("7"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "8", onClick: () => appendDigit("8"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "9", onClick: () => appendDigit("9"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "-", onClick: () => appendOperator("-"), style: "bg-[#FBF4EC] text-[#4A2511] border-[#D9C7B8]" },

    { label: "4", onClick: () => appendDigit("4"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "5", onClick: () => appendDigit("5"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "6", onClick: () => appendDigit("6"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "+", onClick: () => appendOperator("+"), style: "bg-[#FBF4EC] text-[#4A2511] border-[#D9C7B8]" },

    { label: "1", onClick: () => appendDigit("1"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "2", onClick: () => appendDigit("2"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "3", onClick: () => appendDigit("3"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: "=", onClick: handleEquals, style: "bg-amber-100 text-amber-950 border-amber-400" },

    { label: "0", onClick: () => appendDigit("0"), style: "bg-white text-[#1F1612] border-[#D9C7B8] col-span-2" },
    { label: "00", onClick: () => appendDigit("00"), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
    { label: ".", onClick: () => appendDigit("."), style: "bg-white text-[#1F1612] border-[#D9C7B8]" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border-4 border-[#4A2511] bg-[#FFFDF9] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E7D8C9] pb-2.5">
          <h3 className="text-lg font-black text-[#4A2511]">{t("orders.calculatorTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D9C7B8] bg-white text-[#4A2511]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Display */}
        <div className="mt-3 rounded-2xl border-2 border-[#CBB8A6] bg-white p-3 text-right">
          <div className="min-h-[24px] truncate text-sm font-bold text-[#6E5444]">
            {expr || "0"}
          </div>
          <div className="mt-0.5 text-3xl font-black text-[#1F1612]">
            ₹{preview !== null ? preview : 0}
          </div>
        </div>

        {/* Keypad */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {buttons.map((btn, i) => (
            <button
              key={i}
              type="button"
              onClick={btn.onClick}
              className={`flex min-h-[52px] items-center justify-center rounded-2xl border-2 text-xl font-black active:scale-95 ${btn.style}`}
            >
              {btn.label === "⌫" ? <Delete className="h-5 w-5" /> : btn.label}
            </button>
          ))}
        </div>

        {/* Apply */}
        <button
          type="button"
          onClick={handleUseAmount}
          className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-emerald-700 text-lg font-black text-white shadow-md active:scale-95"
        >
          {t("orders.useAmount", { amount: preview !== null && preview >= 0 ? Math.round(preview) : 0 })}
        </button>
      </div>
    </div>
  );
}
