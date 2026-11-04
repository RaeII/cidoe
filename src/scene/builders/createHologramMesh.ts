import * as THREE from "three";

// Holograma cyberpunk: plano único double-sided fixo em world space (NÃO
// acompanha a câmera). Shader custom aplica scanlines, aberração cromática,
// glitch sutil, flicker e fade nas bordas. Cor e opacidade são controladas
// pelo usuário via uniforms. Suporta imagem estática e GIF animado via API
// ImageDecoder.

const HOLOGRAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uOpacity;

  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    vec2 uv = vUv;

    // Wobble horizontal sutil ("projeção tremida")
    uv.x += sin(uv.y * 30.0 + uTime * 4.0) * 0.005;

    // Glitch ocasional: a cada ~250ms uma faixa horizontal sofre deslocamento em X
    float glitchT = floor(uTime * 4.0);
    float glitchAmt = step(0.94, hash(glitchT));
    float yBand = step(0.55, hash(floor(uv.y * 50.0) + glitchT * 7.13));
    uv.x += glitchAmt * yBand * (hash(glitchT + uv.y * 13.0) - 0.5) * 0.12;

    // Aberração cromática (RGB shift) com variação no tempo
    float aberration = 0.0035 + 0.0025 * sin(uTime * 2.5);
    vec4 rs = texture2D(uMap, uv + vec2(aberration, 0.0));
    vec4 gs = texture2D(uMap, uv);
    vec4 bs = texture2D(uMap, uv - vec2(aberration, 0.0));
    vec4 col = vec4(rs.r, gs.g, bs.b, gs.a);

    // Aplicar tint cyberpunk: mistura cor original com tinta neon
    float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(col.rgb, uTint * (lum * 1.4 + 0.15), 0.55);

    // Scanlines finas (alta frequência) — varia com tempo para "respirar"
    float scan = 0.78 + 0.22 * sin(vUv.y * 320.0 - uTime * 6.0);
    tinted *= scan;

    // Flicker rápido + variação de baixa frequência
    float flicker = 0.88 + 0.12 * sin(uTime * 30.0 + hash(floor(uTime * 6.0)) * 6.28);
    tinted *= flicker;

    // Fade nas bordas (top/bottom mais largos, laterais sutis)
    float edgeY = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float edgeX = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
    float edge = edgeY * edgeX;

    float alpha = col.a * edge * uOpacity;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(tinted, alpha);
  }
`;

const HOLOGRAM_CLEARANCE = 0.6;       // distância vertical entre topo e base do holograma
const HOLOGRAM_WIDTH_MULT = 1.6;       // largura do plano em relação ao footprint do prédio
const HOLOGRAM_MIN_WIDTH = 2.2;
const HOLOGRAM_DEFAULT_ASPECT = 1.0;   // usado enquanto a textura não chegou

type HologramFrame = {
  bitmap: ImageBitmap;
  durationMs: number;
};

type HologramAnimation = {
  frames: HologramFrame[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  index: number;
  accumMs: number;
  durationMs: number;
};

export type HologramEntry = {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  texture: THREE.Texture | null;
  // Token incrementado a cada `setHologram*` para descartar loads em flight quando
  // o usuário troca de imagem antes do anterior completar.
  loadToken: number;
  animation: HologramAnimation | null;
  imageAspect: number;
  buildingFootprint: number;
  buildingHeight: number;
  imageDataUrl: string;
  lastAnimationSeconds: number | null;
};

export type HologramFootprint = {
  width: number;   // scale.x do prédio
  depth: number;   // scale.z do prédio
  height: number;  // scale.y do prédio
};

function disposeAnimation(anim: HologramAnimation | null) {
  if (!anim) return;
  for (const f of anim.frames) f.bitmap.close();
  anim.frames.length = 0;
}

function makeMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HOLOGRAM_VERTEX_SHADER,
    fragmentShader: HOLOGRAM_FRAGMENT_SHADER,
    uniforms: {
      uMap: { value: null },
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    // NormalBlending: opacidade linear. uOpacity=0 → invisível, uOpacity=1 → quase
    // opaco (alpha=1 no centro, com fade só nas bordas). Aditivo dava resposta
    // não-linear (sempre soma brilho ao fundo) e impedia chegar a "transparente".
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function applyDimensions(
  entry: HologramEntry,
  footprint: HologramFootprint,
) {
  entry.buildingFootprint = (footprint.width + footprint.depth) / 2;
  entry.buildingHeight = footprint.height;

  const width = Math.max(
    HOLOGRAM_MIN_WIDTH,
    entry.buildingFootprint * HOLOGRAM_WIDTH_MULT,
  );
  const aspect = entry.imageAspect > 0 ? entry.imageAspect : HOLOGRAM_DEFAULT_ASPECT;
  const height = width / aspect;

  // group.scale aplica ao plano único (X = largura, Y = altura).
  entry.group.scale.set(width, height, 1);
}

export type HologramInit = {
  color: string;
  opacity: number;
};

export function createHologramMesh(
  footprint: HologramFootprint,
  init: HologramInit,
): HologramEntry {
  const group = new THREE.Group();
  const material = makeMaterial(init.color, init.opacity);

  // Plano unitário double-sided; o tamanho final vem de group.scale.
  const geometry = new THREE.PlaneGeometry(1, 1);
  const plane = new THREE.Mesh(geometry, material);
  group.add(plane);

  // Renderizar por último, sem escrita de profundidade — característico de glow.
  plane.renderOrder = 10;

  const entry: HologramEntry = {
    group,
    material,
    texture: null,
    loadToken: 0,
    animation: null,
    imageAspect: HOLOGRAM_DEFAULT_ASPECT,
    buildingFootprint: 0,
    buildingHeight: 0,
    imageDataUrl: "",
    lastAnimationSeconds: null,
  };

  applyDimensions(entry, footprint);
  return entry;
}

export function setHologramTint(entry: HologramEntry, color: string) {
  const uniform = entry.material.uniforms.uTint.value as THREE.Color;
  uniform.set(color);
}

export function setHologramOpacity(entry: HologramEntry, opacity: number) {
  entry.material.uniforms.uOpacity.value = opacity;
}

export function positionHologram(
  entry: HologramEntry,
  buildingCenter: THREE.Vector3,
  footprint: HologramFootprint,
) {
  applyDimensions(entry, footprint);
  // Centro do holograma: topo do prédio + clearance + metade da altura do plano.
  const planeHeight = entry.group.scale.y;
  entry.group.position.set(
    buildingCenter.x,
    buildingCenter.y + footprint.height / 2 + HOLOGRAM_CLEARANCE + planeHeight / 2,
    buildingCenter.z,
  );
}

export function tickHologram(entry: HologramEntry, elapsedSeconds: number, deltaMs: number) {
  entry.material.uniforms.uTime.value = elapsedSeconds;
  const elapsedMs = entry.lastAnimationSeconds === null
    ? deltaMs : Math.max(0, (elapsedSeconds - entry.lastAnimationSeconds) * 1000);
  entry.lastAnimationSeconds = elapsedSeconds;

  const anim = entry.animation;
  if (!anim || anim.frames.length === 0) return;

  // Saltar ciclos inteiros permite retomar após sair da tela sem desenhar intermediários.
  anim.accumMs += elapsedMs % anim.durationMs;
  const previousIndex = anim.index;
  while (anim.accumMs >= anim.frames[anim.index].durationMs) {
    anim.accumMs -= anim.frames[anim.index].durationMs;
    anim.index = (anim.index + 1) % anim.frames.length;
  }
  if (anim.index !== previousIndex) {
    const frame = anim.frames[anim.index];
    anim.ctx.clearRect(0, 0, anim.canvas.width, anim.canvas.height);
    anim.ctx.drawImage(frame.bitmap, 0, 0, anim.canvas.width, anim.canvas.height);
    if (entry.texture) entry.texture.needsUpdate = true;
  }
}

// Aceita o `loadToken` capturado no momento da chamada — se o entry recebeu
// outro setHologramImage no meio do load, os resultados são descartados.
async function loadGifFrames(
  dataUrl: string,
  isCurrent: () => boolean,
): Promise<{ frames: HologramFrame[]; width: number; height: number } | null> {
  type ImageDecoderResult = {
    image: VideoFrame;
  };
  type ImageDecoderTrack = { frameCount: number };
  type ImageDecoderInstance = {
    completed: Promise<void>;
    tracks: { selectedTrack: ImageDecoderTrack | null };
    decode: (init: { frameIndex: number }) => Promise<ImageDecoderResult>;
    close: () => void;
  };
  type ImageDecoderCtor = new (init: {
    data: ReadableStream<Uint8Array>;
    type: string;
  }) => ImageDecoderInstance;

  const ImageDecoderCtor = (
    globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }
  ).ImageDecoder;
  if (!ImageDecoderCtor) return null;

  let decoder: ImageDecoderInstance;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    if (!isCurrent()) return null;
    decoder = new ImageDecoderCtor({ data: blob.stream(), type: "image/gif" });
  } catch {
    return null;
  }

  const frames: HologramFrame[] = [];
  try {
    await decoder.completed;
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (frameCount === 0) {
      return null;
    }

    let width = 0;
    let height = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    for (let i = 0; i < frameCount; i++) {
      if (!isCurrent()) {
        for (const frame of frames) frame.bitmap.close();
        return null;
      }
      const result = await decoder.decode({ frameIndex: i });
      const frame = result.image;
      try {
        if (i === 0) {
          width = frame.displayWidth || frame.codedWidth;
          height = frame.displayHeight || frame.codedHeight;
          const scale = Math.min(1, 512 / Math.max(width, height));
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
        }
        // Mesma redução do canvas exibido, feita uma vez; não retém frames gigantes.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        // VideoFrame.duration vem em microssegundos (us). Default 100ms se ausente.
        const duration = frame.duration;
        const durationMs = duration && duration > 0 ? duration / 1000 : 100;
        frames.push({ bitmap, durationMs: Math.max(20, durationMs) });
      } finally {
        frame.close();
      }
    }

    return { frames, width, height };
  } catch {
    for (const frame of frames) frame.bitmap.close();
    return null; // Decodificador indisponível/falhou: mantém o fallback estático.
  } finally {
    decoder.close();
  }
}

function loadStaticImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = dataUrl;
  });
}

export async function setHologramImage(
  entry: HologramEntry,
  dataUrl: string,
  footprint: HologramFootprint,
) {
  entry.loadToken += 1;
  const myToken = entry.loadToken;
  entry.imageDataUrl = dataUrl;

  // Disponibilizar recursos antigos
  if (entry.texture) {
    entry.texture.dispose();
    entry.texture = null;
  }
  disposeAnimation(entry.animation);
  entry.animation = null;
  entry.lastAnimationSeconds = null;

  const isGif = dataUrl.startsWith("data:image/gif");

  if (isGif) {
    const result = await loadGifFrames(dataUrl, () => entry.loadToken === myToken);
    if (entry.loadToken !== myToken) {
      // Carga obsoleta — descartar
      if (result) for (const f of result.frames) f.bitmap.close();
      return;
    }
    if (result && result.frames.length > 0) {
      // Cap de resolução: GIF grande vira upload de textura gigante por frame.
      // 512 no maior lado é mais que suficiente pro tamanho do holograma na cena.
      const MAX_GIF_TEXTURE = 512;
      const gifScale = Math.min(1, MAX_GIF_TEXTURE / Math.max(result.width, result.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(result.width * gifScale));
      canvas.height = Math.max(1, Math.round(result.height * gifScale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(result.frames[0].bitmap, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        entry.texture = texture;
        entry.material.uniforms.uMap.value = texture;
        entry.imageAspect = result.width / result.height;
        entry.animation = {
          frames: result.frames,
          canvas,
          ctx,
          index: 0,
          accumMs: 0,
          durationMs: result.frames.reduce((sum, frame) => sum + frame.durationMs, 0),
        };
        applyDimensions(entry, footprint);
        return;
      }
      for (const f of result.frames) f.bitmap.close();
    }
    // Fallback: ImageDecoder indisponível ou falhou — usa primeira/única frame estática
  }

  const img = await loadStaticImage(dataUrl);
  if (entry.loadToken !== myToken) return;
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  entry.texture = texture;
  entry.material.uniforms.uMap.value = texture;
  entry.imageAspect =
    img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalWidth / img.naturalHeight
      : HOLOGRAM_DEFAULT_ASPECT;
  applyDimensions(entry, footprint);
}

export function disposeHologramMesh(entry: HologramEntry) {
  // Impede que uma imagem ainda em carga recrie a textura após o fechamento.
  entry.loadToken += 1;
  for (const child of entry.group.children) {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
    }
  }
  entry.material.dispose();
  if (entry.texture) {
    entry.texture.dispose();
    entry.texture = null;
  }
  disposeAnimation(entry.animation);
  entry.animation = null;
}
