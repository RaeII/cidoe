import type { UnlockRule } from "./unlock";
import type { PreviewSubject } from "@/scene/builders/createPreviewScene";

export const PREVIEW_KIND: Record<string, PreviewSubject["kind"]> = {
  shape: "shape",
  rooftop: "rooftop",
  edge_light: "edgeLight",
};

/** Dados visuais apenas; sem sessão, API ou permissões do admin. */
export type PassReward = {
  key: string;
  label: string;
  categoryKey: string;
  categoryLabel: string;
  optionKey?: string;
  value?: string | null;
  unlock: UnlockRule;
};

/** Peso editorial: R$ 40 ou 2 indicações por unidade de esforço estimado.
 * Não representa valor financeiro de uma indicação. Ver passe-balanceamento.
 */
function rewardEffort({ unlock }: PassReward): number {
  if (!unlock) return 0;
  const efforts = [
    unlock.donationMin == null ? null : unlock.donationMin / 40,
    unlock.referralMin == null ? null : unlock.referralMin / 2,
  ].filter((effort): effort is number => effort !== null);
  if (!efforts.length) return 0;
  return unlock.mode === "any"
    ? Math.min(...efforts)
    : efforts.reduce((total, effort) => total + effort, 0);
}

/** Grátis → esforço estimado. AND soma metas; OR usa alternativa mais fácil. */
export function sortPassRewards<T extends PassReward>(rewards: readonly T[]): T[] {
  return [...rewards].sort((a, b) =>
    Number(a.unlock !== null) - Number(b.unlock !== null) ||
    rewardEffort(a) - rewardEffort(b),
  );
}
