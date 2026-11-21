import type { UnlockRule } from "@/lib/unlock";
import type { UserPage } from "../user/user.types";

export interface AdminOng {
  id: number;
  name: string;
  profile_image: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface OngInput {
  name: string;
  profile_image: string | null;
  is_active: boolean;
}

export interface OngPage {
  data: AdminOng[];
  pagination: UserPage["pagination"];
}

export interface EarlySignupInput {
  isActive: boolean;
  userLimit: number | null;
  tiers: { referralMin: number; optionIds: number[]; categoryIds: number[] }[];
}

export interface EarlySignupSettings extends EarlySignupInput {
  registeredCount: number;
  rewardedCount: number;
}

/** Métricas agregadas de GET /admin/dashboard/stats (rota JWT + admin). */
export interface DashboardStats {
  donations: {
    count: number;
    total_value: number;
    avg_value: number;
    max_value: number;
  };
  cities: number;
  ongs: number;
  users: number;
}

/** Resposta de POST /admin/test-buildings (cria N edifícios de teste, acumulativo). */
export interface CreateTestBuildingsResult {
  inserted: number;
  total_active: number;
}

/** Resposta de DELETE /admin/test-buildings (exclui TODAS as doações). */
export interface DeleteAllBuildingsResult {
  deleted: number;
}

/** Contagens do catálogo IBGE (regiões/estados/municípios). Base de sync e status. */
export interface IbgeCounts {
  regions: number;
  states: number;
  cities: number;
}

/** Resposta de GET /admin/ibge/status — `linked` diz se o catálogo já foi carregado. */
export interface IbgeStatus extends IbgeCounts {
  linked: boolean;
}

// ─── Personalizações (catálogo) ─────────────────────────────────

/**
 * Requisito de liberação na entrada das rotas de escrita. Três estados, e a
 * diferença entre eles importa:
 *   ausente → não mexe no que está gravado
 *   null    → limpa a exigência daquele eixo
 *   número  → passa a exigir (o backend recusa zero)
 */
export interface UnlockInput {
  unlockDonationMin?: number | null;
  unlockReferralMin?: number | null;
  unlockMode?: "all" | "any";
}

/** Alvo com requisito e contagem de quem já conquistou. */
interface UnlockTarget {
  unlock: UnlockRule;
  /** Quantos usuários já liberaram. Eles mantêm o acesso se a regra mudar. */
  unlockedCount: number;
}

export interface CustomizationOption extends UnlockTarget {
  id: number;
  key: string;
  label: string;
  value: string | null;
  sortOrder: number;
  isActive: boolean;
  isCodeBound: boolean;
}

export interface CustomizationCategory extends UnlockTarget {
  id: number;
  parentId: number | null;
  key: string;
  label: string;
  kind: string;
  sortOrder: number;
  isActive: boolean;
  isExtensible: boolean;
  options: CustomizationOption[];
}

export interface CustomizationTree {
  categories: CustomizationCategory[];
}

export interface CreateOptionInput extends UnlockInput {
  categoryId: number;
  key: string;
  label: string;
  value?: string;
  sortOrder?: number;
}

export interface UpdateOptionInput extends UnlockInput {
  label?: string;
  value?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryInput extends UnlockInput {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ─── Evento dos times ───────────────────────────────────────────

/** Imagem do telão. `number` é estável (chave "<slug>/<number>" nos edifícios); URLs com versão. */
export interface AdminClubImage {
  number: number;
  url: string;
  thumbUrl: string;
}

export interface AdminClub {
  slug: string;
  name: string;
  isActive: boolean;
  /** Quantos escolheram este time. */
  fans: number;
  createdAt: string;
  images: AdminClubImage[];
}

/** GET /admin/club-event: evento ligado, participantes, trocas usadas e todos os times. */
export interface ClubEventOverview {
  isActive: boolean;
  participants: number;
  changesUsed: number;
  clubs: AdminClub[];
}

export interface CreateClubInput {
  slug: string;
  name: string;
  isActive: boolean;
}

/** Imagem 256 px + miniatura 96 px, data URL (src/lib/image.ts encodeClubImage). */
export interface ClubImageInput {
  image: string;
  thumb: string;
}
