import { Check, Minus } from "lucide-react";
import { useEffect, useRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<ComponentPropsWithRef<"input">, "type" | "children"> {
  /** Visible label. Omit only when the checkbox sits in a table cell; then pass aria-label. */
  label?: ReactNode;
  /** Mixed state for "select all". */
  indeterminate?: boolean;
}

/** Checkbox/On and Off: 16 px box, native input underneath for keyboard and forms. */
export function Checkbox({ label, indeterminate, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <label className={cn(styles.checkbox, rest.disabled && styles.disabled, className)}>
      <input {...rest} ref={ref} type="checkbox" className={styles.input} />
      <span className={styles.box} aria-hidden="true">
        {indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </span>
      {label !== undefined && <span className={styles.label}>{label}</span>}
    </label>
  );
}
