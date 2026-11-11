"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/** First 16 characters + "…"; short named accounts are shown as-is. */
const short = (s: string) => (s.length > 20 ? `${s.slice(0, 16)}…` : s);
import { NearIcon } from "@/components/landing/icons";
import { useSession } from "@/components/app/session-provider";

/** The one thing a user needs: their Paya address. Send NEAR here → naira. */
export function AddressCard() {
  const { me } = useSession();
  const [copied, setCopied] = useState(false);
  const address = me?.depositAccount;

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is still selectable */
    }
  }

  return (
    <section className="glass-card rounded-3xl p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <NearIcon className="size-4" />
        Your Paya address
      </div>
      {address ? (
        <>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* 64-hex implicit address, shortened for display; Copy gives the full string */}
            <p
              className="min-w-0 flex-1 font-mono text-2xl font-medium tracking-tight tabular-nums md:text-3xl"
              title={address}
              aria-label={`Paya address ${address}`}
            >
              {short(address)}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={copy}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90"
              >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy address"}
              </button>
              <a
                href={`${me?.network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io"}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground"
              >
                Explorer
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground text-pretty">
            Send NEAR to this address from any wallet or exchange. The moment it lands, Paya swaps it and pays naira
            into your bank account. Nothing else to do.
          </p>
        </>
      ) : (
        <div className="mt-2 h-9 w-72 animate-pulse rounded-lg bg-foreground/10" aria-label="Creating your address" />
      )}
    </section>
  );
}
