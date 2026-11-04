/**
 * Regiões oficiais do Brasil — agrupamento fixo de UFs definido pelo IBGE.
 * Não muda, então não vem do backend: o front deriva região a partir da UF
 * da cidade de cada doação.
 */

export const REGIONS = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"] as const;

export type Region = (typeof REGIONS)[number];

export const UF_REGION: Record<string, Region> = {
  AC: "Norte",
  AM: "Norte",
  AP: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MS: "Centro-Oeste",
  MT: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
};
