"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, setSessionToken } from "@/lib/api";

/**
 * Email sign-in with the payout network (PAJ). Their OTP session is what lets
 * us list banks, resolve account names, keep saved recipients and create the
 * payout order. Stored in this browser until it expires.
 */
type Saved = { email: string; token: string; expiresAt: string } | null;

type SessionState = {
  email: string | null;
  signedIn: boolean;
  startSignIn: (email: string) => Promise<void>;
  verify: (email: string, otp: string) => Promise<void>;
  signOut: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

const KEY = "paya:session";
const DEVICE_KEY = "paya:device";
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cacheVal: Saved = null;

function read(): Saved {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* blocked */
  }
  if (raw === cacheRaw) return cacheVal;
  cacheRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as Saved) : null;
    cacheVal = v && Date.parse(v.expiresAt) > Date.now() ? v : null;
  } catch {
    cacheVal = null;
  }
  return cacheVal;
}

function write(v: Saved) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    cacheRaw = v ? JSON.stringify(v) : null;
    cacheVal = v;
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const saved = useSyncExternalStore(subscribe, read, () => null);

  // Every relay request carries the session when we have one.
  useEffect(() => {
    setSessionToken(saved?.token ?? null);
  }, [saved?.token]);

  const startSignIn = useCallback(async (email: string) => {
    await api.startSignIn(email.trim().toLowerCase());
  }, []);

  const verify = useCallback(async (email: string, otp: string) => {
    const r = await api.verifySignIn(email.trim().toLowerCase(), otp.trim(), deviceId());
    setSessionToken(r.token);
    write({ email: r.email, token: r.token, expiresAt: r.expiresAt });
  }, []);

  const signOut = useCallback(() => {
    setSessionToken(null);
    write(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({ email: saved?.email ?? null, signedIn: Boolean(saved), startSignIn, verify, signOut }),
    [saved, startSignIn, verify, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
