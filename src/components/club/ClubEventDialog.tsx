import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { ApiError } from "@/api/http";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useClubCatalog } from "@/components/hooks/useClubCatalog";
import { useMyClub } from "@/components/hooks/useMyClub";
import { clearPendingClub, savePendingClub } from "@/lib/clubPending";
import { clubImages, findClub, remapScreenImages, searchClubs, type Club } from "@/lib/clubs";
import { cn } from "@/lib/utils";
import { SplitDialogContent } from "@/components/IntroVideoDialog";
import { RewardConfetti } from "@/components/pass/RewardConfetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark, PixelArrow, PixelCheck } from "@/components/ui/pixel-icon";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type View = "loading" | "error" | "login" | "gate" | "list" | "offer" | "switch" | "mine" | "won";
/** Logado viu o próprio time e decidiu: fechar aqui consome a escolha guardada do visitante. */
const DECIDED: readonly View[] = ["list", "offer", "switch", "mine", "won"];

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

/** Escudo + nome; `next` = time que entra na troca (moldura verde), senão o que sai (apagado). */
function ClubCard({ club, label, next = false }: { club: Club; label: string; next?: boolean }) {
  return (
    <figure className="min-w-0 flex-1 text-center">
      <div className={cn("mx-auto aspect-square w-full max-w-28 pixel pixel-thin bg-tinta p-1.5", next ? "pixel-ink-verde" : "opacity-60 grayscale")}>
        <img src={club.images[0].url} alt="" width={256} height={256} decoding="async" className="size-full object-contain" />
      </div>
      <figcaption className="mt-2">
        <span className={cn("mono-label block", next ? "text-primary" : "text-muted-foreground")}>{label}</span>
        <span className="mt-0.5 block leading-tight font-semibold break-words">{club.name}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Recompensa que espera o login. `dialog`: título/descrição do modal (mobile, tela só dela); senão h2/p
 * (desktop, ao lado do login, que já tem o título do modal).
 */
function ClubReward({ club, dialog }: { club: Club; dialog: boolean }) {
  const Title = dialog ? DialogTitle : "h2";
  const Text = dialog ? DialogDescription : "p";
  return (
    <>
      <div className="text-center md:text-left">
        <p className="mono-label text-primary">Seu time</p>
        <Title className="mt-1 text-[28px] leading-[1.15] font-semibold tracking-[-0.01em] break-words sm:text-[32px]">{club.name}</Title>
      </div>
      <ClubImages club={club} />
      <Text className="text-center text-sm text-muted-foreground md:text-left">Entre para ganhar estas imagens no telão do seu edifício.</Text>
    </>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return <p role="alert" className="flex gap-2 text-sm text-destructive"><ErrorMark />{children}</p>;
}

/**
 * Evento dos times. Link `?time=<slug>` propõe o time; aceita ou escolhe outro e ganha as imagens do
 * telão. Visitante escolhe igual: a escolha fica guardada no navegador (`lib/clubPending`) e o login
 * aparece aqui mesmo, com a recompensa ao lado (desktop) ou antes (mobile); entrou, grava sozinho.
 * Login fora daqui: AuthMenu reabre com `claim`. Uma troca depois da escolha: usada, o botão some.
 * Já tem time: link de outro time pede confirmação da troca (atual → novo); mesmo time mostra que já
 * é dele, com atalho para as personalizações. Times e imagens vêm do catálogo (admin em /dale/times);
 * evento desligado fecha sem aparecer. Montado sob demanda (lazy) pelo AuthMenu.
 */
export default function ClubEventDialog({ initialClub, startPicking = false, claim = false, loginPanel, gate, onChosen, onViewMine, onClose }: {
  /** Slug do link; ausente, desconhecido ou time inativo: lista (sem time) ou o time atual. */
  initialClub: string | null;
  /** Abre direto na lista (Trocar time no telão). */
  startPicking?: boolean;
  /** Resgate da escolha guardada (`initialClub`): sem time, grava sem perguntar de novo. */
  claim?: boolean;
  /** `AuthPanel` com a indicação do link, montado no lugar do conteúdo. */
  loginPanel: ReactNode;
  /** Etapa obrigatória da conta antes de escolher (ex.: reaceite dos termos), no lugar do conteúdo. */
  gate?: ReactNode;
  /** Escolha gravada: editor passa os telões montados por `remap` (mesma posição no time novo). */
  onChosen: (remap: (keys: readonly string[]) => string[]) => void;
  /** Ver personalizações: fecha o modal e abre o menu da conta na aba Personalizações. */
  onViewMine: () => void;
  onClose: () => void;
}) {
  const { user, isLoading } = useAuth();
  const catalog = useClubCatalog();
  const mine = useMyClub(user?.id);
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [candidateSlug, setCandidateSlug] = useState(initialClub);
  const [picking, setPicking] = useState(startPicking);
  const [query, setQuery] = useState("");
  // Time confirmado esperando a conta: visitante vê o login; logado sem time grava sozinho.
  const [claiming, setClaiming] = useState(claim);
  // Mobile: recompensa primeiro, login depois do "Entrar".
  const [loginOpen, setLoginOpen] = useState(false);
  // Falha passageira ao gravar (rede, sessão, evento fechado): escolha guardada espera o próximo login.
  const [keepPending, setKeepPending] = useState(false);
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
  // Visitante escolhe como quem não tem time. Logado: servidor diz se ainda pode (sem time = true);
  // slug que o front não conhece não destrava a troca.
  const guest = !user;
  const canPick = guest || mine.canChange;
  let view: View;
  if (catalog.error) view = "error";
  else if (isLoading) view = "loading";
  else if (guest && claiming && candidate) view = "login";
  else if (!guest && gate) view = "gate";
  else if (!guest && !mine.ready) view = mine.error ? "error" : "loading";
  else if (won && current) view = "won";
  else if (canPick && (picking || (!candidate && !current))) view = "list";
  else if (canPick && candidate && candidate.slug !== current?.slug) view = current ? "switch" : "offer";
  else if (current) view = "mine";
  else view = "list";
  // Entrou com time confirmado e sem time na conta: grava direto (já disse sim). Com outro time, a troca
  // gasta a única troca: pergunta (switch). Troca usada ou mesmo time: mostra o time (mine).
  const autoClaim = claiming && view === "offer";
  const claimNow = useEffectEvent(() => { void accept(); });
  useEffect(() => { if (autoClaim) claimNow(); }, [autoClaim]);

  async function accept() {
    if (!candidate || saving) return;
    if (guest) {
      savePendingClub(candidate.slug);
      setClaiming(true);
      setLoginOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mine.choose(candidate.slug);
      // Decisão mais recente vence: escolha guardada (deste ou de outro time) sai.
      clearPendingClub();
      setKeepPending(false);
      const slug = candidate.slug;
      onChosen((keys) => remapScreenImages(clubs, keys, slug));
      setWon(true);
    } catch (err) {
      setClaiming(false);
      // 400 (time indisponível) e 409 (troca usada) são definitivos; o resto tenta no próximo login.
      setKeepPending(!(err instanceof ApiError && (err.status === 400 || err.status === 409)));
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  /** Visitante, carregando, erro ou falha passageira: escolha guardada fica para o próximo login. */
  function settlePending() {
    if (!guest && DECIDED.includes(view) && !keepPending) clearPendingClub();
  }

  function close() {
    settlePending();
    onClose();
  }

  function pick(club: Club) {
    setCandidateSlug(club.slug);
    setPicking(false);
    setClaiming(false);
    setQuery("");
    setError(null);
  }

  function openList() {
    setPicking(true);
    setClaiming(false);
    setError(null);
  }

  const results = view === "list" ? searchClubs(clubs, query) : [];
  const shown = view === "offer" || view === "switch" ? candidate! : current!;

  // Catálogo carregando (ou evento desligado, fechando): nada na tela, sem piscar o modal.
  // O editor segue segurando os outros modais enquanto o evento está aberto.
  if ((!catalog.catalog && !catalog.error) || eventOff) return null;

  return (
    <LazyMotion features={domAnimation} strict>
      <Dialog open onOpenChange={(open) => { if (!open && !saving) close(); }}>
        {view === "login" && !isMobile ? (
          // Desktop: moldura do vídeo de apresentação, com a recompensa no lugar do vídeo.
          <SplitDialogContent
            className="md:max-h-[calc(var(--viewport-height,100dvh)-2rem)]"
            panel={loginPanel}
            media={
              <div className="flex w-[22rem] flex-col bg-secondary">
                <div aria-hidden className="h-1.5 bg-ambar" />
                <div className="my-auto space-y-6 p-7">
                  <ClubReward club={candidate!} dialog={false} />
                  <Button className="w-full" variant="outline" onClick={openList}>Escolher outro time</Button>
                </div>
              </div>
            }
          />
        ) : (
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
              {(view === "loading" || autoClaim) && <div role="status" className="grid min-h-48 place-items-center">
                <DialogTitle className="sr-only">Seu time</DialogTitle>
                <BlockLoader /><DialogDescription className="sr-only">Carregando</DialogDescription>
              </div>}
  
              {view === "error" && <>
                <DialogTitle>Seu time</DialogTitle>
                <DialogDescription role="alert" className="flex gap-2 text-destructive"><ErrorMark />{catalog.error ?? mine.error}</DialogDescription>
                <Button className="w-full" onClick={catalog.error ? catalog.retry : mine.retry}>Tentar de novo</Button>
              </>}
  
              {/* Mobile: recompensa + Entrar; o login toma o modal inteiro (teclado). */}
              {view === "login" && (loginOpen ? <div className="grid gap-4">{loginPanel}</div> : <>
                <ClubReward club={candidate!} dialog />
                <div className="space-y-2">
                  <Button className="w-full" size="lg" onClick={() => setLoginOpen(true)}>Entrar</Button>
                  <Button className="w-full" variant="ghost" onClick={openList}>Escolher outro time</Button>
                </div>
              </>)}
  
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
  
              {view === "offer" && !autoClaim && <>
                <div className="text-center">
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
  
              {view === "switch" && <>
                <div className="text-center">
                  <DialogTitle className="text-[28px] sm:text-[32px]">Deseja trocar seu time?</DialogTitle>
                  <DialogDescription className="mt-2">O telão passa a mostrar o novo time. Esta é sua única troca.</DialogDescription>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <ClubCard club={current!} label="Seu time" />
                  <PixelArrow aria-hidden className="size-4 shrink-0 text-primary" />
                  <ClubCard club={shown} label="Novo time" next />
                </div>
                {error && <ErrorLine>{error}</ErrorLine>}
                <div className="space-y-2">
                  <Button className="w-full" size="lg" disabled={saving} onClick={() => void accept()}>
                    {saving ? <><BlockLoader />Salvando…</> : <span className="min-w-0 truncate">Trocar para {shown.name}</span>}
                  </Button>
                  <Button className="w-full" variant="outline" disabled={saving} onClick={close}><span className="min-w-0 truncate">Manter {current!.name}</span></Button>
                  <Button className="w-full" variant="ghost" disabled={saving} onClick={openList}>Escolher outro time</Button>
                </div>
              </>}
  
              {view === "won" && <>
                <div className="text-center">
                  <DialogTitle className="text-[28px] sm:text-[34px]">Imagens liberadas</DialogTitle>
                  <DialogDescription className="mt-2">Use no telão do seu edifício.</DialogDescription>
                </div>
                <ClubImages club={shown} animate />
                <Button className="w-full" size="lg" variant="reward" onClick={close}>Continuar</Button>
              </>}
  
              {view === "mine" && <>
                <div className="text-center">
                  <DialogTitle className="text-[28px] sm:text-[32px]">{shown.name} já é seu time</DialogTitle>
                  <DialogDescription className="mt-2">As imagens já estão nas suas personalizações.</DialogDescription>
                </div>
                <ClubImages club={shown} />
                {error && <ErrorLine>{error}</ErrorLine>}
                <div className="space-y-2">
                  <Button className="w-full" size="lg" onClick={() => { settlePending(); onViewMine(); }}>Ver personalizações</Button>
                  {mine.canChange && <Button className="w-full" variant="ghost" onClick={openList}>Trocar time</Button>}
                </div>
              </>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </LazyMotion>
  );
}
