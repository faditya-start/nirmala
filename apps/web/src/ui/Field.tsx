import { ChevronDown, CircleAlert } from "lucide-react";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Field.module.css";

interface FieldChrome {
  /** Visible label (12 px, medium). Always provide one; use hideLabel for compact forms. */
  label: string;
  /** Help text below the box. */
  hint?: ReactNode;
  /** Error text. Turns the box red and adds an icon (status is never color only). */
  error?: ReactNode;
  /** Keeps the label for screen readers only. */
  hideLabel?: boolean;
  /**
   * Marks the box red and aria-invalid without rendering a message here. Use it for two fields that share one
   * error line (render <FieldError id="..."> under the pair and pass the same id as `describedBy` to both).
   */
  invalid?: boolean;
  /** Id of an external element (e.g. a shared <FieldError>) that describes this field; added to aria-describedby. */
  describedBy?: string;
  /** Adds "(wajib)" to the label and sets aria-required. */
  required?: boolean;
  /** Class for the outer wrapper (set width here). */
  className?: string;
}

interface ShellProps extends FieldChrome {
  id: string;
  children: ReactNode;
}

export interface FieldErrorProps {
  /** Give it the same id you pass as `describedBy` to the field(s) it belongs to. */
  id?: string;
  children: ReactNode;
  className?: string;
}

/** Error line with the field-error icon, for a message shared by several fields ("Tanggal selesai harus setelah tanggal mulai."). */
export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <p id={id} role="alert" className={cn(styles.help, styles.error, className)}>
      <CircleAlert size={12} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function FieldShell({ id, label, hint, error, hideLabel, required, className, children }: ShellProps) {
  return (
    <div className={cn(styles.field, className)}>
      <label htmlFor={id} className={cn(styles.label, hideLabel && "sr-only")}>
        {label}
        {required && <span className={styles.required}> (wajib)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={cn(styles.help, styles.error)}>
          <CircleAlert size={12} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.help}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby: the error (or the hint when there is no error) plus any external id. */
function describedBy(id: string, hint: ReactNode, error: ReactNode, external?: string): string | undefined {
  const own = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return [own, external].filter(Boolean).join(" ") || undefined;
}

export type InputProps = FieldChrome & Omit<ComponentPropsWithRef<"input">, "className" | "id"> & { id?: string; inputClassName?: string };

/** Field/Input. Label above, 34 px box, hint or error below. */
export function Input({ label, hint, error, invalid, describedBy: describedByExternal, hideLabel, required, className, inputClassName, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={className}>
      <input
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error, describedByExternal)}
        className={cn(styles.box, styles.single, inputClassName)}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = FieldChrome &
  Omit<ComponentPropsWithRef<"select">, "className" | "id"> & {
    id?: string;
    /** Shown (faint) while no value is chosen. Renders an empty first option. */
    placeholder?: string;
    /** Either pass options or <option> children. */
    options?: SelectOption[];
  };

/** Field/Select. Native <select> so the keyboard and screen readers just work. */
export function Select({ label, hint, error, invalid, describedBy: describedByExternal, hideLabel, required, className, id, placeholder, options, children, ...rest }: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={className}>
      <div className={styles.selectWrap}>
        <select
          {...rest}
          id={selectId}
          required={required}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedBy(selectId, hint, error, describedByExternal)}
          className={cn(styles.box, styles.single, styles.select)}
        >
          {placeholder !== undefined && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
      </div>
    </FieldShell>
  );
}

export type TextareaProps = FieldChrome & Omit<ComponentPropsWithRef<"textarea">, "className" | "id"> & { id?: string };

/** Field/Textarea. 88 px minimum height, vertical resize. */
export function Textarea({ label, hint, error, invalid, describedBy: describedByExternal, hideLabel, required, className, id, ...rest }: TextareaProps) {
  const auto = useId();
  const textareaId = id ?? auto;
  return (
    <FieldShell id={textareaId} label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={className}>
      <textarea
        {...rest}
        id={textareaId}
        required={required}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={describedBy(textareaId, hint, error, describedByExternal)}
        className={cn(styles.box, styles.multi)}
      />
    </FieldShell>
  );
}
