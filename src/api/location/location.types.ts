/** Cidade do catálogo IBGE (`id` = código IBGE de 7 dígitos). A UF vem junto. */
export interface City {
  id: number;
  name: string;
  uf: string;
}
