import { useEffect, useState } from "react";
import { Blocks, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  createTestBuildings,
  deleteAllBuildings,
  getDashboardStats,
} from "@/api/admin/admin.routes";
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
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const int = new Intl.NumberFormat("pt-BR");
const MAX_COUNT = 200_000;

/** Mensagem inline de resultado (sucesso ou erro). */
type Feedback = { ok: boolean; text: string } | null;

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={`flex gap-2 text-sm ${feedback.ok ? "text-secondary-foreground" : "text-destructive"}`}>
      {!feedback.ok && <ErrorMark />}
      {feedback.text}
    </p>
  );
}

function TestBuildings() {
  // Total atual de edifícios (= doações). Fonte inicial: stats do dashboard.
  const [total, setTotal] = useState<number | null>(null);

  const [count, setCount] = useState("1000");
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<Feedback>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);

  // Total inicial. setState só em callback assíncrono (regra set-state-in-effect).
  useEffect(() => {
    let alive = true;
    getDashboardStats()
      .then((s) => {
        if (alive) setTotal(s.donations.count);
      })
      .catch(() => {
        /* 401 já cai no interceptor; total fica null (mostra "—") */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleCreate() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) {
      setCreateFeedback({ ok: false, text: `Informe um inteiro entre 1 e ${int.format(MAX_COUNT)}.` });
      return;
    }
    setCreating(true);
    setCreateFeedback(null);
    try {
      const res = await createTestBuildings(n);
      setTotal(res.total_active);
      setCreateFeedback({
        ok: true,
        text: `+${int.format(res.inserted)} criados. Total: ${int.format(res.total_active)}.`,
      });
    } catch (err) {
      setCreateFeedback({ ok: false, text: errMsg(err, "Falha ao criar edifícios") });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteFeedback(null);
    try {
      const res = await deleteAllBuildings(password);
      setTotal(0);
      setConfirmOpen(false);
      setPassword("");
      setDeleteFeedback({ ok: true, text: `${int.format(res.deleted)} edifícios excluídos.` });
    } catch (err) {
      // Senha errada = 403; mantém o sheet aberto pra nova tentativa.
      setDeleteFeedback({ ok: false, text: errMsg(err, "Falha ao excluir") });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Blocks className="size-5" />
          <span className="text-lg font-semibold tracking-tight">Edifícios de teste</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 md:pb-10">
            <p className="text-muted-foreground">
              Gera edifícios fictícios (valor, cidade/região e ONG aleatórios) para testar render e
              velocidade de carga da cena. Cada criação <strong>soma</strong> ao banco.
            </p>

            {/* Total atual */}
            <Card className="mt-8">
              <CardHeader>
                <CardDescription className="mono-label text-xs">Edifícios no banco</CardDescription>
                <CardTitle className="text-4xl tracking-[-0.02em]">
                  {total === null ? "—" : int.format(total)}
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Criar */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Criar edifícios</CardTitle>
                <CardDescription>Quantidade por chamada: 1 a {int.format(MAX_COUNT)}.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="sm:max-w-48">
                  <Input
                    type="number"
                    label="Quantidade"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <Button onClick={() => void handleCreate()} disabled={creating}>
                  {creating ? <BlockLoader /> : <Plus />}
                  Criar
                </Button>
                <FeedbackLine feedback={createFeedback} />
              </CardContent>
            </Card>

            {/* Zona de perigo */}
            <Card className="mt-6 pixel-ink-ambar-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <TriangleAlert className="size-5" />
                  Zona de perigo
                </CardTitle>
                <CardDescription>
                  Exclui <strong>TODOS</strong> os edifícios do banco (não só os de teste).
                  Irreversível. Exige a senha de confirmação.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 />
                  Excluir todos os edifícios
                </Button>
                <FeedbackLine feedback={deleteFeedback} />
              </CardContent>
            </Card>
          </main>
        </div>

        <MobileNav />
      </SidebarInset>

      {/* Confirmação da exclusão — senha obrigatória. */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              Excluir todos os edifícios?
            </SheetTitle>
            <SheetDescription>
              Apaga todas as doações do banco. Não dá pra desfazer. Digite a senha de confirmação
              (definida no <code>.env</code> do backend) para continuar.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-2 px-4">
            <Input
              type="password"
              label="Senha de confirmação"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && !deleting) void handleDelete();
              }}
              disabled={deleting}
            />
            {deleteFeedback && !deleteFeedback.ok ? (
              <p className="flex gap-2 text-sm text-destructive">
                <ErrorMark />
                {deleteFeedback.text}
              </p>
            ) : null}
          </div>

          <SheetFooter>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting || !password}
            >
              {deleting ? <BlockLoader /> : <Trash2 />}
              Excluir tudo
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

export default TestBuildings;
