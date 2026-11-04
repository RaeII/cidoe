import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
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

/**
 * Conteúdo da placa da cena: logo + indicações até o próximo presente da campanha de cadastro.
 * Barra = `ReferralBar`, termina no presente. Admin não participa:
 * vê a prévia da 1ª faixa com 0 indicações. Deslogado: logo + nome (requisito do login com Google).
 * Logado sem próxima faixa (fora da campanha ou faixas esgotadas): só o logo, inclusive no mobile.
 */
export function ReferralHud({ rewards }: { rewards: RewardNotifications }) {
  const { user, isAdmin } = useAuth();
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

  const goal = !user ? undefined : isAdmin ? adminGoal : rewards.nextChoice?.referralMin;
  const logo = (
    <img src="/logo.webp" alt="" width={32} height={32}
      className={cn("size-8 shrink-0", (!user || goal != null) && "max-sm:hidden")} />
  );
  if (goal == null) return <>{logo}{!user && <strong className="text-sm font-semibold text-foreground">Cidoe</strong>}</>;

  const referrals = isAdmin ? 0 : rewards.signupReferrals;
  const left = Math.max(1, goal - referrals);

  return (
    <>
      {logo}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <Gift className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">
            {left === 1 ? "Falta" : "Faltam"} apenas {left} {left === 1 ? "indicação" : "indicações"}
          </span>
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <ReferralBar size="sm" className="flex-1" goal={goal} left={left} />
          <PixelGift className="size-3.5" />
        </div>
      </div>
    </>
  );
}
