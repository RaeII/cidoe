import type { CustomizationCatalog } from "../api/customizationApi";
import { sortPassRewards, type PassReward } from "./pass";
import { formatBRL, formatReferrals, formatUnlockRemaining, type UnlockProgress, type UnlockRule } from "./unlock";

export function formatRewardReason(rule: UnlockRule, signupReferralMin?: number | null): string {
  if (signupReferralMin != null) return `Você indicou ${signupReferralMin} ${signupReferralMin === 1 ? "pessoa que se cadastrou" : "pessoas que se cadastraram"}.`;
  if (!rule) return "Presente por estar entre os primeiros inscritos.";
  const reasons: string[] = [];
  if (rule.donationMin != null) reasons.push(`${formatBRL(rule.donationMin)} em doações acumuladas`);
  if (rule.referralMin != null) reasons.push(formatReferrals(rule.referralMin));
  return `Você atingiu ${reasons.join(rule.mode === "any" ? " ou " : " e ")}.`;
}

/** Mesma ordem do passe. Só sugere itens ativos que a conta ainda não tem. */
export function getNextReward(catalog: CustomizationCatalog, progress: UnlockProgress) {
  const rewards: PassReward[] = [];
  const groups = [
    ["shape", "Formato", catalog.shapes], ["rooftop", "Topo", catalog.rooftops],
    ["edge_light", "LED de arestas", catalog.edgeLights], ["color", "Cor", catalog.colors],
    ["texture", "Textura", catalog.textures],
  ] as const;
  for (const [categoryKey, categoryLabel, items] of groups) {
    for (const item of items) {
      if (!item.isUnlocked && item.unlock) rewards.push({
        ...item, key: `option:${item.id}`, optionKey: item.key, categoryKey, categoryLabel,
      });
    }
  }
  for (const [categoryKey, label] of [["sign", "Letreiro"], ["hologram", "Holograma"]] as const) {
    const feature = catalog.features[categoryKey];
    if (feature?.unlock && !feature.isUnlocked) rewards.push({
      key: `category:${categoryKey}`, label, categoryKey, categoryLabel: "Personalização", unlock: feature.unlock,
    });
  }
  for (const reward of sortPassRewards(rewards)) {
    const remaining = formatUnlockRemaining(reward.unlock, progress);
    if (remaining) return { reward, remaining };
  }
  return null;
}
