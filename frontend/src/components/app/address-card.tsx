"use client";

import { useEffect, useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { NearIcon } from "@/components/landing/icons";
import { cn } from "@/lib/utils";

/** The user's own NEAR address: copy it or show it as a QR code to send NEAR from any wallet or exchange. */
export function AddressCard({ address, note, className }: { address: string; note?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!showQr || svg) return;
    QRCode.toString(address, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [showQr, svg, address]);

  return (
    <div className={cn("rounded-2xl border border-border bg-panel p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <NearIcon className="size-4" /> Your NEAR address
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            aria-pressed={showQr}
            aria-label={showQr ? "Hide QR code" : "Show QR code"}
            className="focus-ring flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          >
            <QrCode className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
            className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/90"
          >
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="mt-2 font-mono text-sm break-all tabular-nums select-all">{address}</p>
      {showQr && (
        <div className="mt-3 flex justify-center">
          {svg ? (
            // Generated locally from the address; contains no user-supplied markup.
            <div className="size-44 rounded-xl border border-border bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR code of your NEAR address" />
          ) : (
            <div className="size-44 animate-pulse rounded-xl bg-card" aria-busy="true" />
          )}
        </div>
      )}
      {note && <p className="mt-3 text-xs text-muted-foreground text-pretty">{note}</p>}
    </div>
  );
}
