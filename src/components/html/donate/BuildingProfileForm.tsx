import { useAuth } from "@/hooks/useAuth";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import {
  fetchBuildingProfile,
  saveBuildingProfile,
  type BuildingProfile,
} from "@/api/contributionApi";
import { resizeImage } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark } from "@/components/ui/pixel-icon";
import { cn } from "@/lib/utils";
import { SimulationNotice } from "./SimulationNotice";

const NAME_MAX = 40;
const DESCRIPTION_MAX = 160;
const EMPTY_PROFILE: BuildingProfile = { name: null, description: null, image: null };

const labelClass = "mb-2 block mono-label text-foreground";
const textareaClass = "field w-full min-w-0 resize-none px-3.5 py-3 text-base md:text-sm";
/** Erro do DS: "!" + frase em âmbar escuro, sem vermelho. */

/**
 * Imagem, nome e descrição do edifício — tudo opcional, público no card do edifício.
 * Carrega o perfil atual antes de liberar os campos: o save substitui tudo, então
 * começar vazio apagaria o que já existe.
 */
export function BuildingProfileForm({
  id,
  donationId,
  submitLabel,
  onDone,
  onSkip,
  onEditStateChange,
  showActions = true,
  disabled = false,
}: {
  id?: string;
  donationId: number;
  submitLabel: string;
  /** Salvo (ou nada mudou). */
  onDone: (profile: BuildingProfile) => void;
  onSkip?: () => void;
  onEditStateChange?: (state: { dirty: boolean; busy: boolean; ready: boolean; error: string | null }) => void;
  showActions?: boolean;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const nameId = useId();
  const descriptionId = useId();
  const counterId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [initial, setInitial] = useState<BuildingProfile>(EMPTY_PROFILE);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = (name.trim() || null) !== initial.name ||
    (description.trim() || null) !== initial.description || image !== initial.image;

  useEffect(() => {
    onEditStateChange?.({ dirty, busy: saving || imageBusy, ready: loadState === "ready", error: saveError ?? (loadState === "error" ? "Não foi possível carregar as informações." : null) });
  }, [dirty, saving, imageBusy, loadState, saveError, onEditStateChange]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBuildingProfile(donationId, controller.signal, user?.id).then(
      (profile) => {
        if (controller.signal.aborted) return;
        const loaded = profile ?? EMPTY_PROFILE;
        setInitial(loaded);
        setName(loaded.name ?? "");
        setDescription(loaded.description ?? "");
        setImage(loaded.image);
        setLoadState("ready");
      },
      () => {
        if (!controller.signal.aborted) setLoadState("error");
      },
    );
    return () => controller.abort();
  }, [donationId, attempt, user?.id]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    setImageError(null);
    try {
      // Recodifica em canvas: descarta EXIF (GPS) e cabe no limite de 1 MB do backend.
      setImage(await resizeImage(file, 800));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Não foi possível ler a imagem");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loadState !== "ready" || saving || imageBusy || disabled) return;
    const profile: BuildingProfile = {
      name: name.trim() || null,
      description: description.trim() || null,
      image,
    };
    const changed =
      profile.name !== initial.name ||
      profile.description !== initial.description ||
      profile.image !== initial.image;
    if (!changed) return onDone(profile);

    setSaving(true);
    setSaveError(null);
    try {
      if (!user) throw new Error("Entre na sua conta para salvar.");
      await saveBuildingProfile(user.id, donationId, profile);
      onDone(profile);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <>
      <div>
        <p className="text-sm text-muted-foreground">Informações opcionais, salvas apenas neste navegador.</p>
      </div>
      <fieldset disabled={loadState !== "ready" || saving || imageBusy || disabled} className={cn("min-w-0 space-y-5", onSkip && "md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-8 md:space-y-0")}>
        <div>
          <p className={labelClass}>Imagem</p>
          <div className="flex items-start gap-3 md:block md:space-y-3">
            <button
              type="button"
              aria-label={image ? "Trocar imagem" : "Adicionar imagem"}
              disabled={imageBusy}
              onClick={() => fileRef.current?.click()}
              className="grid aspect-[3/2] w-28 shrink-0 place-items-center overflow-hidden pixel pixel-thin raised press bg-muted text-muted-foreground hover:pixel-ink-verde disabled:cursor-wait md:w-full md:max-w-64 md:[--pixel-w:3px]"
            >
              {imageBusy ? (
                <BlockLoader />
              ) : image ? (
                <img src={image} alt="" className="size-full object-cover" />
              ) : (
                <ImagePlus aria-hidden="true" className="size-8" />
              )}
            </button>
            <div className="min-w-0 space-y-2">
              {image ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-11" disabled={imageBusy} onClick={() => fileRef.current?.click()}>
                    Trocar
                  </Button>
                  <Button type="button" variant="ghost" className="h-11" disabled={imageBusy} onClick={() => setImage(null)}>
                    Remover
                  </Button>
                </div>
              ) : <Button type="button" variant="outline" className="min-h-11 whitespace-normal px-3" onClick={() => fileRef.current?.click()}>Adicionar imagem</Button>}
              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. Até 10 MB.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          {imageError && (
            <p role="alert" className="mt-2 flex gap-1.5 text-sm text-destructive">
              <ErrorMark />
              {imageError}
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          <div>
            <label htmlFor={nameId} className={labelClass}>
              Nome do edifício
            </label>
            <Input id={nameId} maxLength={NAME_MAX} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor={descriptionId} className="mono-label text-foreground">
                Descrição
              </label>
              <span id={counterId} className="font-mono text-[11px] text-muted-foreground">
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              id={descriptionId}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              aria-describedby={counterId}
              className={textareaClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      </fieldset>
    </>
  );

  return (
    <form id={id} onSubmit={handleSubmit} aria-busy={loadState === "loading" || saving || imageBusy || disabled} className={showActions ? "flex min-h-0 flex-1 flex-col" : "space-y-5"}>
      <div className={cn("space-y-5", showActions && "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8")}>
        {loadState === "loading" && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><BlockLoader />Carregando informações…</p>}
        {loadState === "error" && (
          <p role="alert" className="flex flex-wrap gap-1.5 text-sm text-destructive">
            <ErrorMark />
            Não foi possível carregar.{" "}
            <button type="button" className="font-semibold underline decoration-2 underline-offset-4" onClick={() => {
              setLoadState("loading");
              setAttempt((n) => n + 1);
            }}>Tentar de novo</button>
          </p>
        )}
        {fields}
        {saveError && (showActions || !onEditStateChange) && (
          <p role="alert" className="flex gap-1.5 text-sm text-destructive">
            <ErrorMark />
            {saveError}
          </p>
        )}
      </div>
      {showActions && <div className="flex shrink-0 flex-col-reverse gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {onSkip && <Button type="button" variant="ghost" className="h-12" disabled={saving || imageBusy || disabled} onClick={onSkip}>Agora não</Button>}
        <Button type="submit" size="lg" className={onSkip ? "sm:min-w-52" : "w-full"} disabled={loadState !== "ready" || saving || imageBusy || disabled}>
          {saving && <BlockLoader />}
          {saving ? "Salvando…" : submitLabel}
        </Button>
      </div>}
    </form>
  );
}

/** "Editar nome e imagem" a partir do card do edifício. `donationId` null = fechado. */
export function BuildingProfileDialog({
  donationId,
  onClose,
  onSaved,
}: {
  donationId: number | null;
  onClose: () => void;
  onSaved: (donationId: number, profile: BuildingProfile) => void;
}) {
  return (
    <Dialog open={donationId !== null} onOpenChange={(open) => !open && onClose()}>
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent
        className="flex max-h-[calc(var(--viewport-height,100dvh)-2rem)] flex-col gap-0 overflow-hidden p-0 pb-1.5 text-foreground sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 px-5 pb-2 pt-6 sm:px-8 sm:pt-8">
          <DialogTitle>Seu edifício</DialogTitle>
        </DialogHeader>
        {donationId !== null && (
          <BuildingProfileForm
            donationId={donationId}
            submitLabel="Salvar"
            onDone={(profile) => {
              onSaved(donationId, profile);
              onClose();
            }}
          />
        )}
        <SimulationNotice />
      </DialogContent>
    </Dialog>
  );
}
