import { createContext, useContext, type ReactNode } from "react";
import {
  translate,
  type Locale,
  type TranslationKey,
} from "@oh-writers/domain";

interface LocaleContextValue {
  locale: Locale;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Provides the resolved UI locale. The locale is resolved SERVER-SIDE in the
 * root loader and passed in here, so the client initialises from the exact
 * value the server rendered — never re-detecting on mount (which would flip
 * `<html lang>` and warn on hydration).
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value: LocaleContextValue = {
    locale,
    t: (key) => translate(locale, key),
  };
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

const useLocaleContext = (): LocaleContextValue => {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
};

export const useLocale = (): Locale => useLocaleContext().locale;

/** `const { t, locale } = useTranslation()`. */
export const useTranslation = (): LocaleContextValue => useLocaleContext();

/**
 * Non-throwing variant: returns `null` when no `LocaleProvider` is mounted
 * instead of throwing. For surfaces that can render OUTSIDE the provider tree —
 * notably the router's `defaultErrorComponent`, which also catches throws in the
 * root route (above `LocaleProvider`). Callers must supply their own fallback
 * copy when this returns null.
 */
export const useOptionalTranslation = (): LocaleContextValue | null =>
  useContext(LocaleContext);
