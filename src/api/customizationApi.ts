import { http } from "./http";
import type { UnlockProgress, UnlockRule } from "@/lib/unlock";
import type { PassReward } from "@/lib/pass";

/** Uma opção do catálogo. `value` = hex p/ cor, caminho/URL p/ textura, null p/ shape/topo/led. */
export type CatalogOption = {
  /** Resolvido pelo hook com as conquistas da sessão atual. */
  isUnlocked?: boolean;
  id: number;
  key: string;
  label: string;
  value: string | null;
  sortOrder: number;
  /** Requisito do passe. `null` = grátis. Igual para todos — o que é por-usuário vem de `fetchMyUnlocks`. */
  unlock: UnlockRule;
};

/** Categoria-feature ativa (Letreiro/Holograma): existe = habilitada, com seu requisito. */
export type CatalogFeature = { unlock: UnlockRule; isUnlocked?: boolean };

type CatalogCategory = {
  key: string;
  label: string;
  kind: string;
  parentKey: string | null;
  sortOrder: number;
  unlock: UnlockRule;
  options: CatalogOption[];
};

type CatalogResponse = { categories: CatalogCategory[] };

/**
 * Catálogo normalizado por categoria — o painel consome direto, sem conhecer a
 * árvore. `features` = categorias-feature ativas (Letreiro/Holograma): só vêm
 * do backend quando ativas, então presença (não-null) = habilitado.
 */
export type CustomizationCatalog = {
  shapes: CatalogOption[];
  rooftops: CatalogOption[];
  edgeLights: CatalogOption[];
  colors: CatalogOption[];
  textures: CatalogOption[];
  features: { sign: CatalogFeature | null; hologram: CatalogFeature | null };
};

export async function fetchCustomizationCatalog(
  opts: { signal?: AbortSignal } = {},
): Promise<CustomizationCatalog> {
  const { data } = await http.get<CatalogResponse>("/customization/catalog", {
    signal: opts.signal,
  });
  const byKey = new Map(data.categories.map((c) => [c.key, c]));
  const optionsOf = (key: string) => byKey.get(key)?.options ?? [];
  const featureOf = (key: string): CatalogFeature | null => {
    const category = byKey.get(key);
    return category ? { unlock: category.unlock } : null;
  };
  return {
    shapes: optionsOf("shape"),
    rooftops: optionsOf("rooftop"),
    edgeLights: optionsOf("edge_light"),
    colors: optionsOf("color"),
    textures: optionsOf("texture"),
    features: { sign: featureOf("sign"), hologram: featureOf("hologram") },
  };
}

/**
 * Progresso e conquistas do usuário logado. Separado do catálogo de propósito:
 * o catálogo é igual para todos e fica em cache, isto é por-usuário e não pode
 * ser cacheado. Conquista é permanente — subir o limiar não remove nada daqui.
 */
export type MyUnlocks = {
  progress: UnlockProgress;
  /** Ids conquistados pelo passe ou recebidos no combo dos primeiros inscritos. */
  unlockedOptionIds: number[];
  /** Keys de categoria-feature liberadas (`sign`, `hologram`). */
  unlockedCategoryKeys: string[];
  pendingRewards: RewardNotification[];
  signupRewards: SignupRewards;
};

/** Motivo vem do snapshot do ledger; não acompanha edições posteriores do catálogo. */
export type RewardNotification = Omit<PassReward, "optionKey"> & { optionKey: string | null; signupReferralMin?: number | null };

export type SignupRewards = {
  referrals: number;
  tiers: { referralMin: number; rewards: RewardNotification[] }[];
} | null;

export async function chooseSignupReward(referralMin: number, key: string): Promise<MyUnlocks> {
  const { data } = await http.post<{ data: MyUnlocks }>("/customization/me/rewards/choose", { referralMin, key });
  return data.data;
}

export async function acknowledgeRewards(keys: string[]): Promise<void> {
  await http.post("/customization/me/rewards/acknowledge", { keys });
}

export async function fetchMyUnlocks(
  opts: { signal?: AbortSignal } = {},
): Promise<MyUnlocks> {
  const { data } = await http.get<{ data: MyUnlocks }>("/customization/me", {
    signal: opts.signal,
  });
  return data.data;
}
