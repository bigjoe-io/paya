"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, passwordMatches } from "@/lib/session";

/** Per-IP attempt counter (in memory): 5 misses → locked for 15 minutes. */
const attempts = new Map<string, { n: number; until: number }>();
const MAX = 5;
const LOCK_MS = 15 * 60 * 1000;

export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    return { error: `Too many attempts. Try again in ${Math.ceil((a.until - Date.now()) / 60000)} min.` };
  }

  const password = String(form.get("password") ?? "");
  let ok = false;
  try {
    ok = passwordMatches(password);
  } catch (e) {
    return { error: (e as Error).message }; // misconfiguration, shown to the operator
  }

  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow every wrong guess
    const n = (a && a.until <= Date.now() ? 0 : (a?.n ?? 0)) + 1;
    attempts.set(ip, { n, until: n >= MAX ? Date.now() + LOCK_MS : 0 });
    return { error: n >= MAX ? "Too many attempts. Locked for 15 minutes." : "Wrong password." };
  }

  attempts.delete(ip);
  await createSession();
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
