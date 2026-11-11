import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Tabs.module.css";

export interface TabItem {
  value: string;
  label: string;
  /** Optional count badge. */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Links tabs to their TabPanel (aria-controls / aria-labelledby). Must be unique on the page. */
  idPrefix: string;
  className?: string;
}

export function tabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

export function panelId(idPrefix: string, value: string): string {
  return `${idPrefix}-panel-${value}`;
}

/**
 * Tab/Aktif and Tab/Biasa. role="tablist"; roving tabindex; Left/Right/Home/End move and activate.
 * The active tab has a 2 px ink underline AND bold text (not color alone).
 */
export function Tabs({ label, tabs, value, onChange, idPrefix, className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.value === value);
    let next: TabItem | undefined;
    if (event.key === "ArrowRight") next = enabled[(index + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    refs.current[next.value]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn(styles.tabs, className)} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[tab.value] = node;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.value)}
            aria-selected={active}
            aria-controls={panelId(idPrefix, tab.value)}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            className={cn(styles.tab, active && styles.active)}
            onClick={() => onChange(tab.value)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className={cn(styles.count, "num")}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  value: string;
  /** The currently selected tab value; the panel renders only when equal. */
  active: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ idPrefix, value, active, children, className }: TabPanelProps) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" id={panelId(idPrefix, value)} aria-labelledby={tabId(idPrefix, value)} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
