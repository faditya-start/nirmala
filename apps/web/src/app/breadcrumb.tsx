import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BreadcrumbItem } from "../ui";

interface BreadcrumbContextValue {
  override: BreadcrumbItem[] | null;
  setOverride: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<BreadcrumbItem[] | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbOverride(): BreadcrumbItem[] | null {
  return useContext(BreadcrumbContext)?.override ?? null;
}

/**
 * Replace the header breadcrumb for the current page, e.g. on a detail screen:
 *   usePageBreadcrumb([{ label: "Reviu" }, { label: "Risk Triage", to: "/triage" }, { label: "Pakaian seragam" }]);
 * The last item is the current page. The default (group > page title) is restored on unmount.
 * Pass a stable value (useMemo) or a primitive-built array; the hook compares by content.
 */
export function usePageBreadcrumb(items: BreadcrumbItem[] | null): void {
  const context = useContext(BreadcrumbContext);
  const key = items ? JSON.stringify(items) : "";
  useEffect(() => {
    if (!context) return;
    context.setOverride(key ? (JSON.parse(key) as BreadcrumbItem[]) : null);
    return () => context.setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, context?.setOverride]);
}
