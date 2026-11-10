import { ChevronRight } from "lucide-react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "../lib/cn";
import styles from "./TextLink.module.css";

export interface TextLinkProps extends LinkProps {
  /** Trailing arrow marks it as clickable without relying on color. Default true. */
  arrow?: boolean;
}

/** Tautan (nama Satker, judul item): 1 px strong underline from the bottom stroke + arrow; hover darkens. */
export function TextLink({ arrow = true, className, children, ...rest }: TextLinkProps) {
  return (
    <Link {...rest} className={cn(styles.link, className)}>
      <span>{children}</span>
      {arrow && <ChevronRight size={12} aria-hidden="true" />}
    </Link>
  );
}
