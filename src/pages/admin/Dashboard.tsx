import { useEffect, useState } from "react";
import { getDashboardStats } from "@/api/admin/admin.routes";
import type { DashboardStats } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { LocalEmailSettings } from "@/components/admin/LocalEmailSettings";
import { MobileNav } from "@/components/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ErrorMark } from "@/components/ui/pixel-icon";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="mono-label text-xs">{label}</CardDescription>
        <CardTitle className="text-3xl tracking-[-0.02em]">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function StatsGrid() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch só em callbacks assíncronos — sem setState síncrono no corpo do effect.
  // O estado inicial (loading=true) já cobre o primeiro render; o retry reseta antes de bumpar a key.
  useEffect(() => {
    let alive = true;
    getDashboardStats()
      .then((data) => {
        if (!alive) return;
        setStats(data);
        setError(null);
      })
      .catch((err) => {
        // 401 já é tratado pelo interceptor (derruba a sessão → volta pro login).
        if (alive) setError(err instanceof ApiError ? err.message : "Falha ao carregar métricas");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  function retry() {
    setStats(null);
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="pixel pixel-thin pixel-ink-ambar-700 bg-card p-6">
        <p className="flex gap-2 text-sm text-destructive">
          <ErrorMark />
          {error}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Doações" value={int.format(stats.donations.count)} />
      <StatCard label="Valor total" value={brl.format(stats.donations.total_value)} />
      <StatCard label="Ticket médio" value={brl.format(stats.donations.avg_value)} />
      <StatCard label="Maior doação" value={brl.format(stats.donations.max_value)} />
      <StatCard label="Cidades" value={int.format(stats.cities)} />
      <StatCard label="ONGs" value={int.format(stats.ongs)} />
      <StatCard label="Usuários" value={int.format(stats.users)} />
    </div>
  );
}

function Dashboard() {
  const { user } = useAdminAuth();

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <span className="text-lg font-semibold tracking-tight">Dashboard</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-5xl px-6 pt-8 pb-24 md:pb-10">
            <h1 className="text-3xl font-semibold tracking-tight">
              Olá, {user?.username ?? "admin"}
            </h1>
            <p className="mt-2 text-muted-foreground">Visão geral do sistema.</p>

            {/* Admin logado */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Sessão</CardTitle>
                <CardDescription>Administrador autenticado.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="mono-label text-muted-foreground">Username</span>
                  <span className="font-medium">{user?.username ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="mono-label text-muted-foreground">Email</span>
                  <span className="font-medium">{user?.email ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="mono-label text-muted-foreground">ID</span>
                  <span className="font-medium">{user?.id ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="mono-label text-muted-foreground">Admin</span>
                  <Badge variant={user?.is_admin ? "default" : "secondary"}>{user?.is_admin ? "sim" : "não"}</Badge>
                </div>
              </CardContent>
            </Card>

            {import.meta.env.DEV && <LocalEmailSettings />}

            {/* Métricas agregadas (GET /api/admin/dashboard/stats) */}
            <h2 className="mt-10 mb-4 mono-label text-muted-foreground">Métricas</h2>
            <StatsGrid />
          </main>
        </div>

        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default Dashboard;
