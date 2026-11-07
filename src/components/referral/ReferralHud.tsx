import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { stagger, useAnimate, useReducedMotion, type AnimationSequence } from "motion/react";
import { getEarlySignupSettings } from "@/api/admin/admin.routes";
import type { RewardNotifications } from "@/components/hooks/useCustomizationCatalog";
import { useAuth } from "@/hooks/useAuth";
import { BlockBar } from "@/components/ui/block-bar";
import { PixelGift } from "@/components/ui/pixel-icon";
import { cn } from "@/lib/utils";

/**
 * Barra de incentivo das indicações: até 3 blocos, sempre 1+ aceso (bônus, não é indicação real).
 * Vazios = indicações que faltam, até 2. Ex.: meta 2 sem indicação → 1 aceso + 2 vazios.
 */
export function ReferralBar({ goal, left, size, className }: {
  goal: number;
  left: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const blocks = Math.min(3, goal + 1);
  const filled = blocks - Math.min(left, blocks - 1);
  return (
    <BlockBar
      size={size}
      className={className}
      value={filled}
      max={blocks}
      blocks={blocks}
      highlightNext={false}
      label="Progresso até o próximo presente"
    />
  );
}

/** Meta mostrada ao visitante: chamariz fixo, sem consultar a campanha. */
const GUEST_GOAL = 2;
/** Chamariz do visitante: 1ª vez 1,5s após carregar, depois pausa de 6s entre cada uma. */
const NUDGE_FIRST_MS = 1500;
const NUDGE_PAUSE_MS = 6000;
/** Faíscas do presente abrindo: destino (px, antes da escala) de cada bloquinho. */
const SPARKS = [[-8, -5], [-3, -8], [3, -8], [8, -5]] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Letra a letra pra entrar em onda (inline-block: transform não pega em inline). */
function Letters({ text }: { text: string }) {
  return [...text].map((char, i) => (
    <span key={i} data-letter className="inline-block">{char === " " ? "\u00a0" : char}</span>
  ));
}

/**
 * Placa da cena: logo + indicações até o próximo presente da campanha de cadastro.
 * Barra = `ReferralBar`, termina no presente. Admin não participa:
 * vê a prévia da 1ª faixa com 0 indicações. Visitante: logo (requisito do login com Google)
 * + "Faltam apenas 2 indicações" fixo; placa inteira abre o login. A cada 6s o presente vai pro
 * lugar do logo, cresce, abre e solta "Surpresa! clique aqui"; o resto some e volta (motion).
 * Logado sem próxima faixa (fora da campanha ou faixas esgotadas): só o logo, inclusive no mobile.
 */
export function ReferralHud({ rewards, onLogin }: { rewards: RewardNotifications; onLogin: () => void }) {
  const { user, isAdmin, isLoading } = useAuth();
  const [adminGoal, setAdminGoal] = useState<number>();

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getEarlySignupSettings()
      .then((settings) => {
        const mins = settings.tiers.map((tier) => tier.referralMin);
        if (alive) setAdminGoal(settings.isActive && mins.length ? Math.min(...mins) : undefined);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  // Enquanto a sessão carrega, user = null: segura o chamariz pra não piscar pra quem está logado.
  const guest = !user && !isLoading;
  const goal = guest ? GUEST_GOAL : !user ? undefined : isAdmin ? adminGoal : rewards.nextChoice?.referralMin;
  const referrals = isAdmin || !user ? 0 : rewards.signupReferrals;
  const left = goal == null ? 0 : Math.max(1, goal - referrals);
  const [scope, animate] = useAnimate<HTMLElement>();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!guest || reducedMotion) return;
    let alive = true;
    let timer = 0;
    let run: ReturnType<typeof animate> | undefined;
    const play = () => {
      const rect = (selector: string) => scope.current.querySelector(selector)!.getBoundingClientRect();
      const logo = rect("img");
      const gift = rect("[data-gift]");
      // Presente vai pro centro do logo; medido a cada ciclo (placa muda com a largura da tela).
      const x = logo.left + logo.width / 2 - (gift.left + gift.width / 2);
      const y = logo.top + logo.height / 2 - (gift.top + gift.height / 2);
      const rest = "[data-fade], [role=progressbar]";
      const sequence: AnimationSequence = [
        [rest, { opacity: 0 }, { duration: 0.2, at: 0 }],
        ["[data-gift]", { x, y, scale: 1.8 }, { duration: 0.45, ease: EASE_OUT, at: 0 }],
        ["[data-lid]", { y: -1, rotate: -12 }, { duration: 0.3, ease: "backOut", at: 0.45 }],
        ...SPARKS.map(([sx, sy], i): AnimationSequence[number] =>
          [`[data-spark="${i}"]`, { x: [0, sx], y: [0, sy], opacity: [0, 1, 0] }, { duration: 0.5, ease: "easeOut", at: 0.45 }]),
        ["[data-word]", { opacity: [0, 1] }, { duration: 0.1, at: 0.5 }],
        ["[data-letter]", { opacity: [0, 1], y: [8, 0], scale: [0.4, 1] }, { duration: 0.3, ease: "backOut", delay: stagger(0.03), at: 0.5 }],
        // Frase inteira na tela de ~1,4s a 3s: tempo de ler.
        ["[data-word]", { opacity: 0 }, { duration: 0.2, at: 3 }],
        ["[data-lid]", { y: 0, rotate: 0 }, { duration: 0.25, ease: "easeInOut", at: 3 }],
        ["[data-gift]", { x: 0, y: 0, scale: 1 }, { duration: 0.45, ease: "easeInOut", at: 3.1 }],
        [rest, { opacity: 1 }, { duration: 0.3, at: 3.3 }],
      ];
      run = animate(sequence);
      run.then(() => { if (alive) timer = window.setTimeout(play, NUDGE_PAUSE_MS); });
    };
    timer = window.setTimeout(play, NUDGE_FIRST_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      run?.complete(); // fim da sequência = placa normal (ex.: entrou no meio da animação)
    };
  }, [guest, reducedMotion, animate, scope]);

  const counter = goal != null && (
    <>
      <p data-fade className="flex items-center gap-1.5 font-semibold text-foreground">
        <Gift className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">
          {left === 1 ? "Falta" : "Faltam"} apenas {left} {left === 1 ? "indicação" : "indicações"}
        </span>
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <ReferralBar size="sm" className="flex-1" goal={goal} left={left} />
        {guest ? (
          <span data-gift className="relative flex shrink-0">
            <PixelGift className="size-3.5" />
            {SPARKS.map((_, i) => (
              <span key={i} data-spark={i} className="absolute top-1/2 left-1/2 size-0.5 bg-ambar opacity-0" />
            ))}
          </span>
        ) : <PixelGift className="size-3.5" />}
      </div>
    </>
  );

  return (
    <aside
      ref={scope}
      aria-label="Cidoe"
      className={cn(
        "pointer-events-auto pixel pixel-thin flex min-w-0 items-center gap-2 bg-background px-2 py-1.5 text-xs leading-4 text-muted-foreground max-sm:h-10 max-sm:px-3 max-sm:py-0",
        guest && "relative",
      )}
    >
      <img data-fade src="/logo.webp" alt="" width={32} height={32}
        className={cn("size-8 shrink-0", user && goal != null && "max-sm:hidden")} />
      {guest ? (
        // after:inset-0 estica o clique pela placa inteira.
        <button type="button" onClick={onLogin} className="grid min-w-0 grid-cols-1 text-left after:absolute after:inset-0">
          <span className="col-start-1 row-start-1 min-w-0">{counter}</span>
          <span data-word aria-hidden="true" className="col-start-1 row-start-1 flex items-center gap-1 self-center text-sm font-bold whitespace-nowrap opacity-0">
            <span className="bg-ambar px-1 text-tinta"><Letters text="Surpresa!" /></span>
            <span className="text-primary"><Letters text="clique aqui" /></span>
          </span>
        </button>
      ) : counter && <div className="min-w-0">{counter}</div>}
    </aside>
  );
}
