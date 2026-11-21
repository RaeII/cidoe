import { useEffect, useState, type ReactNode } from "react";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { ApiError } from "@/api/http";
import { useAuth } from "@/hooks/useAuth";
import { useClubCatalog } from "@/components/hooks/useClubCatalog";
import { useMyClub } from "@/components/hooks/useMyClub";
import { clubImages, findClub, remapScreenImages, searchClubs, type Club } from "@/lib/clubs";
import { cn } from "@/lib/utils";
import { RewardConfetti } from "@/components/pass/RewardConfetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark, PixelArrow, PixelCheck } from "@/components/ui/pixel-icon";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type View = "loading" | "error" | "login" | "gate" | "list" | "offer" | "mine" | "won";

/** As imagens do telão: a própria recompensa, sem texto explicando. */
function ClubImages({ club, animate = false }: { club: Club; animate?: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <ul aria-label={`Imagens do telão: ${club.name}`} className="grid grid-cols-3 gap-2 sm:gap-3">
      {clubImages(club).map((image, index) => (
        <m.li key={image.key} className="aspect-square pixel pixel-thin bg-tinta p-1.5"
          initial={animate && (reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 })}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reducedMotion ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 20, delay: index * 0.08 }}>
          <img src={image.url} alt={image.label} width={256} height={256} decoding="async" className="size-full object-contain" />
        </m.li>
      ))}
    </ul>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{children}</p>;
}

/**
 * Evento dos times. Link `?time=<slug>` propõe o time; visitante entra aqui mesmo (login embutido,
 * nada empilha); depois aceita ou escolhe outro e ganha as imagens do telão. Uma troca depois da
 * escolha: usada, o botão some. Times e imagens vêm do catálogo (admin em /dale/times); evento
 * desligado fecha sem aparecer. Montado sob demanda (lazy) pelo AuthMenu.
 */
export default function ClubEventDialog({ initialClub, startPicking = false, loginPanel, gate, onChosen, onClose }: {
  /** Slug do link; ausente, desconhecido ou time inativo: lista (sem time) ou o time atual. */
  initialClub: string | null;
  /** Abre direto na lista (Trocar time no telão). */
  startPicking?: boolean;
  /** `AuthPanel` com a indicação do link, montado no lugar do conteúdo. */
  loginPanel: ReactNode;
  /** Etapa obrigatória da conta antes de escolher (ex.: reaceite dos termos), no lugar do conteúdo. */
  gate?: ReactNode;
  /** Escolha gravada: editor passa os telões montados por `remap` (mesma posição no time novo). */
  onChosen: (remap: (keys: readonly string[]) => string[]) => void;
  onClose: () => void;
}) {
  const { user, isLoading } = useAuth();
  const catalog = useClubCatalog();
  const mine = useMyClub(user?.id);
  const reducedMotion = useReducedMotion();
  const [candidateSlug, setCandidateSlug] = useState(initialClub);
  const [picking, setPicking] = useState(startPicking);
  const [query, setQuery] = useState("");
  const [won, setWon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clubs = catalog.catalog?.clubs ?? [];
  const eventOff = catalog.catalog?.isActive === false;
  // Evento desligado pelo admin: link não faz nada.
  useEffect(() => { if (eventOff) onClose(); }, [eventOff, onClose]);

  // Só time ativo é oferecido; o atual aparece mesmo inativo (quem torce mantém as imagens).
  const found = findClub(clubs, candidateSlug);
  const candidate = found?.isActive ? found : null;
  const current = findClub(clubs, mine.club);
  // Servidor diz se ainda pode escolher (sem time = true). Slug que o front não conhece não destrava a troca.
  const canPick = mine.canChange;
  let view: View;
  if (catalog.error) view = "error";
  else if (isLoading) view = "loading";
  else if (!user) view = "login";
  else if (gate) view = "gate";
  else if (!mine.ready && !mine.error) view = "loading";
  else if (!mine.ready) view = "error";
  else if (won && current) view = "won";
  else if (canPick && (picking || (!candidate && !current))) view = "list";
  else if (canPick && candidate && candidate.slug !== current?.slug) view = "offer";
  else if (current) view = "mine";
  else view = "list";

  async function accept() {
    if (!candidate || saving) return;
    setSaving(true);
    setError(null);
    try {
      await mine.choose(candidate.slug);
      const slug = candidate.slug;
      onChosen((keys) => remapScreenImages(clubs, keys, slug));
      setWon(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  function pick(club: Club) {
    setCandidateSlug(club.slug);
    setPicking(false);
    setQuery("");
    setError(null);
  }

  function openList() {
    setPicking(true);
    setError(null);
  }

  const results = view === "list" ? searchClubs(clubs, query) : [];
  const shown = view === "offer" ? candidate! : current!;

  // Catálogo carregando (ou evento desligado, fechando): nada na tela, sem piscar o modal.
  // O editor segue segurando os outros modais enquanto o evento está aberto.
  if ((!catalog.catalog && !catalog.error) || eventOff) return null;

  return (
    <LazyMotion features={domAnimation} strict>
      <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
        <DialogContent
          className="gap-0 p-0 pb-1 text-foreground motion-reduce:animate-none sm:max-w-md"
          // Foco no próprio modal: na lista, o campo de busca abriria o teclado do celular por cima dos times.
          onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}
          onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
          onInteractOutside={(event) => { if (saving) event.preventDefault(); }}
        >
          {view === "won" && !reducedMotion && <RewardConfetti />}
          <div aria-hidden className="h-1.5 bg-ambar" />
          <div className="space-y-6 px-5 pt-9 pb-5 sm:px-7 sm:pb-6">
            {view === "loading" && <div role="status" className="grid min-h-48 place-items-center">
              <DialogTitle className="sr-only">Seu time</DialogTitle>
              <BlockLoader /><DialogDescription className="sr-only">Carregando</DialogDescription>
            </div>}

            {view === "error" && <>
              <DialogTitle>Seu time</DialogTitle>
              <DialogDescription role="alert" className="flex gap-2 text-destructive"><ErrorMark />{catalog.error ?? mine.error}</DialogDescription>
              <Button className="w-full" onClick={catalog.error ? catalog.retry : mine.retry}>Tentar de novo</Button>
            </>}

            {view === "login" && <>
              {candidate && <ClubImages club={candidate} />}
              <p className="text-center text-sm text-muted-foreground sm:text-left">
                {candidate ? "Entre para ganhar estas imagens no telão do seu edifício." : "Entre para escolher seu time."}
              </p>
              <div className="grid gap-4">{loginPanel}</div>
            </>}

            {view === "gate" && <div className="grid gap-4">{gate}</div>}

            {view === "list" && <>
              <div className="space-y-4">
                <DialogTitle className="text-center">Escolha seu time</DialogTitle>
                <DialogDescription className="sr-only">Seu time ganha imagens para o telão do seu edifício.</DialogDescription>
                <Input type="search" aria-label="Buscar time" placeholder="Buscar time" autoComplete="off" enterKeyHint="search"
                  value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              {results.length > 0 ? (
                <ul aria-label="Times" className="-m-1 grid max-h-[min(24rem,calc(var(--viewport-height,100dvh)-17rem))] min-h-32 grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain p-1">
                  {results.map((club) => {
                    const isCurrent = club.slug === current?.slug;
                    return (
                      <li key={club.slug}>
                        <button type="button" onClick={() => pick(club)} aria-current={isCurrent || undefined}
                          className={cn("focus-inset flex w-full items-center gap-2.5 pixel pixel-thin p-1.5 pr-2.5 text-left text-sm leading-tight font-semibold transition-colors", isCurrent ? "pixel-ink-verde bg-secondary" : "bg-card hover:bg-accent")}>
                          <img src={club.thumbUrl} alt="" width={96} height={96} loading="lazy" decoding="async" className="size-10 shrink-0 bg-tinta" />
                          <span className="min-w-0 break-words">{club.name}</span>
                          {isCurrent && <PixelCheck aria-hidden className="ml-auto size-3 shrink-0 text-primary" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p role="status" className="grid min-h-32 place-items-center text-sm text-muted-foreground">Nenhum time encontrado.</p>}
              {(candidate || current) && (
                <Button variant="ghost" className="w-full" onClick={() => setPicking(false)}><PixelArrow className="rotate-180" />Voltar</Button>
              )}
            </>}

            {view === "offer" && <>
              <div className="text-center">
                {/* Já tem time: aceitar troca. O kicker mostra isso sem explicar a regra. */}
                {current && <p className="mono-label mb-2 text-primary">Seu time: {current.name}</p>}
                <DialogTitle className="text-[28px] sm:text-[32px]">{shown.name} é seu time?</DialogTitle>
                <DialogDescription className="mt-2">Imagens para o telão do seu edifício.</DialogDescription>
              </div>
              <ClubImages club={shown} />
              {error && <ErrorLine>{error}</ErrorLine>}
              <div className="space-y-2">
                <Button className="w-full" size="lg" variant="reward" disabled={saving} onClick={() => void accept()}>
                  {saving ? <><BlockLoader />Salvando…</> : "Sim, é meu time"}
                </Button>
                <Button className="w-full" variant="ghost" disabled={saving} onClick={openList}>Escolher outro time</Button>
              </div>
            </>}

            {view === "won" && <>
              <div className="text-center">
                <DialogTitle className="text-[28px] sm:text-[34px]">Imagens liberadas</DialogTitle>
                <DialogDescription className="mt-2">Use no telão do seu edifício.</DialogDescription>
              </div>
              <ClubImages club={shown} animate />
              <Button className="w-full" size="lg" variant="reward" onClick={onClose}>Continuar</Button>
            </>}

            {view === "mine" && <>
              <div className="text-center">
                <p className="mono-label text-primary">Seu time</p>
                <DialogTitle className="mt-2 text-[28px] sm:text-[32px]">{shown.name}</DialogTitle>
                <DialogDescription className="mt-2">Imagens do telão do seu edifício.</DialogDescription>
              </div>
              <ClubImages club={shown} />
              {error && <ErrorLine>{error}</ErrorLine>}
              <div className="space-y-2">
                <Button className="w-full" size="lg" onClick={onClose}>Continuar</Button>
                {mine.canChange && <Button className="w-full" variant="ghost" onClick={openList}>Trocar time</Button>}
              </div>
            </>}
          </div>
        </DialogContent>
      </Dialog>
    </LazyMotion>
  );
}
