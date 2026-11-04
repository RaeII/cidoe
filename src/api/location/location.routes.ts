import { http } from "../http";
import type { City } from "./location.types";

let cities: Promise<City[]> | null = null;

/**
 * Catálogo inteiro (~5570 cidades) numa requisição só, compartilhada entre o
 * onboarding e a aba Perfil. Falha limpa o cache para a próxima chamada tentar de novo.
 */
export function getCities(): Promise<City[]> {
  cities ??= http
    .get<{ data: [id: number, name: string, uf: string][] }>("/location/cities")
    .then(({ data }) => data.data.map(([id, name, uf]) => ({ id, name, uf })))
    .catch((error: unknown) => {
      cities = null;
      throw error;
    });
  return cities;
}
