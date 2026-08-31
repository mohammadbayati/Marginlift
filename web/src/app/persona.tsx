import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { PersonaSchema, type Persona } from "../shared/api/schemas";

const storageKey = "marginlift-persona";

type PersonaContextValue = {
  persona: Persona;
  setPersona: (persona: Persona) => void;
};

const PersonaContext = createContext<PersonaContextValue | null>(null);

function initialPersona(): Persona {
  if (typeof window === "undefined") return "executive";
  const queryValue = new URL(window.location.href).searchParams.get("view");
  const queryPersona = PersonaSchema.safeParse(queryValue);
  if (queryPersona.success) return queryPersona.data;
  const parsed = PersonaSchema.safeParse(window.localStorage.getItem(storageKey));
  return parsed.success ? parsed.data : "executive";
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>(initialPersona);
  const value = useMemo(
    () => ({
      persona,
      setPersona: (next: Persona) => {
        window.localStorage.setItem(storageKey, next);
        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.history.replaceState(window.history.state, "", url);
        setPersonaState(next);
      },
    }),
    [persona],
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
