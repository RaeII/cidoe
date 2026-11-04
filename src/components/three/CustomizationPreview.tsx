import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createPreviewScene,
  resolveSubject,
  type PreviewSubject,
} from "@/scene/builders/createPreviewScene";

const THUMB_SIZE = 128;

function createRenderer(canvasLess: boolean) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    // Thumb lê o buffer com toDataURL depois do render.
    preserveDrawingBuffer: canvasLess,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

// PNG por assunto. Um render só por assunto na vida da aba — a lista inteira
// custa um punhado de frames e depois é só <img>. "" = falhou / sem preview.
const thumbCache = new Map<string, string>();

// UM contexto p/ todas as miniaturas. Renderer por thumb esgota o limite do
// browser (~16 contextos vivos — dispose() não solta o contexto) e o browser
// derruba o mais antigo: o da cena principal.
let thumbRenderer: THREE.WebGLRenderer | null = null;

function getThumbRenderer() {
  if (!thumbRenderer || thumbRenderer.getContext().isContextLost()) {
    thumbRenderer?.dispose();
    thumbRenderer = createRenderer(true);
    thumbRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    thumbRenderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  }
  return thumbRenderer;
}

function renderThumb(subject: PreviewSubject): string {
  const cacheKey = `${subject.kind}:${subject.key}`;
  const cached = thumbCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const resolved = resolveSubject(subject);
  let url = "";
  let view: ReturnType<typeof createPreviewScene> | null = null;
  try {
    if (resolved) {
      view = createPreviewScene(resolved);
      const renderer = getThumbRenderer();
      view.place(view.frame(1));
      renderer.render(view.scene, view.camera);
      url = renderer.domElement.toDataURL("image/png");
    }
  } catch {
    url = "";
  } finally {
    // Geometria/material descartados soltam os buffers no renderer compartilhado.
    view?.dispose();
  }
  thumbCache.set(cacheKey, url);
  return url;
}

/** Miniatura estática (lista do admin). */
export function CustomizationThumb({
  subject,
  className,
}: {
  subject: PreviewSubject;
  className?: string;
}) {
  const { kind, key } = subject;
  const [url, setUrl] = useState(() => thumbCache.get(`${kind}:${key}`) ?? "");

  useEffect(() => {
    // rAF: render sai do commit do React — lista com 10 itens não trava o paint.
    const id = requestAnimationFrame(() => setUrl(renderThumb({ kind, key })));
    return () => cancelAnimationFrame(id);
  }, [kind, key]);

  if (!url) return <div className={className} aria-hidden />;
  return <img src={url} alt="" className={className} draggable={false} />;
}

/** Preview interativo (arrastar pra girar). Um contexto WebGL enquanto montado. */
export function CustomizationPreview({
  subject,
  className,
}: {
  subject: PreviewSubject;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const { kind, key } = subject;
  const resolved = resolveSubject(subject);

  useEffect(() => {
    const container = containerRef.current;
    const resolved = resolveSubject({ kind, key });
    if (!container || !resolved) return;

    let renderer: THREE.WebGLRenderer;
    try { renderer = createRenderer(false); }
    catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- falha do WebGL externo vira feedback.
      setError(true);
      return;
    }
    const view = createPreviewScene(resolved);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.classList.add("focus-inset");
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Prévia 3D. Arraste ou use Shift e as setas para girar; role ou use + e − para aproximar e afastar.");

    const controls = new OrbitControls(view.camera, renderer.domElement);
    controls.target.copy(view.center);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enableDamping = true;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 1.4;
    controls.listenToKeyEvents(renderer.domElement);
    const zoomKey = (event: KeyboardEvent) => {
      if (!["+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      const offset = view.camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * (event.key === "-" ? 1.15 : 1 / 1.15), controls.minDistance, controls.maxDistance));
      view.camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    renderer.domElement.addEventListener("keydown", zoomKey);

    let placed = false;
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      const distance = view.frame(w / h);
      controls.minDistance = distance * 0.4;
      controls.maxDistance = distance * 2.2;
      // Só enquadra na primeira medida válida — resize depois disso não pode
      // jogar a câmera de volta e desfazer o giro do usuário.
      if (!placed) {
        view.place(distance);
        placed = true;
      }
      controls.update();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let raf = 0;
    let lastFrame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - lastFrame < 1000 / 30) return;
      const delta = Math.min(now - lastFrame, 100) / 1000;
      lastFrame = now;
      controls.update(delta);
      renderer.render(view.scene, view.camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("keydown", zoomKey);
      controls.dispose();
      view.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [kind, key]);

  if (!resolved) {
    return (
      <div className={className}>
        <p className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Sem preview 3D para esta opção.
        </p>
      </div>
    );
  }
  return <div ref={containerRef} className={className}>{error && <p role="status" className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">Prévia 3D indisponível neste dispositivo.</p>}</div>;
}
