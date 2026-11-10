import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** Lucide icon, 15 px. */
  icon: LucideIcon;
  /** Required accessible name; also used as the tooltip. */
  label: string;
  /** Marks a toggle button (aria-pressed). */
  pressed?: boolean;
}

/** Tombol ikon: 28 px square, ghost look. `disabled` renders the Nonaktif state. */
export function IconButton({ icon: Icon, label, pressed, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} className={cn(styles.iconButton, className)} aria-label={label} title={label} aria-pressed={pressed}>
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
