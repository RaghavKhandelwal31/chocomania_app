import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Check, Copy, Download, Share2 } from "lucide-react";

interface UpiQrCardProps {
  amountPaise: number;
  message: string;
}

export function UpiQrCard({ amountPaise, message }: UpiQrCardProps) {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const amountRupees = Number((amountPaise / 100).toFixed(2));

  useEffect(() => {
    if (amountRupees <= 0) {
      setQrDataUrl(null);
      setQrBlob(null);
      return;
    }

    let cancelled = false;
    const upiUri = `upi://pay?pa=chocomania@ybl&pn=Chocomania&am=${amountRupees}&cu=INR`;

    const generateCard = async () => {
      try {
        const qrCanvas = document.createElement("canvas");
        await QRCode.toCanvas(qrCanvas, upiUri, {
          width: 320,
          margin: 2,
          color: { dark: "#1F1612", light: "#FFFFFF" },
        });

        // Wrap QR in a clean labeled card so customers know who & how much they're paying
        const cardCanvas = document.createElement("canvas");
        cardCanvas.width = 380;
        cardCanvas.height = 460;
        const ctx = cardCanvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);

        // Header
        ctx.fillStyle = "#4A2511";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Chocomania", cardCanvas.width / 2, 42);

        ctx.fillStyle = "#1F1612";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(`Pay ₹${amountRupees}`, cardCanvas.width / 2, 78);

        // QR Code
        ctx.drawImage(qrCanvas, 30, 96, 320, 320);

        // Footer UPI ID
        ctx.fillStyle = "#6E5444";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("chocomania@ybl", cardCanvas.width / 2, 440);

        if (cancelled) return;
        const dataUrl = cardCanvas.toDataURL("image/png");
        setQrDataUrl(dataUrl);

        cardCanvas.toBlob((blob) => {
          if (cancelled || !blob) return;
          setQrBlob(blob);
          const testFile = new File([blob], "chocomania-upi-qr.png", { type: "image/png" });
          const shareSupported =
            typeof navigator !== "undefined" &&
            typeof navigator.share === "function" &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [testFile] });
          setCanShareFiles(shareSupported);
        }, "image/png");
      } catch {
        // Ignore QR generation error
      }
    };

    void generateCard();
    return () => {
      cancelled = true;
    };
  }, [amountRupees]);

  if (amountRupees <= 0 || !qrDataUrl) {
    return null;
  }

  const handleDownloadQr = () => {
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `chocomania-upi-${amountRupees}.png`;
    a.click();
  };

  const handleCopyQr = async () => {
    if (!qrBlob) return;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": qrBlob })]);
        setQrCopied(true);
        setTimeout(() => setQrCopied(false), 2500);
        return;
      }
    } catch {
      // Fallback to download if clipboard image write is blocked
    }
    handleDownloadQr();
  };

  const handleShareQrWithText = async () => {
    if (!qrBlob) return;
    try {
      const file = new File([qrBlob], `chocomania-upi-${amountRupees}.png`, { type: "image/png" });
      await navigator.share({
        files: [file],
        text: message,
      });
    } catch {
      // User cancelled share or unsupported
    }
  };

  return (
    <div className="mt-3 rounded-2xl border-2 border-[#E7D8C9] bg-[#FFFDF9] p-3">
      <div className="flex items-center gap-3">
        <img
          src={qrDataUrl}
          alt={`UPI QR ₹${amountRupees}`}
          className="h-24 w-24 shrink-0 rounded-xl border border-[#D9C7B8] bg-white object-contain"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wide text-[#6E5444]">
            {t("orders.upiQrLabel")} • ₹{amountRupees}
          </div>
          <div className="flex flex-wrap gap-2">
            {canShareFiles && (
              <button
                type="button"
                onClick={() => void handleShareQrWithText()}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4A2511] px-3 text-xs font-extrabold text-white active:scale-95"
              >
                <Share2 className="h-4 w-4" />
                <span>{t("orders.shareQr")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopyQr()}
              className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border-2 border-[#4A2511] bg-white px-3 text-xs font-extrabold text-[#4A2511] active:scale-95"
            >
              {qrCopied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
              <span>{qrCopied ? t("orders.qrCopied") : t("orders.copyQr")}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadQr}
              aria-label={t("orders.saveQr")}
              className="flex min-h-[40px] items-center justify-center gap-1 rounded-xl border-2 border-[#D9C7B8] bg-white px-2.5 text-xs font-extrabold text-[#5C4538] active:scale-95"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
