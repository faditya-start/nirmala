import { ArrowLeft, CircleAlert, LogIn } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/auth";
import { Button, Input, Loading } from "../../ui";
import { loginFailureMessage, safeRedirectTarget } from "./loginLogic";
import styles from "./Login.module.css";

/**
 * S1 · Login (k2eVzx; galat G32yLt). Route: /login (no shell).
 * POST /api/auth/login through AuthProvider. The route guard stores the requested route in `state.from`;
 * after signing in we return there (validated as an in-app path).
 */
export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeRedirectTarget((location.state as { from?: unknown } | null)?.from);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Focus the first field once the session check is done and the form is on screen.
  const showForm = status === "ready" && !user;
  useEffect(() => {
    if (showForm) usernameRef.current?.focus();
  }, [showForm]);

  if (status === "loading") {
    return (
      <main className={styles.page}>
        <Loading label="Memeriksa sesi…" />
      </main>
    );
  }
  if (user) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const name = username.trim();
    setFormError(null);
    setUsernameError(null);
    setPasswordError(null);
    if (!name) {
      setUsernameError("Isi username.");
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      setPasswordError("Isi kata sandi.");
      passwordRef.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await login(name, password);
      // AuthProvider now has the user; the <Navigate> above takes over, this covers the same tick.
      if (mounted.current) navigate(from, { replace: true });
    } catch (caught) {
      if (!mounted.current) return;
      setFormError(loginFailureMessage(caught));
      // The designed error state keeps the username and clears the password.
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <span className={styles.monogram} aria-hidden="true">
          N
        </span>
        <div className={styles.brandText}>
          <span className={styles.brandName}>NIRMALA</span>
          <span className={styles.tagline}>Reviu RKA Pra-DIPA</span>
        </div>
      </div>

      <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="login-title" aria-busy={busy || undefined}>
        <div className={styles.heading}>
          <h1 id="login-title" className={styles.title}>
            Masuk
          </h1>
          <p className={styles.sub}>Gunakan akun yang dibuat oleh Admin.</p>
        </div>

        {formError && (
          <div className={styles.alert} role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <div className={styles.fields}>
          <Input
            ref={usernameRef}
            className={styles.field}
            label="Username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Masukkan username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            readOnly={busy}
            error={usernameError ?? undefined}
          />
          <Input
            ref={passwordRef}
            className={styles.field}
            label="Kata sandi"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Masukkan kata sandi"
            autoComplete="current-password"
            readOnly={busy}
            error={passwordError ?? undefined}
          />
        </div>

        <Button type="submit" variant="utama" icon={LogIn} loading={busy} className={styles.submit}>
          Masuk
        </Button>
      </form>

      <Link to="/" className={styles.back}>
        <ArrowLeft size={14} aria-hidden="true" />
        Kembali ke beranda
      </Link>
    </main>
  );
}
