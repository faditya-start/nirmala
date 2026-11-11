import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PublicShell } from "../shells/PublicShell";
import { AppShell } from "../shells/AppShell";
import { EmptyState, Loading, ButtonLink } from "../ui";
import { AlertTriangle, SearchX } from "lucide-react";
import { AccessDenied } from "./AccessDenied";
import { AuthProvider, useAuth } from "./auth";
import { BreadcrumbProvider } from "./breadcrumb";
import { CycleProvider } from "./cycle";
import { NeedsActionProvider } from "./needsAction";
import { ROUTES, routeNeedsAuth, type AppRoute } from "./routes";

/** Catches a crashing screen so the shell (navigation, logout) keeps working. */
class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Layar gagal dirender", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <EmptyState
          variant="page"
          icon={AlertTriangle}
          title="Layar ini gagal dimuat"
          description="Terjadi kesalahan saat menampilkan halaman. Muat ulang halaman; bila masih terjadi, hubungi Admin."
        />
      );
    }
    return this.props.children;
  }
}

function Screen({ route }: { route: AppRoute }) {
  const Component = route.component;
  const location = useLocation();
  return (
    <ScreenBoundary key={location.pathname}>
      <Suspense fallback={<Loading block />}>
        <Component />
      </Suspense>
    </ScreenBoundary>
  );
}

/** Applies login + role guard and the shell for one route. */
function RouteFrame({ route }: { route: AppRoute }) {
  const { user, status } = useAuth();
  const location = useLocation();

  useEffect(() => {
    document.title = route.path === "/" ? "NIRMALA · Reviu RKA Pra-DIPA" : `${route.title} · NIRMALA`;
  }, [route]);

  const needsAuth = routeNeedsAuth(route);

  if (needsAuth && status === "loading") return <Loading block label="Memeriksa sesi…" />;
  if (needsAuth && !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  const denied = user && route.roles && !route.roles.includes(user.role) ? <AccessDenied screen={route.title} allowed={route.roles} current={user.role} /> : null;
  const content = denied ?? <Screen route={route} />;

  if (route.shell === "app" && user) {
    return (
      <AppShell user={user} title={route.title}>
        {content}
      </AppShell>
    );
  }
  if (route.shell === "public") return <PublicShell>{content}</PublicShell>;
  return content;
}

function NotFound() {
  const { user } = useAuth();
  useEffect(() => {
    document.title = "Halaman tidak ditemukan · NIRMALA";
  }, []);
  const body = (
    <EmptyState
      variant="page"
      icon={SearchX}
      title="Halaman tidak ditemukan"
      description="Alamat yang Anda buka tidak ada atau sudah dipindahkan."
      action={
        <ButtonLink to={user ? "/dashboard" : "/"} variant="utama">
          {user ? "Kembali ke Dashboard" : "Ke beranda"}
        </ButtonLink>
      }
    />
  );
  return user ? (
    <AppShell user={user} title="Tidak ditemukan">
      {body}
    </AppShell>
  ) : (
    <PublicShell>{body}</PublicShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CycleProvider>
          <NeedsActionProvider>
            <BreadcrumbProvider>
              <Routes>
                {ROUTES.map((route) => (
                  <Route key={route.path} path={route.path} element={<RouteFrame route={route} />} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BreadcrumbProvider>
          </NeedsActionProvider>
        </CycleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
