import { useEffect, useState } from "react";
import {
  MoreVertical,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  TriangleAlert,
  Users as UsersIcon,
} from "lucide-react";
import { deleteUser, listUsers, setUserAdmin } from "@/api/admin/admin.routes";
import type { User } from "@/api/user/user.types";
import { ApiError } from "@/api/http";
import { pageWindow } from "@/lib/pagination";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const PAGE_SIZE = 20;

type Feedback = { ok: boolean; text: string } | null;

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** Linha da lista: identidade à esquerda, menu de ações à direita. */
function UserRow({
  user,
  isSelf,
  onToggleAdmin,
  onAskDelete,
}: {
  user: User;
  isSelf: boolean;
  onToggleAdmin: (next: boolean) => Promise<void>;
  onAskDelete: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await onToggleAdmin(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-6 py-2.5 last:border-b-0 hover:bg-accent/50">
      <Avatar className="size-9">
        {user.profile_image && (
          <AvatarImage src={user.profile_image} alt="" className="object-cover" />
        )}
        <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
          {initials(user.name ?? user.username)}
        </AvatarFallback>
      </Avatar>

      <div className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">
          {user.name ?? user.username}
          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          @{user.username}
          {user.email ? ` · ${user.email}` : ""}
        </span>
      </div>

      {user.is_admin && <Badge variant="muted">Admin</Badge>}

      <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
        #{user.id}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={saving}
            aria-label={`Ações de ${user.username}`}
          >
            {saving ? <BlockLoader /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            // Tirar o próprio admin fecha a porta por dentro — o backend recusa.
            disabled={isSelf}
            onSelect={() => void handleToggle(!user.is_admin)}
          >
            {user.is_admin ? <ShieldOff /> : <Shield />}
            {user.is_admin ? "Remover admin" : "Tornar admin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onAskDelete}>
            <Trash2 />
            Excluir usuário
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Users() {
  const { user: me } = useAdminAuth();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState<User[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Alvo da exclusão: null = diálogo fechado. Guarda o usuário inteiro para o
  // texto de confirmação nomear quem vai embora.
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch só em callback assíncrono — o estado inicial (loading=true) cobre o
  // 1º render e quem muda busca/página liga o loading ANTES de mexer na dep.
  useEffect(() => {
    let alive = true;
    listUsers({ search, page, limit: PAGE_SIZE })
      .then((res) => {
        if (!alive) return;
        setUsers(res.data);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.totalPages);
        setLoadError(null);
      })
      .catch((err) => {
        // 401 cai no interceptor (derruba a sessão).
        if (alive) setLoadError(errMsg(err, "Falha ao carregar usuários"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, page, reloadKey]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = term.trim();
    setLoading(true);
    setPage(1);
    setSearch(next);
    // Buscar o mesmo termo não muda dep nenhuma — a key força o refetch.
    if (next === search && page === 1) setReloadKey((k) => k + 1);
  }

  function goToPage(next: number) {
    if (next === page || next < 1 || next > totalPages) return;
    setLoading(true);
    setPage(next);
  }

  function retry() {
    setLoadError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  async function toggleAdmin(target: User, next: boolean) {
    setFeedback(null);
    try {
      const updated = await setUserAdmin(target.id, next);
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      setFeedback({
        ok: true,
        text: next
          ? `@${updated.username} agora é admin. Atualize a página para visualizar o acesso.`
          : `@${updated.username} não é mais admin.`,
      });
    } catch (err) {
      setFeedback({ ok: false, text: errMsg(err, "Falha ao alterar o acesso") });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(toDelete.id);
      setFeedback({ ok: true, text: `@${toDelete.username} foi excluído.` });
      setToDelete(null);
      // A página encolheu: se era o último da última página, recua uma.
      const lastOnPage = users.length === 1 && page > 1;
      setLoading(true);
      if (lastOnPage) setPage(page - 1);
      else setReloadKey((k) => k + 1);
    } catch (err) {
      // Mantém o diálogo aberto com o motivo (ex.: 403).
      setDeleteError(errMsg(err, "Falha ao excluir o usuário"));
    } finally {
      setDeleting(false);
    }
  }

  const deletingSelf = toDelete != null && toDelete.id === me?.id;

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <UsersIcon className="size-5" />
          <span className="text-lg font-semibold tracking-tight">Usuários</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 md:pb-10">
            <p className="text-muted-foreground">
              Administra as contas da aplicação. Admin entra no painel <code>/dale</code> e usa
              todas as personalizações da cena sem precisar cumprir o passe.
            </p>

            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Contas</CardTitle>
                <CardDescription>
                  O menu de cada linha dá ou tira acesso de administrador e exclui a conta.
                  As permissões mudam imediatamente.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-0">
                <form onSubmit={submitSearch} className="flex gap-2 px-6 pb-4">
                  <Input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Buscar por username, nome ou e-mail"
                    aria-label="Buscar usuário"
                  />
                  <Button type="submit" variant="outline" disabled={loading}>
                    {loading ? <BlockLoader /> : <Search />}
                    <span className="hidden sm:inline">Buscar</span>
                  </Button>
                </form>

                {loading ? (
                  <div className="space-y-2 px-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : loadError ? (
                  <div className="mx-6 pixel pixel-thin pixel-ink-ambar-700 bg-card p-6">
                    <p className="flex gap-2 text-sm text-destructive">
                      <ErrorMark />
                      {loadError}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={retry}
                    >
                      Tentar de novo
                    </Button>
                  </div>
                ) : users.length === 0 ? (
                  <p className="px-6 text-sm text-muted-foreground">
                    Nenhum usuário encontrado.
                  </p>
                ) : (
                  <div className="border-t border-border">
                    {users.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        isSelf={u.id === me?.id}
                        onToggleAdmin={(next) => toggleAdmin(u, next)}
                        onAskDelete={() => {
                          setDeleteError(null);
                          setToDelete(u);
                        }}
                      />
                    ))}
                  </div>
                )}

                {feedback && (
                  <p
                    className={`flex gap-2 px-6 pt-4 text-sm ${
                      feedback.ok ? "text-secondary-foreground" : "text-destructive"
                    }`}
                  >
                    {!feedback.ok && <ErrorMark />}
                    {feedback.text}
                  </p>
                )}

                {totalPages > 1 && (
                  <div className="flex flex-col items-center gap-2 px-6 pt-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            disabled={page <= 1 || loading}
                            onClick={() => goToPage(page - 1)}
                          />
                        </PaginationItem>

                        {pageWindow(page, totalPages).map((p, i) => (
                          <PaginationItem key={p === "…" ? `gap-${i}` : p}>
                            {p === "…" ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                isActive={p === page}
                                disabled={loading}
                                onClick={() => goToPage(p)}
                              >
                                {p}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}

                        <PaginationItem>
                          <PaginationNext
                            disabled={page >= totalPages || loading}
                            onClick={() => goToPage(page + 1)}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                    <span className="mono-label text-muted-foreground">{total} usuários</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
        </div>

        <MobileNav />
      </SidebarInset>

      {/* Confirmação da exclusão — irreversível, então nomeia quem vai embora. */}
      <Dialog open={toDelete != null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              Excluir @{toDelete?.username}?
            </DialogTitle>
            <DialogDescription>
              Apaga a conta e tudo que é dela: doações, personalizações, indicações e
              identidades de login. Não dá pra desfazer — o e-mail volta a ficar livre para um
              novo cadastro.
            </DialogDescription>
          </DialogHeader>

          {deletingSelf && (
            <p className="flex gap-2 text-sm text-destructive">
              <ErrorMark />
              <span>
                Esta é a sua conta. Você perde o acesso ao painel na hora — só
                <code className="mx-1">scripts/create-admin.ts</code> devolve.
              </span>
            </p>
          )}
          {deleteError && (
            <p className="flex gap-2 text-sm text-destructive">
              <ErrorMark />
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <BlockLoader /> : <Trash2 />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export default Users;
