"use server";

import { requireAdmin } from "@/lib/session";
import { relay, RelayError } from "@/lib/relay";

export type RecheckResult = { checkedAt?: string; swap?: string | null; note?: string; error?: string };

/** Ask NEAR Intents for this swap's status right now (read-only). */
export async function recheck(id: string): Promise<RecheckResult> {
  await requireAdmin();
  try {
    return await relay.recheck(id);
  } catch (e) {
    return { error: e instanceof RelayError ? e.message : "Recheck failed" };
  }
}
