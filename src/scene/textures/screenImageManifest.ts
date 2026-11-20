// Imagens do telão de LED = imagens do evento dos times: `public/clubes/<time>/{1,2,3}.webp`
// (256 px, `npm run clubs:webp`; 1 = escudo). Key gravada em `BuildingCustomization.screenImages`
// = "<time>/<n>" e a URL sai da própria key: cena não carrega lista de times nem glob (catálogo
// com nomes fica em src/lib/clubs.ts, só nos chunks da UI). Sem THREE: o painel importa sem puxar
// three pro bundle. public/ não tem hash: nginx guarda 30 dias — trocar imagem = trocar nome.

const KEY = /^[a-z0-9-]{1,40}\/[1-3]$/;

/** "gremio", 1 → "gremio/1": valor gravado no telão. */
export const screenImageKey = (club: string, index: number) => `${club}/${index}`;

/** Miniatura 96 px do escudo (lista de times). */
export const clubThumbUrl = (club: string) => `/clubes/${club}/thumb.webp`;

/**
 * null = key fora do formato (dado antigo, como os escudos de teste de antes do evento, ou
 * adulterado): telão ignora. Time sem pasta passa no formato e dá 404: tela apagada + aviso.
 */
export function getScreenImageUrl(key: string): string | null {
  return KEY.test(key) ? `/clubes/${key}.webp` : null;
}
