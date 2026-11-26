/** Pré-lançamento: perfil público somente para leitura; edições locais. */
import { http } from "./http";
import { readLocalValue, saveLocalProfile } from "../lib/prelaunchCity";

/** Toda contribuição escolhe ONG; aumentar mantém a cidade do edifício. `value` em reais (2 casas). */
export type Contribution =
  | { donationId: null; ongId: number; cityId: number; value: number }
  | { donationId: number; ongId: number; value: number };

export type BuildingProfile = {
  /** ≤ 40, trim. */
  name: string | null;
  /** "Quem ergueu": ≤ 40, trim. Texto livre do dono — nome da conta nunca vai pro edifício. */
  owner: string | null;
  /** ≤ 160, trim. */
  description: string | null;
  /** Data URL JPEG de `resizeImage(file, 800)`. */
  image: string | null;
  /** http(s) com domínio, ≤ 200 (`normalizeWebsite`). */
  website: string | null;
};

/** Perfis gravados antes de "Quem ergueu"/site não têm os campos. */
const withProfileDefaults = (profile: BuildingProfile | null) =>
  profile && { ...profile, owner: profile.owner ?? null, website: profile.website ?? null };

/** Site digitado → URL gravada: sem esquema vira https; só http(s) com domínio. `undefined` = inválido. */
export function normalizeWebsite(input: string): string | null | undefined {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.href.length > 200) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Site como aparece no card: sem esquema nem barra final. */
export const websiteLabel = (website: string) => website.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** Público; null = edifício sem perfil. */
export async function fetchBuildingProfile(
  donationId: number,
  signal?: AbortSignal,
  userId?: number,
): Promise<BuildingProfile | null> {
  // Perfil do navegador primeiro; o da conta (gravado antes do beta aberto) por baixo.
  for (const owner of [null, userId ?? null]) {
    const profile = readLocalValue<Record<string, BuildingProfile>>(owner, "profiles", {})[donationId];
    if (profile) return withProfileDefaults(profile);
  }
  if (donationId < 0) return null;
  const { data } = await http.get<{ data: BuildingProfile | null }>(`/donation/${donationId}/profile`, { signal });
  return withProfileDefaults(data.data);
}

/** Alteração visível somente neste navegador, com ou sem conta. */
export async function saveBuildingProfile(donationId: number, profile: BuildingProfile): Promise<void> {
  saveLocalProfile(donationId, profile);
}
