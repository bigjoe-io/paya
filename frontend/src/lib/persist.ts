"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * State that survives a reload: kept in localStorage under "paya:<key>".
 * Server render and first paint use `initial`, then the saved value takes
 * over (no hydration mismatch). Storage blocked → behaves like useState.
 */
const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string | null>(); // fallback when storage is blocked
const cache = new Map<string, { raw: string | null; value: unknown }>();

const full = (key: string) => `paya:${key}`;

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(full(key));
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string | null) {
  try {
    if (raw === null) localStorage.removeItem(full(key));
    else localStorage.setItem(full(key), raw);
  } catch {
    memory.set(key, raw);
  }
  listeners.get(key)?.forEach((l) => l());
}

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(cb);
      listeners.set(key, set);
      // Other tabs.
      const onStorage = (e: StorageEvent) => {
        if (e.key === full(key)) cb();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value as T;
    let value: T = initial;
    if (raw !== null) {
      try {
        value = JSON.parse(raw) as T;
      } catch {
        value = initial;
      }
    }
    cache.set(key, { raw, value });
    return value;
    // `initial` is a default only; changing it must not reset saved state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => initial);

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(getSnapshot()) : v;
      writeRaw(key, next === undefined || next === null ? null : JSON.stringify(next));
    },
    [key, getSnapshot],
  );

  return [value, set];
}

/** Forget saved keys, e.g. on sign-out. */
export function clearPersisted(prefixes: string[]) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(full(p)))) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  cache.clear();
}
