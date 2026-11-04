import { useEffect, useState, type FormEvent } from "react";
import { HeartHandshake, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createOng, deleteOng, listOngs, updateOng } from "@/api/admin/admin.routes";
import type { AdminOng, OngInput } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { resizeImage } from "@/lib/image";
import { pageWindow } from "@/lib/pagination";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function OngEditor({ ong, onClose, onSaved }: {
  ong: AdminOng | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ong?.name ?? "");
  const [image, setImage] = useState(ong?.profile_image ?? null);
  const [active, setActive] = useState(ong?.is_active ?? true);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || imageBusy;

  async function selectImage(file?: File) {
    if (!file) return;
    setImageBusy(true);
    setError(null);
    try {
      setImage(await resizeImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler a imagem");
    } finally {
      setImageBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setSaving(true);
    setError(null);
    const input: OngInput = { name: name.trim(), profile_image: image, is_active: active };
    try {
      if (ong) await updateOng(ong.id, input);
      else await createOng(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar a ONG"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[calc(var(--viewport-height,100dvh)-2rem)] overflow-y-auto" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{ong ? "Editar ONG" : "Adicionar ONG"}</DialogTitle>
          <DialogDescription>Nome e imagem aparecem no catálogo público das ONGs ativas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5" aria-busy={busy}>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <label htmlFor="ong-name" className="block mono-label">Nome</label>
              <Input id="ong-name" value={name} maxLength={255} required onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-3">
              <label htmlFor="ong-image" className="block mono-label">Imagem de perfil</label>
              <div className="flex items-center gap-4">
                <Avatar size="lg">
                  {image && <AvatarImage src={image} alt="Prévia da imagem da ONG" className="object-cover" />}
                  <AvatarFallback>{name.slice(0, 2).toUpperCase() || "ONG"}</AvatarFallback>
                </Avatar>
                {image && <Button type="button" variant="outline" size="sm" onClick={() => setImage(null)}>Remover imagem</Button>}
                {imageBusy && <span role="status" aria-label="Processando imagem"><BlockLoader /></span>}
              </div>
              <Input id="ong-image" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ong-image-help" onChange={(event) => {
                void selectImage(event.target.files?.[0]);
                event.target.value = "";
              }} />
              <p id="ong-image-help" className="text-xs text-muted-foreground">JPG, PNG ou WebP. Até 10 MB.</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="ong-active" className="text-sm font-medium">ONG ativa</label>
              <Switch id="ong-active" checked={active} onCheckedChange={setActive} />
            </div>
          </fieldset>
          {error && <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{saving && <BlockLoader />}{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Ongs() {
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [ongs, setOngs] = useState<AdminOng[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AdminOng | "new" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminOng | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listOngs({ search, page, limit: 20 }).then((result) => {
      if (!alive) return;
      setOngs(result.data);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setLoadError(null);
    }).catch((err) => {
      if (alive) setLoadError(errorMessage(err, "Não foi possível carregar as ONGs"));
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [search, page, reloadKey]);

  function reload() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(term.trim());
    setPage(1);
    reload();
  }

  function goToPage(next: number) {
    if (next < 1 || next > totalPages || next === page) return;
    setLoading(true);
    setPage(next);
  }

  async function toggleActive(ong: AdminOng, active: boolean) {
    setBusyId(ong.id);
    setFeedback(null);
    try {
      const updated = await updateOng(ong.id, { is_active: active });
      setOngs((list) => list.map((item) => item.id === updated.id ? updated : item));
      setFeedback({ ok: true, text: `${updated.name}: ${active ? "ativada" : "desativada"}.` });
    } catch (err) {
      setFeedback({ ok: false, text: errorMessage(err, "Não foi possível alterar o status") });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOng(toDelete.id);
      setFeedback({ ok: true, text: `${toDelete.name} foi excluída.` });
      setToDelete(null);
      if (ongs.length === 1 && page > 1) setPage(page - 1);
      reload();
    } catch (err) {
      setDeleteError(errorMessage(err, "Não foi possível excluir a ONG"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <HeartHandshake className="size-5" />
          <h1 className="text-lg font-semibold tracking-tight">ONGs</h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 md:pb-10">
            <p className="text-muted-foreground">ONGs desativadas ficam ocultas no catálogo público.</p>
            <Card className="mt-8">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>ONGs cadastradas</CardTitle>
                <Button disabled={busyId !== null} onClick={() => setEditing("new")}><Plus />Adicionar ONG</Button>
              </CardHeader>
              <CardContent className="px-0">
                <form onSubmit={submitSearch} className="flex gap-2 px-6 pb-4">
                  <Input value={term} maxLength={255} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por nome" aria-label="Buscar ONG" />
                  <Button type="submit" variant="outline" disabled={loading || busyId !== null}>{loading ? <BlockLoader /> : <Search />}<span className="hidden sm:inline">Buscar</span></Button>
                </form>
                {loading ? (
                  <div role="status" aria-label="Carregando ONGs" className="space-y-2 px-6">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : loadError ? (
                  <div className="space-y-3 px-6">
                    <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{loadError}</p>
                    <Button variant="outline" onClick={reload}>Tentar novamente</Button>
                  </div>
                ) : ongs.length === 0 ? (
                  <p className="px-6 text-sm text-muted-foreground">Nenhuma ONG encontrada.</p>
                ) : (
                  <ul className="border-t border-border">
                    {ongs.map((ong) => (
                      <li key={ong.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 last:border-b-0 hover:bg-accent/50">
                        <Avatar className="size-10">
                          {ong.profile_image && <AvatarImage src={ong.profile_image} alt="" className="object-cover" />}
                          <AvatarFallback>{ong.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 basis-24">
                          <p className="break-words text-sm font-medium">{ong.name}</p>
                          <span className="font-mono text-xs text-muted-foreground">#{ong.id}</span>
                        </div>
                        <Badge variant={ong.is_active ? "default" : "muted"}>{ong.is_active ? "Ativa" : "Inativa"}</Badge>
                        <div className="ml-auto flex items-center gap-2">
                          {busyId === ong.id && <BlockLoader />}
                          <Switch checked={ong.is_active} disabled={busyId !== null} aria-label={`ONG ativa: ${ong.name}`} onCheckedChange={(active) => void toggleActive(ong, active)} />
                          <Button variant="ghost" size="icon-sm" disabled={busyId !== null} aria-label={`Editar ${ong.name}`} onClick={() => setEditing(ong)}><Pencil /></Button>
                          <Button variant="ghost" size="icon-sm" disabled={busyId !== null} className="text-destructive" aria-label={`Excluir ${ong.name}`} onClick={() => { setDeleteError(null); setToDelete(ong); }}><Trash2 /></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {feedback && <p role={feedback.ok ? "status" : "alert"} className={`px-6 pt-4 text-sm ${feedback.ok ? "text-secondary-foreground" : "text-destructive"}`}>{feedback.text}</p>}
                {!loadError && <p className="px-6 pt-4 mono-label text-muted-foreground">{total} ONGs</p>}
                {totalPages > 1 && (
                  <Pagination className="px-6 pt-4">
                    <PaginationContent>
                      <PaginationItem><PaginationPrevious disabled={page <= 1 || loading || busyId !== null} onClick={() => goToPage(page - 1)} /></PaginationItem>
                      {pageWindow(page, totalPages).map((number, i) => (
                        <PaginationItem key={number === "…" ? `gap-${i}` : number}>
                          {number === "…" ? <PaginationEllipsis /> : <PaginationLink isActive={number === page} disabled={loading || busyId !== null} onClick={() => goToPage(number)}>{number}</PaginationLink>}
                        </PaginationItem>
                      ))}
                      <PaginationItem><PaginationNext disabled={page >= totalPages || loading || busyId !== null} onClick={() => goToPage(page + 1)} /></PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
        <MobileNav />
      </SidebarInset>
      {editing !== null && <OngEditor ong={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => {
        setEditing(null);
        setFeedback({ ok: true, text: editing === "new" ? "ONG cadastrada." : "ONG atualizada." });
        reload();
      }} />}
      <Dialog open={toDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Excluir ONG</DialogTitle>
            <DialogDescription>Excluir {toDelete?.name} definitivamente? ONGs com doações vinculadas devem ser desativadas.</DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>{deleting && <BlockLoader />}{deleting ? "Excluindo…" : "Excluir ONG"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
