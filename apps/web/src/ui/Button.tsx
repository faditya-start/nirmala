import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "../lib/cn";
import styles from "./Button.module.css";

export type ButtonVariant = "utama" | "sekunder" | "ghost" | "bahaya";
export type ButtonSize = "md" | "sm";

interface VisualProps {
  /** utama (primary), sekunder, ghost, bahaya. Default sekunder. */
  variant?: ButtonVariant;
  /** md = 32 px (designed), sm = 28 px. */
  size?: ButtonSize;
  /** Leading icon (lucide), 14 px. */
  icon?: LucideIcon;
  /** Trailing icon (lucide). */
  iconRight?: LucideIcon;
  /** Disables the button and shows a spinner; aria-busy is set. */
  loading?: boolean;
  children?: ReactNode;
}

export type ButtonProps = VisualProps & Omit<ComponentPropsWithRef<"button">, keyof VisualProps>;

function classes(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(styles.button, styles[variant], size === "sm" && styles.sm, className);
}

function Content({ icon: Icon, iconRight: IconRight, loading, children }: Pick<VisualProps, "icon" | "iconRight" | "loading" | "children">) {
  return (
    <>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : Icon ? <Icon size={14} aria-hidden="true" className={styles.icon} /> : null}
      {children !== undefined && children !== null && <span className={styles.label}>{children}</span>}
      {IconRight && <IconRight size={14} aria-hidden="true" className={styles.icon} />}
    </>
  );
}

/** Button/Utama, Sekunder, Ghost, Bahaya. `disabled` renders the Nonaktif state. */
export function Button({ variant = "sekunder", size = "md", icon, iconRight, loading, children, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={classes(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined}>
      <Content icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export type ButtonLinkProps = VisualProps & Omit<LinkProps, keyof VisualProps>;

/** A router link that looks like a Button. Use for navigation, Button for actions. */
export function ButtonLink({ variant = "sekunder", size = "md", icon, iconRight, loading, children, className, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={classes(variant, size, className)}>
      <Content icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </Content>
    </Link>
  );
}
