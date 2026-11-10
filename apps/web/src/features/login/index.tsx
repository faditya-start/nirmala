import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/auth";
import { errorMessage } from "../../lib/api";
import { Button, Input } from "../../ui";

/**
 * S1 · Login (k2eVzx, G32yLt galat). Route: /login (no shell).
 * Minimal working form so the app is usable end to end; the login feature owner restyles it to the design.
 */
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught, "Tidak dapat masuk. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "var(--sp-4)" }}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", width: "min(360px, 100%)" }}>
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 600 }}>Masuk ke NIRMALA</h1>
        <Input label="Nama pengguna" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        <Input label="Kata sandi" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required error={error ?? undefined} />
        <Button type="submit" variant="utama" icon={LogIn} loading={busy}>
          Masuk
        </Button>
      </form>
    </main>
  );
}
