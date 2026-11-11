"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Bank } from "@/lib/api";

/**
 * Recipients are bank accounts saved on the user's payout profile (PAJ), so
 * they follow the user's email to any device.
 */
export type Recipient = {
  id: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export function useRecipients(currency: string, enabled: boolean) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [list, setList] = useState<Recipient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([api.banks(currency), api.savedAccounts()])
      .then(([b, saved]) => {
        if (cancelled) return;
        const byId = new Map(b.map((x) => [x.id, x]));
        setBanks(b);
        setList(
          saved
            .filter((s) => byId.has(s.bank)) // only this currency's banks
            .map((s) => ({
              id: s.id,
              bankId: s.bank,
              bankName: byId.get(s.bank)!.name,
              accountNumber: s.accountNumber,
              accountName: s.accountName,
            })),
        );
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [currency, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { banks, recipients: list, error, reload };
}

export const maskAccount = (s: string) => (s.length <= 4 ? s : `•••• ${s.slice(-4)}`);
