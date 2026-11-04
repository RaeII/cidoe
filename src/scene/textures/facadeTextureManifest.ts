// Descoberta automática das pastas de textura em src/assets/texture/ via Vite glob.
// `eager` + `?url` = só as URLs (strings hasheadas pelo Vite), NÃO os bytes — a
// imagem só baixa quando o TextureLoader busca a URL. Zero custo aqui; o loading é
// lazy no loader. Sem import de THREE: a página admin consome este manifesto sem
// puxar three pro bundle.

import { IS_LOW_TIER } from "../utils/deviceTier";

type MapKind = "color" | "normal" | "roughness" | "metalness" | "displacement";

export type FacadeMapUrls = {
  color: string;
  normal: string | null;
  roughness: string | null;
  metalness: string | null;
  displacement: string | null;
};

export type FacadeTextureInfo = { folder: string; label: string };

// Padrão literal (exigência do Vite). Casa SÓ os sufixos de mapa usados — assim o
// Vite não emite pro dist o que ninguém carrega (ex: _NormalDX, preview .png). Só
// esses arquivos viram asset hasheado. Usamos NormalGL (OpenGL), não DX.
//
// Mesmo mapa em mais de um formato → ganha o de maior RANK:
//   .low.webp (só IS_LOW_TIER) > .webp > .png/.jpg (fonte) > .ktx2
// O .webp (e o .low.webp, metade da resolução) sai de `npm run textures:webp`: ~90% menor
// que a fonte, sem diferença visível. O .ktx2 (Basis, `npm run textures:ktx2`) perde da
// fonte porque o artefato dele aparece no normal map — só entra onde não há outra forma.
// O plugin `dropSupersededTextures` (vite.config.ts) tira o superado do dist: a ordem
// TEM que ser a mesma lá.
const files = import.meta.glob(
  "../../assets/texture/*/*_{Color,NormalGL,Roughness,Metalness,Displacement}.{png,jpg,jpeg,ktx2,webp}",
  { query: "?url&no-inline", import: "default", eager: true },
) as Record<string, string>;
// Celular/máquina modesta: 512 px = 1/4 do download, da VRAM e do upload pra GPU.
const lowTierFiles = import.meta.glob(
  "../../assets/texture/*/*_{Color,NormalGL,Roughness,Metalness,Displacement}.low.webp",
  { query: "?url&no-inline", import: "default", eager: true },
) as Record<string, string>;

const RANK: Record<string, number> = { low: 4, webp: 3, png: 2, jpg: 2, jpeg: 2, ktx2: 1 };

function classify(nameNoExt: string): MapKind | null {
  if (nameNoExt.endsWith("_Color")) return "color";
  if (nameNoExt.endsWith("_NormalGL")) return "normal"; // GL; _NormalDX ignorado
  if (nameNoExt.endsWith("_Roughness")) return "roughness";
  if (nameNoExt.endsWith("_Metalness")) return "metalness";
  if (nameNoExt.endsWith("_Displacement")) return "displacement";
  return null;
}

// Rótulo amigável pra pasta não-cadastrada: corta o sufixo técnico.
// "Facade006_1K-mirrored-PNG" -> "Facade006". "Concrete024_1K-JPG" -> "Concrete024".
function deriveLabel(folder: string): string {
  const cut = folder.indexOf("_1K");
  return (cut > 0 ? folder.slice(0, cut) : folder.split("_")[0]) || folder;
}

const byFolder = new Map<string, Partial<Record<MapKind, { url: string; rank: number }>>>();
const sources = IS_LOW_TIER ? { ...files, ...lowTierFiles } : files;
for (const [path, url] of Object.entries(sources)) {
  const parts = path.split("/");
  const file = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  // "X_Color.low.webp" -> ["X_Color", "low"]; "X_Color.png" -> ["X_Color", "png"]
  const match = /^(.+?)(?:\.(low))?\.([^.]+)$/.exec(file);
  if (!match) continue;
  const kind = classify(match[1]);
  if (!kind) continue;
  const rank = RANK[match[2] ?? match[3].toLowerCase()] ?? 0;
  let maps = byFolder.get(folder);
  if (!maps) byFolder.set(folder, (maps = {}));
  if ((maps[kind]?.rank ?? 0) >= rank) continue;
  maps[kind] = { url, rank };
}

const urlsByFolder = new Map<string, FacadeMapUrls>();
const infos: FacadeTextureInfo[] = [];
for (const [folder, maps] of byFolder) {
  if (!maps.color) continue; // sem color map não é textura válida
  urlsByFolder.set(folder, {
    color: maps.color.url,
    normal: maps.normal?.url ?? null,
    roughness: maps.roughness?.url ?? null,
    metalness: maps.metalness?.url ?? null,
    displacement: maps.displacement?.url ?? null,
  });
  infos.push({ folder, label: deriveLabel(folder) });
}
infos.sort((a, b) => a.folder.localeCompare(b.folder));

/** Pastas de textura disponíveis no repo (fonte da verdade do que existe). */
export const FACADE_TEXTURE_FOLDERS: readonly FacadeTextureInfo[] = infos;

/** Normaliza um `value` do catálogo ("texture/Foo" ou "Foo") para o nome da pasta. */
export function resolveFacadeFolder(value: string | null | undefined): string {
  return (value ?? "").split("/").filter(Boolean).pop() ?? "";
}

/** URLs dos mapas de uma pasta, ou null se a pasta não existe / não tem color map. */
export function getFacadeMapUrls(value: string | null | undefined): FacadeMapUrls | null {
  return urlsByFolder.get(resolveFacadeFolder(value)) ?? null;
}
