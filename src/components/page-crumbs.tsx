"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

/** One step of the top bar's breadcrumb; the last is the page itself. */
export type Crumb = { label: string; href?: string };

const CrumbsContext = createContext<{
  crumbs: readonly Crumb[] | null;
  setCrumbs: (crumbs: readonly Crumb[] | null) => void;
}>({ crumbs: null, setCrumbs: () => {} });

export function PageCrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<readonly Crumb[] | null>(null);
  return <CrumbsContext value={{ crumbs, setCrumbs }}>{children}</CrumbsContext>;
}

export const usePageCrumbs = () => useContext(CrumbsContext).crumbs;

/**
 * A detail page's breadcrumb ("Cuentas › Banco X"), shown in the top bar while
 * the page is mounted. Pages that set none get their section's name.
 */
export function PageCrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  const { setCrumbs } = useContext(CrumbsContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setCrumbs(JSON.parse(key) as Crumb[]);
    return () => setCrumbs(null);
  }, [key, setCrumbs]);
  return null;
}
