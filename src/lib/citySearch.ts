import type { City } from "../api/location/location.types";

export type CityIndex = readonly { city: City; key: string }[];

/** Sem acento, minúsculo, pontuação vira espaço: "D'Oeste" e "d oeste" casam. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normaliza uma vez ("Campinas, SP" → "campinas sp"); a busca roda a cada tecla. */
export function indexCities(cities: readonly City[]): CityIndex {
  return cities.map((city) => ({ city, key: normalizeSearch(`${city.name} ${city.uf}`) }));
}

/** Prefixo antes de substring; dentro de cada grupo mantém a ordem recebida (alfabética). */
export function searchCities(index: CityIndex, query: string, limit = 6): City[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const prefix: City[] = [];
  const middle: City[] = [];
  for (const { city, key } of index) {
    if (key.startsWith(q)) {
      prefix.push(city);
      if (prefix.length === limit) break;
    } else if (middle.length < limit && key.includes(q)) {
      middle.push(city);
    }
  }
  return [...prefix, ...middle].slice(0, limit);
}

/**
 * Texto digitado sem clicar numa opção: escolhe a cidade só quando não há dúvida
 * (resultado único ou um único nome exato). "Campinas" → Campinas, SP; "Bom Jesus" → null.
 */
export function pickTypedCity(results: readonly City[], query: string): City | null {
  if (results.length === 1) return results[0];
  const q = normalizeSearch(query);
  const exact = results.filter((city) => normalizeSearch(city.name) === q);
  return exact.length === 1 ? exact[0] : null;
}

export function formatCity(city: City): string {
  return `${city.name}, ${city.uf}`;
}
