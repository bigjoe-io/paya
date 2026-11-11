"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, ApiError, type Me } from "@/lib/api";

/**
 * Who is signed in, their Paya account, and the "hide balances" toggle.
 *
 * Sign-in is by email. In demo mode the relay trusts the email directly; with
 * Privy configured the same provider will hand the relay a Privy token instead
 * (the Privy wiring swaps `login` and `token`, nothing else).
 */
type Session = {
  email: string | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  hidden: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  toggleHidden: () => void;
  /** Kept for components written against the wallet stub. */
  accountId: string | null;
};

const SessionContext = createContext<Session | null>(null);

/* ---- localStorage-backed store for email + hidden flag ---- */

const KEY = "paya:session";
type Saved = { email: string | null; hidden: boolean };
const listeners = new Set<() => void>();
const readRaw = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const parse = (raw: string | null): Saved => {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return { email: v.email ?? null, hidden: Boolean(v.hidden) };
  } catch {
    return { email: null, hidden: false };
  }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const saved = useMemo(() => parse(raw), [raw]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!saved.email) return;
    try {
      const m = await api.me({ email: saved.email });
      setMe(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [saved.email]);

  // Load the profile whenever the signed-in email changes.
  useEffect(() => {
    let cancelled = false;
    if (!saved.email) {
      queueMicrotask(() => {
        if (!cancelled) setMe(null);
      });
      return () => {
        cancelled = true;
      };
    }
    const email = saved.email;
    api
      .me({ email })
      // Saved session but the relay doesn't know this email (e.g. its database
      // was reset): sign in again instead of waiting on an address forever.
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 404) return api.signIn({ email });
        throw e;
      })
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [saved.email]);

  const login = useCallback(
    async (email: string) => {
      setLoading(true);
      setError(null);
      try {
        const m = await api.signIn({ email });
        setMe(m);
        write({ email, hidden: saved.hidden });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [saved.hidden],
  );

  const logout = useCallback(() => {
    write({ email: null, hidden: saved.hidden });
    setMe(null);
  }, [saved.hidden]);

  const toggleHidden = useCallback(() => write({ email: saved.email, hidden: !saved.hidden }), [saved]);

  const value = useMemo<Session>(
    () => ({
      email: saved.email,
      me,
      loading,
      error,
      hidden: saved.hidden,
      login,
      logout,
      refresh,
      toggleHidden,
      accountId: me?.depositAccount ?? null,
    }),
    [saved.email, saved.hidden, me, loading, error, login, logout, refresh, toggleHidden],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** Compatibility alias for components written against the wallet stub. */
export const useWallet = useSession;
