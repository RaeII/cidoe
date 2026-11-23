import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, ImagePlus, Pencil, Plus, Shirt, Trash2 } from "lucide-react";
import {
  addClubImage,
  createClub,
  deleteClub,
  deleteClubImage,
  getClubEvent,
  replaceClubImage,
  setClubEventActive,
  updateClub,
} from "@/api/admin/admin.routes";
import type { AdminClub, ClubEventOverview } from "@/api/admin/admin.types";
import { ApiError } from "@/api/http";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { normalizeSearch } from "@/lib/citySearch";
import { copyText } from "@/lib/clipboard";
import { encodeClubImage } from "@/lib/image";
import { SITE_URL } from "@/lib/seo";

// Mesmos limites do back (club_image / admin-club-event.schema).
const MAX_IMAGES = 12;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_TYPES = "image/jpeg,image/png,image/webp";

const clubLink = (slug: string) => `${SITE_URL}/?time=${slug}`;
/** "São Paulo FC" → "sao-paulo-fc": formato do link aceito pelo back. */
const toSlug = (name: string) => normalizeSearch(name).replace(/ /g, "-").slice(0, 40).replace(/-+$/, "");
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

async function copyLink(slug: string, host?: HTMLElement) {
  if (await copyText(clubLink(slug), host)) toast.success("Link copiado");
  else toast.error("Não foi possível copiar o link.");
}

/** Cadastro (nome, link, ativo) e, depois de criado, as imagens — cada ação de imagem grava na hora. */
function ClubEditor({ club: initial, onClose, onChanged }: {
  club: AdminClub | null;
  onClose: () => void;
  onChanged: (club: AdminClub, message: string) => void;
}) {
  const [club, setClub] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState<number | "new" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<number | null>(null);
  const busy = saving || imageBusy !== null;
  const canSave = name.trim() !== "" && (club !== null || SLUG.test(slug));

  function changeName(value: string) {
    setName(value);
    if (!club && !slugEdited) setSlug(toSlug(value));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (club) {
        onChanged(await updateClub(club.slug, { name: name.trim(), nickname: nickname.trim() || null, isActive: active }), "Time atualizado.");
        onClose();
      } else {
        // Fica aberto, já como edição: imagens só entram com o time criado.
        const created = await createClub({ slug, name: name.trim(), nickname: nickname.trim() || null, isActive: active });
        setClub(created);
        setStatus("Time cadastrado. Adicione as imagens.");
        onChanged(created, "Time cadastrado.");
      }
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar o time"));
    } finally {
      setSaving(false);
    }
  }

  /** Adiciona (sem `number`, uma por vez na ordem escolhida) ou troca a imagem `number`. */
  async function upload(files: File[], number: number | null) {
    if (!club || files.length === 0) return;
    setImageBusy(number ?? "new");
    setConfirmRemove(null);
    setStatus(null);
    setError(null);
    let current = club;
    try {
      for (const file of files) {
        let input;
        try {
          input = await encodeClubImage(file);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível ler a imagem");
          return;
        }
        current = number === null ? await addClubImage(current.slug, input) : await replaceClubImage(current.slug, number, input);
        setClub(current);
        onChanged(current, number === null ? "Imagem adicionada." : "Imagem trocada.");
      }
    } catch (err) {
      setError(errorMessage(err, "Não foi possível enviar a imagem"));
    } finally {
      setImageBusy(null);
    }
  }

  async function remove(number: number) {
    if (!club) return;
    setImageBusy(number);
    setStatus(null);
    setError(null);
    try {
      const updated = await deleteClubImage(club.slug, number);
      setClub(updated);
      setConfirmRemove(null);
      onChanged(updated, "Imagem removida.");
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover a imagem"));
    } finally {
      setImageBusy(null);
    }
  }

  const images = club?.images ?? [];
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[calc(var(--viewport-height,100dvh)-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{club ? "Editar time" : "Adicionar time"}</DialogTitle>
          <DialogDescription>{club ? clubLink(club.slug) : "Imagens entram depois de salvar."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5" aria-busy={busy}>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <label htmlFor="club-name" className="block mono-label">Nome</label>
              <Input id="club-name" value={name} maxLength={60} required onChange={(event) => changeName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="club-nickname" className="block mono-label">Apelido</label>
              <Input id="club-nickname" value={nickname} maxLength={30} aria-describedby="club-nickname-help" onChange={(event) => setNickname(event.target.value)} />
              <p id="club-nickname-help" className="text-xs text-muted-foreground">Opcional. O torcedor escolhe nome ou apelido no telão.</p>
            </div>
            {!club && (
              <div className="space-y-2">
                <label htmlFor="club-slug" className="block mono-label">Link</label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">?time=</span>
                  <Input id="club-slug" value={slug} maxLength={40} required aria-describedby="club-slug-help" aria-invalid={slug !== "" && !SLUG.test(slug)}
                    onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} />
                </div>
                <p id="club-slug-help" className="text-xs text-muted-foreground">Letras sem acento, números e hífen. Não muda depois.</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="club-active" className="text-sm font-medium">Time ativo</label>
              <Switch id="club-active" checked={active} onCheckedChange={setActive} />
            </div>
          </fieldset>

          {club && (
            <section aria-labelledby="club-images" className="space-y-3">
              <p className="flex items-baseline justify-between gap-3">
                <span id="club-images" className="mono-label">Imagens</span>
                <span className="font-mono text-[11px] text-muted-foreground">{images.length}/{MAX_IMAGES}</span>
              </p>
              {images.length > 0 && (
                <ul className="grid grid-cols-3 gap-3">
                  {images.map((image, index) => (
                    <li key={image.number} className="min-w-0 space-y-1.5">
                      <div className="relative aspect-square pixel pixel-thin bg-tinta p-1">
                        <img src={image.url} alt={`Imagem ${index + 1}`} width={256} height={256} decoding="async"
                          className={`size-full object-contain ${imageBusy === image.number ? "opacity-40" : ""}`} />
                        {index === 0 && <Badge variant="reward" className="absolute left-1 top-1">Capa</Badge>}
                        {imageBusy === image.number && <span role="status" aria-label="Processando imagem" className="absolute inset-0 grid place-items-center"><BlockLoader /></span>}
                      </div>
                      {confirmRemove === image.number ? (
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="xs" variant="destructive" disabled={busy} onClick={() => void remove(image.number)}>Remover</Button>
                          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button type="button" size="xs" variant="outline" disabled={busy} aria-label={`Trocar imagem ${index + 1}`}
                            onClick={() => { replaceTarget.current = image.number; replaceInput.current?.click(); }}>Trocar</Button>
                          <Button type="button" size="icon-xs" variant="ghost" disabled={busy} className="text-destructive" aria-label={`Remover imagem ${index + 1}`}
                            onClick={() => setConfirmRemove(image.number)}><Trash2 /></Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" disabled={busy || images.length >= MAX_IMAGES} onClick={() => addInput.current?.click()}>
                  {imageBusy === "new" ? <BlockLoader /> : <ImagePlus />}Adicionar imagem
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, até 10 MB. Recorte quadrado.</p>
              </div>
              <input ref={addInput} type="file" accept={IMAGE_TYPES} multiple hidden onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void upload(files, null);
              }} />
              <input ref={replaceInput} type="file" accept={IMAGE_TYPES} hidden onChange={(event) => {
                const files = [...(event.target.files ?? [])].slice(0, 1);
                event.target.value = "";
                if (replaceTarget.current !== null) void upload(files, replaceTarget.current);
              }} />
            </section>
          )}

          {status && <p role="status" className="text-sm text-secondary-foreground">{status}</p>}
          {error && <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{error}</p>}
          <DialogFooter>
            {club && <Button type="button" variant="ghost" disabled={busy} className="sm:mr-auto" onClick={(event) => void copyLink(club.slug, event.currentTarget.parentElement ?? undefined)}><Copy />Copiar link</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{club ? "Fechar" : "Cancelar"}</Button>
            <Button type="submit" disabled={busy || !canSave}>{saving && <BlockLoader />}{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Clubs() {
  const [data, setData] = useState<ClubEventOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<AdminClub | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminClub | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getClubEvent().then((result) => {
      if (!alive) return;
      setData(result);
      setLoadError(null);
    }).catch((err) => {
      if (alive) setLoadError(errorMessage(err, "Não foi possível carregar o evento"));
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [reloadKey]);

  const clubs = useMemo(() => {
    const query = normalizeSearch(term);
    return (data?.clubs ?? [])
      .filter((club) => !query || normalizeSearch(`${club.name} ${club.slug}`).includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data, term]);
  const listed = data?.clubs.filter((club) => club.isActive && club.images.length > 0).length ?? 0;

  function reload() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  function putClub(club: AdminClub) {
    setData((current) => current && {
      ...current,
      clubs: current.clubs.some((item) => item.slug === club.slug)
        ? current.clubs.map((item) => item.slug === club.slug ? club : item)
        : [...current.clubs, club],
    });
  }

  async function toggleEvent(isActive: boolean) {
    setBusy("event");
    setFeedback(null);
    try {
      const saved = await setClubEventActive(isActive);
      setData((current) => current && { ...current, isActive: saved });
      setFeedback({ ok: true, text: saved ? "Evento ligado." : "Evento desligado." });
    } catch (err) {
      setFeedback({ ok: false, text: errorMessage(err, "Não foi possível alterar o evento") });
    } finally {
      setBusy(null);
    }
  }

  async function toggleClub(club: AdminClub, isActive: boolean) {
    setBusy(club.slug);
    setFeedback(null);
    try {
      const updated = await updateClub(club.slug, { isActive });
      putClub(updated);
      setFeedback({ ok: true, text: `${updated.name}: ${isActive ? "ativado" : "desativado"}.` });
    } catch (err) {
      setFeedback({ ok: false, text: errorMessage(err, "Não foi possível alterar o time") });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteClub(toDelete.slug);
      setFeedback({ ok: true, text: `${toDelete.name} foi excluído.` });
      setToDelete(null);
      reload(); // participantes e trocas mudam junto
    } catch (err) {
      setDeleteError(errorMessage(err, "Não foi possível excluir o time"));
    } finally {
      setDeleting(false);
    }
  }

  const locked = busy !== null;
  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Shirt className="size-5" />
          <h1 className="text-lg font-semibold tracking-tight">Evento dos times</h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 md:pb-10">
            <p className="text-muted-foreground">Quem já tem time mantém as imagens no telão.</p>
            {loading && !data ? (
              <div role="status" aria-label="Carregando evento" className="mt-8 space-y-4">
                <Skeleton className="h-40 w-full" />
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : loadError && !data ? (
              <div className="mt-8 space-y-3">
                <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{loadError}</p>
                <Button variant="outline" onClick={reload}>Tentar novamente</Button>
              </div>
            ) : data && (
              <>
                <Card className="mt-8">
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <CardTitle>Evento</CardTitle>
                      <CardDescription>Desligado, o link não abre e ninguém escolhe ou troca de time.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {busy === "event" && <BlockLoader />}
                      <label htmlFor="club-event-active" className="text-sm font-medium">{data.isActive ? "Ligado" : "Desligado"}</label>
                      <Switch id="club-event-active" checked={data.isActive} disabled={locked} onCheckedChange={(value) => void toggleEvent(value)} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Celular: uma linha por número; "Participantes" não cabe em 1/3 da largura. */}
                    <dl className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                      {[["Participantes", data.participants], ["Trocas usadas", data.changesUsed], ["Na lista", listed]].map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-3 pixel pixel-thin bg-card px-3 py-2 sm:block sm:py-3">
                          <dt className="mono-label text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-xl font-semibold tracking-[-0.02em] sm:mt-1 sm:text-2xl">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{SITE_URL}/?time=</span>
                      <Button variant="outline" size="sm" onClick={(event) => void copyLink("", event.currentTarget.parentElement ?? undefined)}><Copy />Copiar link da lista</Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="mt-8">
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                    <CardTitle>Times</CardTitle>
                    <Button disabled={locked} onClick={() => setEditing("new")}><Plus />Adicionar time</Button>
                  </CardHeader>
                  <CardContent className="px-0">
                    <div className="px-6 pb-4">
                      <Input type="search" value={term} maxLength={60} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por nome ou link" aria-label="Buscar time" />
                    </div>
                    {clubs.length === 0 ? (
                      <p className="px-6 text-sm text-muted-foreground">Nenhum time encontrado.</p>
                    ) : (
                      <ul className="border-t border-border">
                        {clubs.map((club) => (
                          <li key={club.slug} className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 last:border-b-0 hover:bg-accent/50">
                            {club.images[0]
                              ? <img src={club.images[0].thumbUrl} alt="" width={96} height={96} loading="lazy" decoding="async" className="size-10 shrink-0 bg-tinta" />
                              : <span aria-hidden className="size-10 shrink-0 bg-secondary" />}
                            <div className="min-w-0 flex-1 basis-32">
                              <p className="break-words text-sm font-medium">{club.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {club.slug} · {plural(club.fans, "torcedor", "torcedores")} · {plural(club.images.length, "imagem", "imagens")}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant={club.isActive ? "default" : "muted"}>{club.isActive ? "Ativo" : "Inativo"}</Badge>
                              {club.images.length === 0 && <Badge variant="destructive">Sem imagem</Badge>}
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              {busy === club.slug && <BlockLoader />}
                              <Switch checked={club.isActive} disabled={locked} aria-label={`Time ativo: ${club.name}`} onCheckedChange={(value) => void toggleClub(club, value)} />
                              <Button variant="ghost" size="icon-sm" aria-label={`Copiar link: ${club.name}`} onClick={(event) => void copyLink(club.slug, event.currentTarget.parentElement ?? undefined)}><Copy /></Button>
                              <Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`Editar ${club.name}`} onClick={() => setEditing(club)}><Pencil /></Button>
                              <Button variant="ghost" size="icon-sm" disabled={locked} className="text-destructive" aria-label={`Excluir ${club.name}`} onClick={() => { setDeleteError(null); setToDelete(club); }}><Trash2 /></Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {feedback && <p role={feedback.ok ? "status" : "alert"} className={`px-6 pt-4 text-sm ${feedback.ok ? "text-secondary-foreground" : "text-destructive"}`}>{feedback.text}</p>}
                    <p className="px-6 pt-4 mono-label text-muted-foreground">{plural(data.clubs.length, "time", "times")}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </main>
        </div>
        <MobileNav />
      </SidebarInset>
      {editing !== null && <ClubEditor club={editing === "new" ? null : editing} onClose={() => setEditing(null)} onChanged={(club, message) => {
        putClub(club);
        setFeedback({ ok: true, text: `${club.name}: ${message.charAt(0).toLowerCase()}${message.slice(1)}` });
      }} />}
      <Dialog open={toDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setToDelete(null); }}>
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Excluir time</DialogTitle>
            <DialogDescription>
              Excluir {toDelete?.name} definitivamente? As imagens saem dos telões
              {toDelete?.fans ? ` e ${plural(toDelete.fans, "torcedor fica", "torcedores ficam")} sem time` : ""}. Para só tirar da lista, desative.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>{deleting && <BlockLoader />}{deleting ? "Excluindo…" : "Excluir time"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
