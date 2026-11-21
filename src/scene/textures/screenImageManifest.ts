// Imagens do telão de LED = imagens do evento dos times, no banco (admin em /dale/times) e
// servidas pela API (256 px; 1ª = escudo). Key gravada em `BuildingCustomization.screenImages`
// = "<time>/<n>" (n = número estável da imagem) e a URL sai da própria key: cena não carrega o
// catálogo (nomes e versões ficam no catálogo, só nos chunks da UI). Sem `?v=`: a API guarda
// 5 min + ETag, troca de imagem pelo admin chega nesse prazo. Sem THREE: o painel importa sem
// puxar three pro bundle.

const KEY = /^[a-z0-9-]{1,40}\/[1-9][0-9]{0,2}$/;

/**
 * null = key fora do formato (dado antigo, como os escudos de teste de antes do evento, ou
 * adulterado): telão ignora. Imagem removida pelo admin passa no formato e dá 404: tela apagada.
 */
export function getScreenImageUrl(key: string): string | null {
  return KEY.test(key) ? `/api/club/images/${key}` : null;
}
