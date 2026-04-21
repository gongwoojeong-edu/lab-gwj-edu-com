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
    const fn = (m: ViewMode) => setMode(m);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const update = (m: ViewMode) => {
    localStorage.setItem(KEY, m);
    listeners.forEach((l) => l(m));
  };

  return { mode, setMode: update };
};

export const getViewMode = read;
