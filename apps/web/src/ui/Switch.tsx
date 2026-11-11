import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<ComponentPropsWithRef<"button">, "onChange" | "role" | "children"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. Without it, pass aria-label. */
  label?: ReactNode;
}

/** Sakelar/Aktif and Sakelar/Mati. role="switch"; Space or Enter toggles. */
export function Switch({ checked, onCheckedChange, label, className, disabled, ...rest }: SwitchProps) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        rest.onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
      className={cn(styles.switch, className)}
    >
      <span className={styles.track} data-on={checked || undefined} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      {label !== undefined && <span className={styles.label}>{label}</span>}
    </button>
  );
}
