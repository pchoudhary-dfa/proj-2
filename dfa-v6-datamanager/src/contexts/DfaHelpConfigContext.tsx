"use client";

import { createContext, useContext, type ReactNode } from "react";

export type DfaHelpConfigValue = {
  languages: string[];
  defaultLang: string;
};

const defaultValue: DfaHelpConfigValue = {
  languages: ["en"],
  defaultLang: "en",
};

export const DfaHelpConfigContext =
  createContext<DfaHelpConfigValue>(defaultValue);

export function DfaHelpConfigProvider({
  value,
  children,
}: {
  value: DfaHelpConfigValue;
  children: ReactNode;
}) {
  return (
    <DfaHelpConfigContext.Provider value={value}>
      {children}
    </DfaHelpConfigContext.Provider>
  );
}

export function useDfaHelpConfig(): DfaHelpConfigValue {
  return useContext(DfaHelpConfigContext);
}

/** Locales used by Help Admin content tabs when GET /system-language is empty. */
export const HELP_CONTENT_LOCALES = ["en", "ar", "fr", "es", "tto"] as const;
