import type { CustomizationCategory, CustomizationOption } from "@/api/admin/admin.types";
import type { UnlockRule } from "@/lib/unlock";

/** Alvo de uma regra de liberação: uma opção ou uma categoria-feature. */
export type UnlockTarget = {
  kind: "option" | "category";
  id: number;
  label: string;
  /** Categoria a que pertence — dá contexto ao chip na visão Passe. */
  context: string;
  unlock: UnlockRule;
  unlockedCount: number;
};

export function optionTarget(option: CustomizationOption, category: CustomizationCategory): UnlockTarget {
  return {
    kind: "option",
    id: option.id,
    label: option.label,
    context: category.label,
    unlock: option.unlock,
    unlockedCount: option.unlockedCount,
  };
}

export function categoryTarget(category: CustomizationCategory): UnlockTarget {
  return {
    kind: "category",
    id: category.id,
    label: category.label,
    context: "Customização",
    unlock: category.unlock,
    unlockedCount: category.unlockedCount,
  };
}

