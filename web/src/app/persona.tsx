import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { Persona } from "../shared/api/schemas";

const storageKey = "marginlift-persona";
export const viewLabels = { executive: "مدیرعامل", cmo: "بازاریابی", crm: "CRM", finance: "مالی", data: "داده" } as const;
export type PresentationView = keyof typeof viewLabels;
export function isPresentationView(value: string | null): value is PresentationView {
  return value !== null && Object.hasOwn(viewLabels, value);
}
export function apiPersona(view: PresentationView): Persona { return view === "cmo" ? "executive" : view; }

type PersonaContextValue = {
  persona: Persona;
  view: PresentationView;
  setPersona: (persona: PresentationView) => void;
};

const PersonaContext = createContext<PersonaContextValue | null>(null);

function initialPersona(): PresentationView {
  if (typeof window === "undefined") return "executive";
  const queryValue = new URL(window.location.href).searchParams.get("view");
  if (isPresentationView(queryValue)) return queryValue;
  try {
    const saved = window.localStorage.getItem(storageKey);
    return isPresentationView(saved) ? saved : "executive";
  } catch { return "executive"; }
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [view, setPersonaState] = useState<PresentationView>(initialPersona);
  const value = useMemo(
    () => ({
      persona: apiPersona(view),
      view,
      setPersona: (next: PresentationView) => {
        try { window.localStorage.setItem(storageKey, next); } catch { /* View remains usable without storage. */ }
        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.history.replaceState(window.history.state, "", url);
        setPersonaState(next);
      },
    }),
    [view],
  );
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error("usePersona must be used inside PersonaProvider");
  return value;
}

export const personaLabels: Record<Persona, string> = {
  executive: "مدیریت",
  crm: "CRM",
  finance: "مالی",
  data: "داده",
};
