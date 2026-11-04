import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { getFacadeMapUrls, resolveFacadeFolder } from "./facadeTextureManifest";
import { loadImageTexture } from "./loadImageTexture";

export type FacadeTextureSet = {
  color: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  metalness: THREE.Texture | null;
  displacement: THREE.Texture | null;
};

// KTX2 precisa saber quais formatos comprimidos a GPU aceita (BC7/ASTC/ETC2) —
// daí o detectSupport(renderer). Sem init, um .ktx2 cai no fallback PNG/JPG do
// próprio manifesto (que só acontece se o encoder nunca rodou), ou avisa e falha.
let ktx2Loader: KTX2Loader | null = null;

/** Chamado uma vez pelo manager, com o renderer da cena. Idempotente. */
export function initFacadeTextureLoader(renderer: THREE.WebGLRenderer): void {
  if (ktx2Loader) return;
  ktx2Loader = new KTX2Loader()
    // basis_transcoder.{js,wasm} vivem em public/basis/ (cópia de three/examples).
    // BASE_URL cobre deploy em subpath.
    .setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
    .detectSupport(renderer);
}

async function loadOne(
  url: string,
  srgb: boolean,
  anisotropy: number,
): Promise<THREE.Texture> {
  let tex: THREE.Texture;
  if (url.endsWith(".ktx2")) {
    if (!ktx2Loader) {
      throw new Error("KTX2Loader não inicializado — chame initFacadeTextureLoader(renderer).");
    }
    tex = await ktx2Loader.loadAsync(url);
  } else {
    tex = await loadImageTexture(url);
  }
  // O .ktx2 é gerado com y-flip (ver scripts/encode-ktx2.mjs), então as duas rotas
  // chegam na GPU com a mesma orientação — trocar de formato não muda a imagem.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function loadOptional(
  url: string | null,
  srgb: boolean,
  anisotropy: number,
): Promise<THREE.Texture | null> {
  if (!url) return Promise.resolve(null);
  return loadOne(url, srgb, anisotropy).catch((err) => {
    console.warn(`[textures] mapa opcional falhou: ${url}`, err);
    return null;
  });
}

// Cache por pasta, vida do app: cada textura carrega 1x e é compartilhada entre
// todos os prédios/materiais. Trocar textura e voltar reusa (zero re-download,
// zero re-upload GPU). Curated set pequeno — sem eviction.
// ponytail: cache global sem LRU; adicionar eviction se o set de texturas crescer.
const inFlight = new Map<string, Promise<FacadeTextureSet | null>>();
const ready = new Map<string, FacadeTextureSet>();

/** Set já carregado, sem disparar rede. Usado pra evitar 1 frame sem textura. */
export function peekFacadeTextureSet(
  value: string | null | undefined,
): FacadeTextureSet | null {
  return ready.get(resolveFacadeFolder(value)) ?? null;
}

type OptionalMap = "normal" | "roughness" | "metalness" | "displacement";
export type FacadeLoadOptions = Partial<Record<OptionalMap, boolean>> & { bump?: boolean };
const optionalMaps: OptionalMap[] = ["normal", "roughness", "metalness", "displacement"];
const mapInFlight = new Map<string, Promise<THREE.Texture | null>>();

async function ensureMaps(key: string, set: FacadeTextureSet, anisotropy: number, options: FacadeLoadOptions) {
  const urls = getFacadeMapUrls(key);
  if (!urls) return set;
  const ensure = async (kind: OptionalMap) => {
    if (set[kind] || !urls[kind]) return;
    const mapKey = `${key}:${kind}`;
    let pending = mapInFlight.get(mapKey);
    if (!pending) {
      pending = loadOptional(urls[kind], false, anisotropy);
      mapInFlight.set(mapKey, pending);
    }
    set[kind] = await pending;
    if (!set[kind]) mapInFlight.delete(mapKey); // Falha opcional permite nova tentativa.
  };
  await Promise.all(optionalMaps.filter((kind) => options[kind] !== false).map(ensure));
  // normalMap substitui bumpMap no shader; se o normal falhar, conserva o relevo anterior.
  if (options.bump && (options.normal === false || !set.normal)) await ensure("displacement");
  return set;
}

/** Cache compartilhado e incremental: pede apenas mapas usados, sem bloquear pedidos concorrentes. */
export async function loadFacadeTextureSet(
  value: string | null | undefined,
  anisotropy: number,
  options: FacadeLoadOptions = {},
): Promise<FacadeTextureSet | null> {
  const key = resolveFacadeFolder(value);
  const set = await (inFlight.get(key) ?? startSet(key, anisotropy));
  return set ? ensureMaps(key, set, anisotropy, options) : null;
}

function startSet(key: string, anisotropy: number): Promise<FacadeTextureSet | null> {
  const urls = getFacadeMapUrls(key);
  if (!urls) return Promise.resolve(null);
  const pending = loadOne(urls.color, true, anisotropy).then((color) => {
    const set: FacadeTextureSet = { color, normal: null, roughness: null, metalness: null, displacement: null };
    ready.set(key, set);
    return set;
  }).catch((err) => {
    console.warn(`[textures] falha ao carregar a pasta "${key}"`, err);
    inFlight.delete(key);
    return null;
  });
  inFlight.set(key, pending);
  return pending;
}
