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
  /** ≤ 160, trim. */
  description: string | null;
  /** Data URL JPEG de `resizeImage(file, 800)`. */
  image: string | null;
};

/** Público; null = edifício sem perfil. */
export async function fetchBuildingProfile(
  donationId: number,
  signal?: AbortSignal,
  userId?: number,
): Promise<BuildingProfile | null> {
  // Perfil do navegador primeiro; o da conta (gravado antes do beta aberto) por baixo.
  for (const owner of [null, userId ?? null]) {
    const profile = readLocalValue<Record<string, BuildingProfile>>(owner, "profiles", {})[donationId];
    if (profile) return profile;
  }
  if (donationId < 0) return null;
  const { data } = await http.get<{ data: BuildingProfile | null }>(`/donation/${donationId}/profile`, { signal });
  return data.data;
}

/** Alteração visível somente neste navegador, com ou sem conta. */
export async function saveBuildingProfile(donationId: number, profile: BuildingProfile): Promise<void> {
  saveLocalProfile(donationId, profile);
}
