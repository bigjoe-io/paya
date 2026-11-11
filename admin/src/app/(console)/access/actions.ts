"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError } from "@/lib/relay";

export type CreateResult = { code?: string; label?: string; error?: string };

export async function createCode(_prev: CreateResult, form: FormData): Promise<CreateResult> {
  await requireAdmin();
  const label = String(form.get("label") ?? "").trim() || "Tester";
  const maxUses = Number(form.get("maxUses")) || null;
  const expiresDays = Number(form.get("expiresDays")) || null;
  try {
    const r = await relay.createAccessCode({ label, maxUses, expiresDays });
    revalidatePath("/access");
    return { code: r.code, label };
  } catch (e) {
    return { error: e instanceof RelayError ? e.message : "Couldn't create the code" };
  }
}

export async function revokeCode(id: string) {
  await requireAdmin();
  await relay.revokeAccessCode(id);
  revalidatePath("/access");
}
