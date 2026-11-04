import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AdminAuthProvider } from "./components/AdminAuthProvider";
import { AuthProvider } from "./components/AuthProvider";
import { CookieNotice } from "./components/CookieNotice";
import { DonationLoadOverlay } from "./components/html/DonationLoadOverlay";
import { DonationInfoSection } from "./components/html/DonationInfoSection";
import { RequireAdmin } from "./components/RequireAdmin";
import { BlockLoader } from "./components/ui/pixel-icon";
import { PRIVACY_PATH, TERMS_PATH } from "./lib/legal";
import { useVisualViewport } from "./hooks/useVisualViewport";
import { RouteMetadata } from "./components/RouteMetadata";
import { ABOUT_PATH } from "./lib/seo";
import { Toaster } from "./components/ui/toast";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

/**
 * Resolve depois que a casca chega na tela. Duplo rAF: o 1º roda antes do paint do
 * próprio frame; o 2º só depois de ele ser apresentado. Aba oculta não tem rAF:
 * resolve na hora pra não segurar o carregamento.
 */
function afterPaint() {
  return new Promise<void>((resolve) => {
    if (document.hidden) return resolve();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// Code-split por página (doc/regras/04-performance do base_vite): a cena 3D
// (Three.js, pesada) e a área /dale (admin) viram chunks separados. A cena só
// começa a baixar depois que a casca (loading, aviso de cookies) pinta: o
// download e a avaliação do Three.js não atrasam o 1º paint útil (LCP).
const CitySceneEditor = lazy(() =>
  afterPaint()
    .then(() => import("./components/CitySceneEditor"))
    .then((m) => ({ default: m.CitySceneEditor })),
);
const Login = lazy(() => import("./pages/admin/Login"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const TestBuildings = lazy(() => import("./pages/admin/TestBuildings"));
const Customizations = lazy(() => import("./pages/admin/Customizations"));
const Pass = lazy(() => import("./pages/admin/Pass"));
const EarlySignups = lazy(() => import("./pages/admin/EarlySignups"));
const Ibge = lazy(() => import("./pages/admin/Ibge"));
const Users = lazy(() => import("./pages/admin/Users"));
const Ongs = lazy(() => import("./pages/admin/Ongs"));

function PageFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center gap-3 bg-background pattern-paws text-muted-foreground">
      <BlockLoader />
      <span className="text-sm">Carregando…</span>
    </div>
  );
}

const SCENE_LOADING = { status: "loading", loadedBytes: 0, totalBytes: null } as const;

/** Texto, links e imagens públicas permanecem disponíveis enquanto a cena carrega. */
function SceneFallback() {
  return (
    <div className="h-svh w-full overflow-y-auto bg-background">
      <div id="scene-loading" className="relative h-svh w-full overflow-hidden bg-background">
        <DonationLoadOverlay cover state={SCENE_LOADING} onRetry={() => {}} />
      </div>
      <DonationInfoSection donations={[]} ongs={[]} filter={{}} loadState={SCENE_LOADING}
        onFilterChange={() => {}} onViewOng={() => {}} onRetry={() => {}} />
    </div>
  );
}

/** Compartilhado com o build: a primeira renderização é igual no servidor e no cliente. */
export function AppContent() {
  useVisualViewport();
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    let active = true;
    void afterPaint().then(() => { if (active) setClientReady(true); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <RouteMetadata />
      <Suspense fallback={<PageFallback />}>
        {/* Duas sessões independentes: cena (AuthProvider) e painel (AdminAuthProvider).
            Cada área só monta a própria — login numa nunca abre a outra. */}
        <Routes>
          {/* Cena 3D pública. Enquanto o chunk da cena baixa, segue a mesma página de
              loading do index.html (sem flash do "Carregando…"). */}
          <Route
            path="/"
            element={
              clientReady ? <AuthProvider>
                <Suspense fallback={<SceneFallback />}>
                  <CitySceneEditor />
                </Suspense>
              </AuthProvider> : <SceneFallback />
            }
          />

          {/* Documentos legais: públicos, sem sessão (link exigido pelo login com Google) */}
          <Route path={TERMS_PATH} element={<Terms />} />
          <Route path={PRIVACY_PATH} element={<Privacy />} />
          <Route path={ABOUT_PATH} element={<About />} />

          {/* Área admin */}
          <Route
            element={
              <AdminAuthProvider>
                <Suspense fallback={<PageFallback />}>
                  <Outlet />
                </Suspense>
              </AdminAuthProvider>
            }
          >
            <Route path="/dale/login" element={<Login />} />

            {/* Exige sessão do painel */}
            <Route element={<RequireAdmin />}>
              <Route path="/dale" element={<Dashboard />} />
              <Route path="/dale/edificios-teste" element={<TestBuildings />} />
              <Route path="/dale/personalizacoes" element={<Customizations />} />
              <Route path="/dale/passe" element={<Pass />} />
              <Route path="/dale/primeiros-inscritos" element={<EarlySignups />} />
              <Route path="/dale/ibge" element={<Ibge />} />
              <Route path="/dale/usuarios" element={<Users />} />
              <Route path="/dale/ongs" element={<Ongs />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {clientReady && <CookieNotice />}
      {clientReady && <Toaster />}
    </>
  );
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
