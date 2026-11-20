// Imagens do telão de LED: todo .webp de src/assets/club-images/ vira opção, sem lista
// manual. Mesmo padrão de facadeTextureManifest: `eager` + `?url` = só as URLs hasheadas,
// a imagem só baixa quando um telão (ou a miniatura do painel) pede. Sem THREE: o painel
// importa sem puxar three pro bundle. A fonte .png fica fora do build (o glob só casa .webp).

const files = import.meta.glob("../../assets/club-images/*.webp", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type ScreenImage = {
  /** Gravada em `BuildingCustomization.screenImages`: slug do nome do arquivo. */
  key: string;
  /** Nome do arquivo, sem extensão: texto alternativo da miniatura. */
  label: string;
  url: string;
};

/** "Escudo pixelado do Grêmio" → "escudo-pixelado-do-gremio". Estável: é a chave salva. */
export function slugifyScreenImageName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const SCREEN_IMAGES: readonly ScreenImage[] = Object.entries(files)
  .map(([path, url]) => {
    const label = path.split("/").at(-1)!.replace(/\.webp$/, "");
    return { key: slugifyScreenImageName(label), label, url };
  })
  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

const urlByKey = new Map(SCREEN_IMAGES.map((image) => [image.key, image.url]));

/** null = key sem arquivo (imagem removida do evento ou dado adulterado): telão ignora. */
export function getScreenImageUrl(key: string): string | null {
  return urlByKey.get(key) ?? null;
}
