import type { City } from "../location/location.types";

/** "Como conheceu o Cidoe?" — enum fechado do backend. Rótulos no `ProfileDetailsFields`. */
export type DiscoverySource =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "whatsapp"
  | "google"
  | "friend"
  | "ong"
  | "other";

/** Usuário público retornado pela API (sem hash de senha). */
export interface User {
  id: number;
  username: string;
  name: string | null;
  profile_image: string | null;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  city: City | null;
  discovery_source: DiscoverySource | null;
  /** Só preenchido quando `discovery_source = "other"`. */
  discovery_source_other: string | null;
  /** null = ainda não salvou nem pulou o onboarding do primeiro login. */
  onboarding_completed_at: string | null;
  /** Versão (data) dos Termos + Política aceita por último; null = nunca aceitou. */
  terms_version: string | null;
  terms_accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Perfil progressivo: tudo opcional; `undefined` não mexe, `null` limpa. */
export interface ProfileDetailsInput {
  city_id?: number | null;
  discovery_source?: DiscoverySource | null;
  discovery_source_other?: string | null;
}

/** Valor editado pelos campos compartilhados (onboarding e aba Perfil). */
export type ProfileDetails = Pick<User, "city" | "discovery_source" | "discovery_source_other">;

export interface UpdateOwnProfileInput extends ProfileDetailsInput {
  name: string;
  username: string;
  profile_image?: string | null;
}

/** Página da listagem admin (`GET /user`) — espelha `paginatedResponse` do backend. */
export interface UserPage {
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
