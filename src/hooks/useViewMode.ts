import { useEffect, useState } from "react";

export type ViewMode = "teacher" | "student";

const KEY = "view_mode";

const read = (): ViewMode => {
  if (typeof window === "undefined") return "teacher";
  return (localStorage.getItem(KEY) as ViewMode | null) ?? "teacher";
};

const listeners = new Set<(m: ViewMode) => void>();

export const useViewMode = () => {
  const [mode, setMode] = useState<ViewMode>(read);

  useEffect(() => {
    // Re-sync on mount in case localStorage changed before this instance subscribed.
    setMode(read());

    const fn = (m: ViewMode) => setMode(m);
    listeners.add(fn);

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMode(read());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }

    return () => {
      listeners.delete(fn);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  }, []);

  const update = (m: ViewMode) => {
    localStorage.setItem(KEY, m);
    listeners.forEach((l) => l(m));
  };

  return { mode, setMode: update };
};

export const getViewMode = read;
