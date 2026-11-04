import * as THREE from "three";

// ImageBitmap decodifica fora da main thread. Com HTMLImageElement (TextureLoader) o
// decode acontece dentro do texSubImage2D, na main thread, no frame do upload — o
// profile mostrou ~230 ms em fachadas + HDRI. Regra de suporte copiada do GLTFLoader
// do three: Safari < 17 e Firefox < 98 têm createImageBitmap incompleto → TextureLoader.
const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
const safariVersion = /^((?!chrome|android).)*safari/i.test(ua)
  ? Number(/Version\/(\d+)/.exec(ua)?.[1] ?? -1)
  : Infinity;
const firefoxVersion = Number(/Firefox\/(\d+)\./.exec(ua)?.[1] ?? Infinity);
const bitmapLoader =
  typeof createImageBitmap !== "undefined" && safariVersion >= 17 && firefoxVersion >= 98
    ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none" })
    : null;
const textureLoader = new THREE.TextureLoader();

/**
 * PNG/JPG/WebP → THREE.Texture. As duas rotas chegam na GPU com a mesma orientação:
 * ImageBitmap ignora `flipY` no upload, então o flip vem do createImageBitmap.
 */
export async function loadImageTexture(url: string): Promise<THREE.Texture> {
  if (!bitmapLoader) return textureLoader.loadAsync(url);
  const bitmap = await bitmapLoader.loadAsync(url);
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.addEventListener("dispose", () => bitmap.close());
  return texture;
}
