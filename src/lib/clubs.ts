import { clubThumbUrl, getScreenImageUrl, screenImageKey } from "@/scene/textures/screenImageManifest";
import { normalizeSearch } from "@/lib/citySearch";

export type Club = { slug: string; name: string };

/**
 * Times do evento. `slug` = pasta em `public/clubes/` e valor aceito pela API
 * (`CLUB_SLUGS` no back). Time novo: pasta + `npm run clubs:webp` + linha aqui + slug no back.
 * Conferido por `scripts/check-club-event.mjs`.
 */
export const CLUBS: readonly Club[] = ([
  ["abc", "ABC"], ["america-mg", "América-MG"], ["america-rj", "America-RJ"], ["america-rn", "América-RN"],
  ["athletic-mg", "Athletic-MG"], ["athletico-paranaense", "Athletico Paranaense"], ["atletico-go", "Atlético-GO"],
  ["atletico-mineiro", "Atlético Mineiro"], ["avai", "Avaí"], ["bahia", "Bahia"], ["barra", "Barra"],
  ["botafogo", "Botafogo"], ["botafogo-pb", "Botafogo-PB"], ["botafogo-sp", "Botafogo-SP"], ["bragantino", "Bragantino"],
  ["brasil-de-pelotas", "Brasil de Pelotas"], ["brusque", "Brusque"], ["campinense", "Campinense"], ["caxias", "Caxias"],
  ["ceara", "Ceará"], ["chapecoense", "Chapecoense"], ["corinthians", "Corinthians"], ["coritiba", "Coritiba"],
  ["crb", "CRB"], ["criciuma", "Criciúma"], ["cruzeiro", "Cruzeiro"], ["csa", "CSA"], ["cuiaba", "Cuiabá"],
  ["ferroviaria", "Ferroviária"], ["ferroviario-ce", "Ferroviário"], ["figueirense", "Figueirense"],
  ["flamengo", "Flamengo"], ["fluminense", "Fluminense"], ["fortaleza", "Fortaleza"], ["goias", "Goiás"],
  ["gremio", "Grêmio"], ["guarani", "Guarani"], ["internacional", "Internacional"], ["joinville", "Joinville"],
  ["juventude", "Juventude"], ["londrina", "Londrina"], ["marcilio-dias", "Marcílio Dias"], ["mirassol", "Mirassol"],
  ["nautico", "Náutico"], ["novorizontino", "Novorizontino"], ["operario-pr", "Operário-PR"], ["palmeiras", "Palmeiras"],
  ["parana-clube", "Paraná Clube"], ["paysandu", "Paysandu"], ["ponte-preta", "Ponte Preta"], ["portuguesa", "Portuguesa"],
  ["remo", "Remo"], ["sampaio-correa", "Sampaio Corrêa"], ["santa-cruz", "Santa Cruz"], ["santos", "Santos"],
  ["sao-bernardo", "São Bernardo"], ["sao-caetano", "São Caetano"], ["sao-jose-rs", "São José-RS"],
  ["sao-luiz-ijui", "São Luiz"], ["sao-paulo", "São Paulo"], ["sport", "Sport"], ["treze", "Treze"],
  ["vasco", "Vasco"], ["vila-nova", "Vila Nova"], ["vitoria", "Vitória"], ["ypiranga-erechim", "Ypiranga-RS"],
] as const)
  .map(([slug, name]) => ({ slug, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const bySlug = new Map(CLUBS.map((club) => [club.slug, club]));
const searchKeys = new Map(CLUBS.map((club) => [club.slug, normalizeSearch(club.name)]));

/** Slug do link (`?time=`) ou da API → time; desconhecido/vazio → null. */
export function findClub(slug: string | null | undefined): Club | null {
  return (slug && bySlug.get(slug.trim().toLowerCase())) || null;
}

/** As 3 imagens do telão do time, na ordem dos arquivos (1 = escudo). */
export function clubImages(club: Club) {
  return [1, 2, 3].map((index) => {
    const key = screenImageKey(club.slug, index);
    return { key, url: getScreenImageUrl(key)!, label: `${club.name}, imagem ${index}` };
  });
}

export const clubThumb = (club: Club) => clubThumbUrl(club.slug);

/** Sem acento: "sao" acha São Paulo. Prefixo de qualquer palavra antes de trecho no meio. */
export function searchClubs(query: string): readonly Club[] {
  const q = normalizeSearch(query);
  if (!q) return CLUBS;
  const prefix = CLUBS.filter((club) => ` ${searchKeys.get(club.slug)}`.includes(` ${q}`));
  const middle = CLUBS.filter((club) => !prefix.includes(club) && searchKeys.get(club.slug)!.includes(q));
  return [...prefix, ...middle];
}
