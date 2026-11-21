import type { ClubCatalogEntry } from "@/api/club/club.routes";
import { normalizeSearch } from "@/lib/citySearch";

/** Time do evento, vindo do catálogo da API (`GET /club/catalog`, admin em /dale/times). */
export type Club = ClubCatalogEntry;

/** Slug do link (`?time=`) ou da API → time; desconhecido/vazio → null. Inativo volta (quem torce mantém). */
export function findClub(clubs: readonly Club[], slug: string | null | undefined): Club | null {
  const wanted = slug?.trim().toLowerCase();
  return (wanted && clubs.find((club) => club.slug === wanted)) || null;
}

/** Imagens do telão do time, na ordem do catálogo (1ª = escudo). */
export function clubImages(club: Club) {
  return club.images.map((image, index) => ({ ...image, label: `${club.name}, imagem ${index + 1}` }));
}

/** Só times ativos. Sem acento: "sao" acha São Paulo. Prefixo de qualquer palavra antes de trecho no meio. */
export function searchClubs(clubs: readonly Club[], query: string): readonly Club[] {
  const active = clubs.filter((club) => club.isActive);
  const q = normalizeSearch(query);
  if (!q) return active;
  const keys = new Map(active.map((club) => [club.slug, normalizeSearch(club.name)]));
  const prefix = active.filter((club) => ` ${keys.get(club.slug)}`.includes(` ${q}`));
  const middle = active.filter((club) => !prefix.includes(club) && keys.get(club.slug)!.includes(q));
  return [...prefix, ...middle];
}

/**
 * Troca de time: cada imagem do telão vira a da MESMA POSIÇÃO no time novo (2ª → 2ª), ordem
 * mantida. Sem par (time novo tem menos imagens) ou imagem que saiu do catálogo: sai. Mesmo
 * cálculo do servidor (rewriteScreenImages), que já migrou os edifícios gravados no banco.
 */
export function remapScreenImages(clubs: readonly Club[], keys: readonly string[], slug: string): string[] {
  const target = findClub(clubs, slug)?.images ?? [];
  return [...new Set(keys.flatMap((key) => {
    const position = findClub(clubs, key.split("/")[0])?.images.findIndex((image) => image.key === key) ?? -1;
    return position >= 0 && target[position] ? [target[position].key] : [];
  }))];
}
