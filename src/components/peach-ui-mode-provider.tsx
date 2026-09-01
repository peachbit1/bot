"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type PeachUiMode = "user" | "admin";

const STORAGE_KEY = "peach-ui-mode";

type Ctx = {
  mode: PeachUiMode;
  setMode: (m: PeachUiMode) => void;
  isAdmin: boolean;
};

const PeachUiModeContext = createContext<Ctx | null>(null);

function readInitial(): PeachUiMode {
  if (typeof window === "undefined") return "user";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "admin" || v === "user") return v;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
    ? "admin"
    : "user";
}

export function PeachUiModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<PeachUiMode>("user");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModeState(readInitial());
    setReady(true);
  }, []);

  const setMode = useCallback((m: PeachUiMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isAdmin: mode === "admin",
    }),
    [mode, setMode],
  );

  if (!ready) {
    return (
      <PeachUiModeContext.Provider value={value}>
        {children}
      </PeachUiModeContext.Provider>
    );
  }

  return (
    <PeachUiModeContext.Provider value={value}>
      {children}
    </PeachUiModeContext.Provider>
  );
}

export function usePeachUiMode() {
  const ctx = useContext(PeachUiModeContext);
  if (!ctx) throw new Error("usePeachUiMode outside provider");
  return ctx;
}
