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
import { useSession } from "@/components/app/session-provider";
import { api, ApiError, type Me } from "@/lib/api";

/**
 * The signed-in Paya account: email, its own NEAR address, balance and the
 * linked payout bank. Refreshed every 10 s while the app is open.
 */
type AccountState = {
  me: Me | null;
  /** True until the first load after sign-in finishes. */
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Replace the cached account with a fresh copy from a mutation. */
  setMe: (m: Me) => void;
  hidden: boolean;
  toggleHidden: () => void;
};

const AccountContext = createContext<AccountState | null>(null);

/* ---- "hide balances" preference (per browser) ---- */
const HIDE_KEY = "paya:hide";
const hideListeners = new Set<() => void>();
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};
const subscribeHidden = (cb: () => void) => {
  hideListeners.add(cb);
  return () => hideListeners.delete(cb);
};

export function AccountProvider({ children }: { children: ReactNode }) {
  const { signedIn, email, token, signOut } = useSession();
  const [state, setState] = useState<{ me: Me | null; error: string | null; for: string | null }>({ me: null, error: null, for: null });
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      setState({ me, error: null, for: me.email });
    } catch (e) {
      const err = e as ApiError;
      // The app session itself is no longer valid: start clean.
      if (err.code === "SIGN_IN" && /first/i.test(err.message)) signOut();
      else setState((s) => ({ ...s, error: err.message }));
    }
  }, [signOut]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load();
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [signedIn, email, token, load]);

  const toggleHidden = useCallback(() => {
    try {
      localStorage.setItem(HIDE_KEY, readHidden() ? "0" : "1");
    } catch {
      /* ignore */
    }
    hideListeners.forEach((l) => l());
  }, []);

  // Only show data that belongs to the signed-in email (avoids a flash of the previous account).
  const me = signedIn && state.me && state.for === email ? state.me : null;
  const value = useMemo<AccountState>(
    () => ({
      me,
      loading: signedIn && !me && !state.error,
      error: signedIn ? state.error : null,
      refresh: load,
      setMe: (m: Me) => setState({ me: m, error: null, for: m.email }),
      hidden,
      toggleHidden,
    }),
    [me, signedIn, state.error, load, hidden, toggleHidden],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}

export const shortAddress = (a: string) => (a.length > 20 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);
