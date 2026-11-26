import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { websiteLabel, type BuildingProfile } from "@/api/contributionApi";
import type { Ong } from "@/api/donationApi";
import { LEGAL_EMAIL } from "@/lib/legal";
import { PixelArrow, PixelCheck, PixelChevronDown } from "@/components/ui/pixel-icon";
import { cn } from "@/lib/utils";

export type BuildingInfoModalProps = {
  donationId: number;
  value: number;
  /** ONGs do edifício, maior parte primeiro. `value` ausente = divisão ainda não conhecida. */
  ongs: (Ong & { value?: number })[];
  isOwn: boolean;
  /** Ausente = só leitura: edifício de outra pessoa (ou sem sessão). */
  onManage?: () => void;
  /** Quem ergueu, nome, descrição, imagem e site; chega depois do clique (null = sem perfil). */
  profile?: BuildingProfile | null;
  /** Ausente = só leitura. */
  onEditProfile?: () => void;
  onClose: () => void;
};

/** Centavos só quando há: "R$ 1.240", "R$ 1.498,48". */
const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "Abrigo Quatro Patas" → AQ, "Lar dos Bigodes" → LB (pula conectivos em minúscula). */
function initials(name: string) {
  const words = name.split(/\s+/).filter((word) => /^\p{Lu}/u.test(word));
  return words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2).toUpperCase();
}

// Do escuro ao claro, na ordem da barra; repete com mais de três ONGs.
const SHARE_BG = ["bg-verde-700", "bg-verde-500", "bg-verde-300"];
const SHARE_BEVEL = ["bevel-verde-700", "bevel-verde-500", "bevel-verde-300"];
const OUT = [0.22, 1, 0.36, 1] as const;
const NARROW = "(max-width: 899px)";

const textAction = "inline-flex min-h-[30px] items-center px-0.5 text-xs font-semibold text-muted-foreground underline decoration-1 underline-offset-3 hover:text-foreground";

/** Design ModalPredioA ("placa ancorada"). Mobile: folha presa à base, edifício à vista em cima.
 *  Desktop (≥900px): placa à esquerda do edifício com rabicho apontando para ele — posição vem de
 *  `--focus-left`/`--focus-y`, gravadas pelo runtime no contêiner da cena a cada frame. */
export function BuildingInfoModal({
  donationId,
  value,
  ongs,
  isOwn,
  onManage,
  profile,
  onEditProfile,
  onClose,
}: BuildingInfoModalProps) {
  const listId = useId();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ongsOpen, setOngsOpen] = useState(false);
  // Barra e valores só com a divisão inteira conhecida.
  const split = ongs.length > 0 && ongs.every((ong) => ong.value !== undefined);
  const reportHref = `mailto:${LEGAL_EMAIL}?subject=${encodeURIComponent(`Denúncia · edifício ${donationId}`)}&body=${encodeURIComponent("Motivo:\n\nContato:\n")}`;

  // A lista desce do botão e o conteúdo rola junto, mantendo o fim à vista.
  const pin = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const toggleOngs = () => {
    // Mobile: folha presa à base não sobe ao abrir — trava a altura; a lista abre dentro dela.
    const section = sectionRef.current;
    if (!ongsOpen && section && window.matchMedia(NARROW).matches) section.style.height = `${section.offsetHeight}px`;
    setOngsOpen((open) => !open);
  };

  const closeButton = (onImage: boolean) => (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center",
        onImage ? "absolute top-1.5 right-1.5" : "-mr-2.5",
      )}
    >
      {onImage ? (
        // X tinta com contorno papel: lê sobre qualquer imagem.
        <svg width="18" height="18" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
          <path className="fill-papel" d="M0 0h4v4h-4zM5 0h4v4h-4zM2 2h5v5h-5zM0 5h4v4h-4zM5 5h4v4h-4z" />
          <path className="fill-tinta" d="M1 1h2v2h-2zM6 1h2v2h-2zM3 3h3v3h-3zM1 6h2v2h-2zM6 6h2v2h-2z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
          <path className="fill-tinta" d="M0 0h2v2h-2zM5 0h2v2h-2zM2 2h3v3h-3zM0 5h2v2h-2zM5 5h2v2h-2z" />
        </svg>
      )}
    </button>
  );

  return (
    // Overlay sem dim/blur e pointer-events-none: cena visível e interativa atrás.
    <div className="pointer-events-none absolute inset-0 z-40">
      <section
        ref={sectionRef}
        role="dialog"
        aria-label="Informações do edifício"
        className={cn(
          // Mobile: até metade da tela — a câmera centraliza o topo do edifício em foco, que fica logo acima da folha.
          "pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-1/2 flex-col border-t-3 border-tinta bg-background pb-[env(safe-area-inset-bottom)] text-foreground animate-sheet-up motion-reduce:animate-none",
          "min-[900px]:inset-x-auto min-[900px]:bottom-auto min-[900px]:top-32 min-[900px]:left-[clamp(1.5rem,var(--focus-left)_-_410px,100%_-_23.5rem)] min-[900px]:m-[3px] min-[900px]:max-h-[calc(100%_-_10rem)] min-[900px]:w-[340px] min-[900px]:border-t-0 min-[900px]:pixel min-[900px]:animate-card-pop",
        )}
      >
        {/* Rabicho: seta em pixel (6×9 ×3) da borda direita até o edifício, na altura dele (preso dentro da placa). */}
        <svg
          aria-hidden="true"
          width="18"
          height="27"
          viewBox="0 0 6 9"
          shapeRendering="crispEdges"
          className="absolute -right-[18px] top-[clamp(1rem,var(--focus-y)_-_8rem_-_13px,100%_-_3rem)] z-10 hidden min-[900px]:block"
        >
          <path className="fill-tinta" d="M0 0h2v1h-2zM2 1h1v1h-1zM3 2h1v1h-1zM4 3h1v1h-1zM5 4h1v1h-1zM4 5h1v1h-1zM3 6h1v1h-1zM2 7h1v1h-1zM0 8h2v1h-2z" />
          <path className="fill-background" d="M0 1h2v1h-2zM0 2h3v1h-3zM0 3h4v1h-4zM0 4h5v1h-5zM0 5h4v1h-4zM0 6h3v1h-3zM0 7h2v1h-2z" />
        </svg>

        <div aria-hidden="true" className="flex shrink-0 justify-center pt-[9px] pb-[7px] min-[900px]:hidden">
          <span className="h-1 w-10 bg-verde-200" />
        </div>

        <div ref={scrollRef} className="min-h-0 flex-auto overflow-y-auto overscroll-contain">
          {profile?.image && (
            <div className="relative aspect-[2/1] overflow-hidden border-b-3 border-tinta bg-muted">
              <img
                src={profile.image}
                alt={profile.name ?? "Imagem do edifício"}
                draggable={false}
                className="size-full object-cover object-[center_40%]"
              />
              {closeButton(true)}
            </div>
          )}

          <div className="flex flex-col gap-2 px-[18px] pt-2.5 pb-1">
            {(profile?.owner || !profile?.image) && (
              <div className="flex items-center justify-between gap-2.5">
                <span className="min-w-0 truncate text-[13px] font-bold">{profile?.owner}</span>
                {!profile?.image && closeButton(false)}
              </div>
            )}
            {profile?.name && (
              <h2 className="text-xl leading-[1.2] font-extrabold tracking-[-0.01em] text-balance break-words">{profile.name}</h2>
            )}
            {profile?.description && (
              <p className="text-[15px] leading-[1.45] whitespace-pre-line text-pretty break-words text-muted-foreground">{profile.description}</p>
            )}
            {profile?.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                aria-label={`Abrir ${websiteLabel(profile.website)} em nova aba`}
                className="inline-flex min-h-8 max-w-full items-center self-start text-[15px] font-bold [overflow-wrap:anywhere] text-verde-700 underline decoration-2 underline-offset-4 hover:text-foreground"
              >
                {websiteLabel(profile.website)}
              </a>
            )}
          </div>

          <div className="flex flex-col px-[18px] pt-1 pb-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xl leading-[1.1] font-extrabold tracking-[-0.01em]">
                <span className="sr-only">Valor do edifício: </span>
                {formatCurrency(value)}
              </span>
              <button
                type="button"
                onClick={toggleOngs}
                aria-expanded={ongsOpen}
                aria-controls={listId}
                className="pixel pixel-thin bevel-edge bevel-w-3 m-0.5 inline-flex min-h-8 shrink-0 items-center gap-[7px] bg-card px-2.5 pt-1.5 pb-[9px] text-xs font-bold aria-expanded:bevel-verde-700 aria-expanded:bg-primary aria-expanded:text-primary-foreground"
              >
                {ongs.length} {ongs.length === 1 ? "ONG" : "ONGs"}
                <PixelChevronDown
                  className={cn(
                    "h-1.5 w-[9px] transition-transform duration-240 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
                    ongsOpen && "rotate-180",
                  )}
                />
              </button>
            </div>

            <AnimatePresence
              initial={false}
              onExitComplete={() => {
                if (sectionRef.current) sectionRef.current.style.height = "";
              }}
            >
              {ongsOpen && (
                <motion.div
                  key="ongs"
                  id={listId}
                  className="overflow-hidden"
                  initial={reduceMotion ? false : { height: 0 }}
                  animate={{ height: "auto", transition: { type: "spring", visualDuration: 0.45, bounce: 0 } }}
                  exit={reduceMotion ? undefined : { height: 0, opacity: 0, transition: { height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.18, ease: "easeOut" } } }}
                  onUpdate={pin}
                  onAnimationComplete={pin}
                >
                  <div className="flex flex-col gap-2 pt-2.5">
                    <motion.div
                      className="flex items-center justify-between gap-2.5 font-mono text-[11px] text-muted-foreground"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.05 } }}
                    >
                      <span>Para onde foi o dinheiro</span>
                      <span className="inline-flex items-center gap-1.5 text-verde-700">
                        <PixelCheck className="h-1.5 w-2.5 text-primary" />
                        Verificadas
                      </span>
                    </motion.div>
                    {split && (
                      <div aria-hidden="true" className="flex h-2.5 gap-0.5">
                        {ongs.map((ong, index) => (
                          <motion.span
                            key={ong.id}
                            className={cn("origin-left", SHARE_BG[index % SHARE_BG.length])}
                            style={{ flex: `${ong.value} 1 0` }}
                            initial={reduceMotion ? false : { scaleX: 0 }}
                            animate={{ scaleX: 1, transition: { duration: 0.5, delay: 0.1 + index * 0.07, ease: OUT } }}
                          />
                        ))}
                      </div>
                    )}
                    <ul className="-mx-2 flex flex-col">
                      {ongs.map((ong, index) => (
                        <motion.li
                          key={ong.id}
                          className="flex min-h-[50px] items-center gap-2.5 px-2 py-1.5"
                          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.36, delay: 0.12 + index * 0.06, ease: OUT } }}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "pixel pixel-thin bevel-w-5 m-0.5 inline-flex size-8 shrink-0 items-center justify-center bg-card pb-1 font-mono text-[10px] font-semibold text-verde-700",
                              SHARE_BEVEL[index % SHARE_BEVEL.length],
                            )}
                          >
                            {initials(ong.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm leading-[1.25] font-bold">{ong.name}</span>
                          {ong.value !== undefined && (
                            <span className="flex shrink-0 flex-col items-end gap-px">
                              <span className="text-sm font-bold">{formatCurrency(ong.value)}</span>
                              <span className="font-mono text-[11px] text-muted-foreground">{Math.round((ong.value / value) * 100)}%</span>
                            </span>
                          )}
                          <PixelArrow className="h-[9px] w-[5px] text-primary" />
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap gap-x-4 px-[18px] pb-1.5">
            {isOwn ? (
              <>
                {onEditProfile && <button type="button" onClick={onEditProfile} className={textAction}>Editar informações</button>}
                {onManage && <button type="button" onClick={onManage} className={textAction}>Administrar</button>}
              </>
            ) : (
              <a href={reportHref} className={textAction}>Denunciar</a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
