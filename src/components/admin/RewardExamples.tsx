import { lazy, Suspense, useState } from "react";
import { Gift, Trophy } from "lucide-react";
import type { RewardNotification } from "@/api/customizationApi";
import { Button } from "@/components/ui/button";
import { BlockLoader } from "@/components/ui/pixel-icon";

const RewardDialog = lazy(() => import("@/components/pass/RewardDialog"));

const donationReward: RewardNotification = {
  key: "option:1", label: "Loftifício", categoryKey: "shape", categoryLabel: "Formato",
  optionKey: "loft", value: null, unlock: { donationMin: 50, referralMin: null },
};
const referralRewards: RewardNotification[] = [donationReward, {
  key: "option:2", label: "Varanda Gourmet", categoryKey: "shape", categoryLabel: "Formato",
  optionKey: "gourmet", value: null, unlock: { donationMin: 100, referralMin: null },
}];

type Example = { kind: "achievement"; reward: RewardNotification } | { kind: "choice" };

/**
 * Exemplos locais: os callbacks nunca confirmam avisos nem concedem itens na API.
 * `goals`: metas em total de indicações; a escolha abre na 1ª e "faltam" mira a 2ª.
 */
export function RewardExamples({ goals = [2, 3] }: { goals?: number[] }) {
  const [firstGoal = 2, nextGoal] = goals;
  const [example, setExample] = useState<Example | null>(null);
  const close = () => setExample(null);

  return (
    <section aria-label="Exemplos de notificações" className="space-y-4 pixel bevel-edge bg-card p-5 pb-6">
      <div>
        <h2 className="text-xl font-semibold">Exemplos de notificações</h2>
        <p className="mt-2 text-sm text-muted-foreground">Simulação local. Não altera contas, indicações ou recompensas.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => setExample({ kind: "achievement", reward: donationReward })}>
          <Trophy />Ver conquista desbloqueada
        </Button>
        <Button type="button" variant="outline" onClick={() => setExample({ kind: "choice" })}>
          <Gift />Ver escolha por indicação
        </Button>
      </div>
      {example && <Suspense fallback={<p role="status" className="flex items-center gap-2 text-sm"><BlockLoader />Carregando exemplo…</p>}>
        <RewardDialog key={example.kind} rewards={{
          pending: example.kind === "achievement" ? [example.reward] : [],
          next: {
            reward: { key: "category:1", label: "Letreiro", categoryKey: "sign", categoryLabel: "Personalização", unlock: { donationMin: 100, referralMin: null } },
            remaining: "Faltam R$ 50",
          },
          choice: example.kind === "choice" ? { referralMin: firstGoal, rewards: referralRewards } : undefined,
          nextChoice: nextGoal === undefined ? undefined : { referralMin: nextGoal, rewards: referralRewards },
          signupReferrals: firstGoal,
          dismiss: close,
          deferChoice: close,
          choose: async (referralMin, key) => {
            const reward = referralRewards.find((item) => item.key === key);
            if (reward) setExample({ kind: "achievement", reward: { ...reward, unlock: null, signupReferralMin: referralMin } });
          },
        }} />
      </Suspense>}
    </section>
  );
}
