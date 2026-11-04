import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, MapPinned, RefreshCw } from "lucide-react";
import { getIbgeStatus, syncIbge } from "@/api/admin/admin.routes";
import type { IbgeStatus } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const int = new Intl.NumberFormat("pt-BR");

type Feedback = { ok: boolean; text: string } | null;

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function CountCard({ label, value }: { label: string; value: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="mono-label text-xs">{label}</CardDescription>
        <CardTitle className="text-3xl tracking-[-0.02em]">
          {value === null ? "—" : int.format(value)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function Ibge() {
  const [status, setStatus] = useState<IbgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Carrega o status inicial (e a cada retry). setState só em callback assíncrono.
  useEffect(() => {
    let alive = true;
    getIbgeStatus()
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        setLoadError(null);
      })
      .catch((err) => {
        // 401 cai no interceptor (derruba a sessão).
        if (alive) setLoadError(errMsg(err, "Falha ao carregar status"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  function retry() {
    setStatus(null);
    setLoadError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  async function handleSync() {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await syncIbge();
      // Sync bem-sucedido: as contagens vêm na resposta → vinculado.
      setStatus({ linked: true, ...res });
      setFeedback({
        ok: true,
        text: `Vinculado: ${int.format(res.regions)} regiões, ${int.format(res.states)} estados, ${int.format(res.cities)} municípios.`,
      });
    } catch (err) {
      setFeedback({ ok: false, text: errMsg(err, "Falha ao sincronizar") });
    } finally {
      setSyncing(false);
    }
  }

  const linked = status?.linked ?? false;

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <MapPinned className="size-5" />
          <span className="text-lg font-semibold tracking-tight">IBGE</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 md:pb-10">
            <p className="text-muted-foreground">
              Carrega no banco o catálogo geográfico do IBGE — regiões, estados e municípios do
              Brasil — para vincular doações e ONGs a uma cidade. A sincronização é{" "}
              <strong>idempotente</strong>: rodar de novo apenas atualiza os dados.
            </p>

            {/* Status */}
            {loading ? (
              <Skeleton className="mt-8 h-28 w-full" />
            ) : loadError ? (
              <div className="mt-8 pixel pixel-thin pixel-ink-ambar-700 bg-card p-6">
                <p className="flex gap-2 text-sm text-destructive">
                  <ErrorMark />
                  {loadError}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                  Tentar de novo
                </Button>
              </div>
            ) : (
              <>
                <Card className="mt-8">
                  <CardHeader>
                    <CardDescription className="mono-label text-xs">Status do catálogo</CardDescription>
                    <CardTitle
                      className={`flex items-center gap-2 text-2xl ${
                        linked ? "text-secondary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {linked ? (
                        <CheckCircle2 className="size-6" />
                      ) : (
                        <CircleDashed className="size-6" />
                      )}
                      {linked ? "Dados vinculados" : "Não vinculado"}
                    </CardTitle>
                  </CardHeader>
                </Card>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <CountCard label="Regiões" value={status?.regions ?? null} />
                  <CountCard label="Estados" value={status?.states ?? null} />
                  <CountCard label="Municípios" value={status?.cities ?? null} />
                </div>
              </>
            )}

            {/* Ação */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{linked ? "Ressincronizar" : "Vincular dados"}</CardTitle>
                <CardDescription>
                  Busca regiões, estados e municípios na API pública do IBGE e grava no banco.
                  Leva alguns segundos.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button onClick={() => void handleSync()} disabled={syncing || loading}>
                  {syncing ? <BlockLoader /> : <RefreshCw />}
                  {syncing ? "Sincronizando…" : linked ? "Ressincronizar" : "Vincular dados do IBGE"}
                </Button>
                {feedback ? (
                  <p className={`flex gap-2 text-sm ${feedback.ok ? "text-secondary-foreground" : "text-destructive"}`}>
                    {!feedback.ok && <ErrorMark />}
                    {feedback.text}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </main>
        </div>

        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default Ibge;
