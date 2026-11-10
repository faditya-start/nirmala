import type { AccountDto } from "@nirmala/shared";
import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../../../lib/api";
import styles from "./AccountPicker.module.css";

export interface AccountPickerProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  disabled?: boolean;
}

const nameCache = new Map<string, string>();

/**
 * Combobox akun tujuan (GET /references/accounts). Orang boleh mengetik kode 6 digit langsung atau
 * memilih dari daftar hasil pencarian kode (awalan) atau nama.
 */
export function AccountPicker({ label, value, onChange, error, disabled }: AccountPickerProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [, bump] = useState(0);
  const typed = useRef(false);

  // Cari saat daftar terbuka dan teks berubah.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.get<{ accounts: AccountDto[] }>("/references/accounts", { signal: controller.signal, query: { q: value.trim(), limit: 20 } });
        if (controller.signal.aborted) return;
        result.accounts.forEach((account) => nameCache.set(account.code, account.name));
        setOptions(result.accounts);
        setFailed(false);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, typed.current ? 200 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, value]);

  // Nama akun untuk kode bawaan aturan yang belum pernah dicari.
  useEffect(() => {
    const code = value.trim();
    if (!/^\d{6}$/.test(code) || nameCache.has(code)) return;
    let cancelled = false;
    api
      .get<{ accounts: AccountDto[] }>("/references/accounts", { query: { q: code, limit: 5 } })
      .then((result) => {
        result.accounts.forEach((account) => nameCache.set(account.code, account.name));
        if (!cancelled) bump((count) => count + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  function choose(account: AccountDto) {
    typed.current = false;
    onChange(account.code);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      setActive((current) => (event.key === "ArrowDown" ? (current + 1) % options.length : (current - 1 + options.length) % options.length));
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const known = nameCache.get(value.trim());
  const describedBy = error ? `${id}-error` : known ? `${id}-name` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        <span className={styles.required}> (wajib)</span>
      </label>
      <div className={styles.combo}>
        <input
          id={id}
          className={styles.input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required="true"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ketik kode atau nama akun"
          disabled={disabled}
          value={value}
          onChange={(event) => {
            typed.current = true;
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul id={listId} role="listbox" aria-label="Hasil pencarian akun" className={styles.list}>
            {options.map((account, index) => (
              <li
                key={account.code}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                data-active={index === active || undefined}
                className={styles.option}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(account);
                }}
              >
                <span className="num">{account.code}</span>
                <span className={styles.optionName}>{account.name}</span>
              </li>
            ))}
            {options.length === 0 && (
              <li role="presentation" className={styles.status}>
                {loading ? "Mencari akun…" : failed ? "Daftar akun tidak dapat dimuat. Ketik kode 6 digit langsung." : "Tidak ada akun yang cocok."}
              </li>
            )}
          </ul>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className={`${styles.help} ${styles.error}`}>
          <CircleAlert size={12} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : known ? (
        <p id={`${id}-name`} className={styles.help}>
          {value.trim()} · {known}
        </p>
      ) : (
        <p className={styles.help}>Kode akun 6 digit.</p>
      )}
    </div>
  );
}
