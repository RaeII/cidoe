import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { animate, stagger, steps, type AnimationOptions, type AnimationPlaybackControls, type DOMKeyframesDefinition } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { rememberAccount, watchExitIntent } from "@/lib/exitIntent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CidoeLogo, PixelArrow, PixelClose, PixelGift, PixelHeart, PixelPaw } from "@/components/ui/pixel-icon";

/** Visitante sem conta saindo da cena (design ModalSaida). Quais saídas e por quê: `watchExitIntent`. */
export function ExitIntentDialog({ onSignup }: { onSignup: () => void }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const guest = !isLoading && !isAuthenticated;

  // Sessão (cadastro, login ou cookie restaurado) marca o dispositivo antes de o logout religar o efeito.
  useEffect(() => {
    if (isAuthenticated) rememberAccount();
  }, [isAuthenticated]);
  useEffect(() => (guest ? watchExitIntent(() => setOpen(true)) : undefined), [guest]);

  return (
    <Dialog open={open && guest} onOpenChange={setOpen}>
      {/* text-foreground: o body da cena pinta texto branco. animate-none: entrada é do `intro` (motion); movimento reduzido mantém o fade padrão.
          Celular: GIF quadrado em cima. md+: duas colunas, GIF à esquerda. */}
      <DialogContent
        showCloseButton={false}
        className="gap-0 p-0 text-foreground raised-modal motion-safe:data-[state=open]:animate-none! sm:max-w-[440px] md:max-w-[min(940px,calc(100%-2rem))] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"
      >
        <ExitContent onSignup={onSignup} />
      </DialogContent>
    </Dialog>
  );
}

/** Cobre o GIF e some do chão pra cima na entrada. 8 por linha; 18 linhas cobrem a coluna mais alta. */
const BLOCKS = Array.from({ length: 144 }, (_, i) => i);
const CHIPS = [
  [<PixelHeart key="gratis" className="text-primary" />, "Grátis"],
  [<PixelPaw key="animais" className="text-primary" />, "Pelos animais"],
  [<PixelGift key="recompensas" />, "Recompensas"],
] as const;

/** Monta junto com o conteúdo do Radix: layout effect anima o diálogo (pai direto) antes da 1ª pintura. */
function ExitContent({ onSignup }: { onSignup: () => void }) {
  const mediaRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => intro(mediaRef.current!.parentElement!), []);

  return (
    <>
      {/* max-md:[@media(max-height:700px)]: celular baixo → GIF menor, sem logo, título menor; CTA cabe sem rolar. */}
      <div ref={mediaRef} className="relative aspect-square w-full max-h-[42dvh] max-md:[@media(max-height:700px)]:max-h-[34dvh] md:aspect-auto md:max-h-none md:min-h-[480px]">
        <div data-photo className="absolute inset-0 overflow-hidden border-b-3 border-(--pixel-ink) bg-muted md:border-r-3 md:border-b-0">
          <img
            data-img
            src="/cachorro_triste_cidoe.gif"
            alt="Um cachorro com os olhos cheios de lágrimas olhando para o celular"
            decoding="async"
            className="absolute inset-0 size-full object-cover object-[50%_30%]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-wrap-reverse content-start [container-type:size]">
            {BLOCKS.map((i) => (
              <span key={i} data-blk className="size-[12.5cqw] flex-none bg-muted opacity-0 outline outline-muted" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-5 pt-[22px] pb-6 md:justify-center md:gap-5 md:px-[30px] md:pt-10 md:pb-[34px] lg:px-11 lg:pt-[46px] lg:pb-10">
        <div data-in className="flex max-md:[@media(max-height:700px)]:hidden">
          <CidoeLogo className="size-6 md:size-[38px]" />
        </div>

        <div className="flex flex-col gap-2.5">
          <DialogTitle data-in className="text-[27px] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance max-md:[@media(max-height:700px)]:text-2xl md:text-[32px] lg:text-[37px]">
            Tem certeza que vai{" "}
            <span className="relative -mx-0.5 inline-block px-[7px] whitespace-nowrap text-tinta">
              <span data-mark aria-hidden="true" className="absolute inset-x-0 top-0.5 bottom-0 origin-left bg-ambar" />
              <span className="relative">sair</span>
            </span>
            ?
          </DialogTitle>
          <DialogDescription data-in className="text-[15.5px] leading-normal text-pretty md:text-[17px]">
            Crie sua conta e ajude a construir um futuro melhor para os animais.
          </DialogDescription>
        </div>

        {/* Uma linha só: sem quebra, espaço justo pra caber na coluna estreita do md. */}
        <ul data-in className="hidden gap-1.5 md:flex">
          {CHIPS.map(([icon, label]) => (
            <li key={label} className="inline-flex shrink-0 items-center gap-1.5 bg-secondary py-1.5 pr-2 pl-1.5 mono-label whitespace-nowrap text-foreground">
              {icon}
              {label}
            </li>
          ))}
        </ul>

        <div data-in className="flex">
          <div data-hop className="relative flex flex-1">
            <PixelArrow data-cur width={12} height={21} className="absolute top-1/2 -left-4 -translate-y-1/2 text-primary" />
            <DialogClose asChild>
              <Button size="lg" className="flex-1" onClick={onSignup}>
                Criar conta
                <ArrowRight />
              </Button>
            </DialogClose>
          </div>
        </div>
      </div>

      {/* Depois do CTA no DOM: foco inicial do Radix cai em "Criar conta". */}
      <DialogClose className="absolute top-[15px] right-[15px] grid size-[38px] place-items-center pixel bevel-edge bevel-w-3 bg-background transition-colors hover:bg-card">
        <PixelClose className="size-2.5" />
        <span className="sr-only">Fechar</span>
      </DialogClose>
    </>
  );
}

const OUT = [0.22, 1, 0.36, 1] as const;

/** Entrada do design: cartão salta e a sombra descola, GIF surge em blocos do chão pra cima, texto em cascata,
 *  "sair" ganha marca-texto. Laços (▸ do CTA, pulinho do botão) até desmontar. Devolve a limpeza. */
function intro(dialog: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const all = (s: string) => Array.from(dialog.querySelectorAll<HTMLElement>(s));
  const one = (s: string) => dialog.querySelector<HTMLElement>(s);
  const runs: AnimationPlaybackControls[] = [];
  const go = (el: Element | Element[] | null, kf: DOMKeyframesDefinition, o: AnimationOptions) => {
    if (el && (!Array.isArray(el) || el.length)) runs.push(animate(el, kf, o));
  };

  // Estado inicial antes da 1ª pintura; cada animação parte dele.
  const items = all("[data-in]"), blocks = all("[data-blk]"), mark = one("[data-mark]");
  dialog.style.opacity = "0";
  dialog.style.setProperty("--drop", "0px");
  items.forEach((el) => (el.style.opacity = "0"));
  blocks.forEach((el) => (el.style.opacity = "1"));
  if (mark) mark.style.transform = "scaleX(0)";

  // 1 · cartão salta e a sombra dura se descola (--drop do `raised-modal`)
  go(dialog, { opacity: [0, 1] }, { duration: 0.22, delay: 0.05 });
  go(dialog, { y: [70, 0], rotate: [-4, 0], scale: [0.9, 1] }, { type: "spring", visualDuration: 0.6, bounce: 0.32, delay: 0.05 });
  go(dialog, { "--drop": ["0px", "12px"] }, { type: "spring", visualDuration: 0.45, bounce: 0.45, delay: 0.38 });

  // 2 · GIF aparece em blocos de papel, linha a linha do chão pra cima
  go(one("[data-img]"), { scale: [1.08, 1] }, { duration: 1.8, ease: OUT, delay: 0.15 });
  const rows = Math.max(1, Math.ceil((one("[data-photo]")?.offsetHeight ?? 600) / (blocks[0]?.offsetHeight || 60)));
  blocks.forEach((b, i) => go(b, { opacity: [1, 0] }, { duration: 0.01, delay: 0.25 + (Math.min(Math.floor(i / 8), rows) / rows) * 0.7 + Math.random() * 0.12 }));

  // 3 · texto em cascata; "sair" ganha marca-texto âmbar em degraus
  const base = 0.42;
  go(items, { opacity: [0, 1], y: [12, 0] }, { duration: 0.5, ease: OUT, delay: stagger(0.06, { startDelay: base }) });
  go(mark, { scaleX: [0, 1] }, { duration: 0.32, ease: steps(7), delay: base + 0.4 });

  // 4 · chamada: ▸ pisca em dois passos e o botão dá um pulinho de tempos em tempos
  go(one("[data-cur]"), { x: [0, 0, 4, 4, 0] }, { duration: 0.9, times: [0, 0.48, 0.5, 0.98, 1], ease: "linear", repeat: Infinity, delay: base + 0.9 });
  go(one("[data-hop]"), { y: [0, -6, 0, -2, 0] }, { duration: 0.55, ease: "easeOut", repeat: Infinity, repeatDelay: 3.6, delay: base + 2.6 });

  return () => runs.forEach((run) => run.stop());
}
