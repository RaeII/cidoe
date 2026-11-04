import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createPreviewScene } from "@/scene/builders/createPreviewScene";
import { initFacadeTextureLoader, loadFacadeTextureSet, peekFacadeTextureSet, type FacadeTextureSet } from "@/scene/textures/facadeTextureLoader";
import type { BuildingCustomization, TextureSettings } from "@/scene/types";

type View = ReturnType<typeof createPreviewScene>;
type Runtime = {
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  view: View | null;
  appearance: BuildingCustomization | null;
  textureSettings: TextureSettings | null;
  texturesReady: boolean;
  renderNeeded: boolean;
  resize: (reset?: boolean) => void;
};

/** Um renderer por abertura; trocar itens atualiza somente o modelo. */
export function BuildingPreview({ customization, textureSettings }: {
  customization: BuildingCustomization;
  textureSettings: TextureSettings;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- falha do contexto externo vira feedback.
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    initFacadeTextureLoader(renderer);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    const controls = new OrbitControls(new THREE.PerspectiveCamera(), renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enableDamping = true;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 1;
    const runtime: Runtime = {
      renderer, controls, view: null, appearance: null, textureSettings: null, texturesReady: false, renderNeeded: true,
      resize(reset = false) {
        runtime.renderNeeded = true;
        const { clientWidth: width, clientHeight: height } = container;
        if (!width || !height || !runtime.view) return;
        renderer.setSize(width, height, false);
        const distance = runtime.view.frame(width / height);
        controls.minDistance = distance * 0.5;
        controls.maxDistance = distance * 1.8;
        controls.target.copy(runtime.view.center);
        if (reset) runtime.view.place(distance);
        controls.update();
      },
    };
    runtimeRef.current = runtime;
    const requestRender = () => { runtime.renderNeeded = true; };
    controls.addEventListener("change", requestRender);
    const observer = new ResizeObserver(() => runtime.resize());
    observer.observe(container);
    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; requestRender(); });
    intersection.observe(container);
    let raf = 0;
    let lastFrame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !visible || !runtime.view || now - lastFrame < 1000 / 30) return;
      const delta = Math.min(now - lastFrame, 100);
      lastFrame = now;
      controls.update(delta / 1000);
      if (!runtime.renderNeeded && !runtime.view.hasAnimation()) return;
      runtime.renderNeeded = false;
      runtime.view.tick(now / 1000, delta);
      renderer.render(runtime.view.scene, runtime.view.camera);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      runtime.view?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const previous = runtime.appearance;
    // Cor/tint/opacidade não recriam o modelo nem decodificam o GIF novamente.
    if (runtime.view && previous && runtime.textureSettings === textureSettings && runtime.texturesReady &&
      (["buildingShape", "rooftopType", "edgeLightType", "signText", "signSides", "textureKey", "tilingScale", "textureTransform", "hologramImage"] as const)
        .every((key) => previous[key] === customization[key])) {
      runtime.view.updateStyle(customization);
      runtime.renderNeeded = true;
      runtime.appearance = customization;
      return;
    }
    runtime.appearance = customization;
    runtime.textureSettings = textureSettings;
    let canceled = false;
    const show = (facadeTextures: FacadeTextureSet | null, topTextures: FacadeTextureSet | null, ready = true) => {
      if (canceled) return;
      const position = runtime.view?.camera.position.clone();
      const reset = !previous || previous.buildingShape !== customization.buildingShape || previous.rooftopType !== customization.rooftopType || previous.hologramImage !== customization.hologramImage;
      runtime.view?.dispose();
      const view = createPreviewScene({ kind: "shape", shape: customization.buildingShape }, {
        customization, facadeTextures, topTextures,
        onReady: () => { if (runtimeRef.current === runtime && runtime.view === view) runtime.resize(true); },
      });
      runtime.view = view;
      runtime.texturesReady = ready;
      if (position) view.camera.position.copy(position);
      runtime.controls.object = view.camera;
      runtime.resize(reset);
    };
    const textured = textureSettings.enabled && !textureSettings.clayRender;
    const facadeKey = customization.textureKey ?? textureSettings.textureKey;
    const facade = textured ? peekFacadeTextureSet(facadeKey) : null;
    const top = textured ? peekFacadeTextureSet("Concrete024_1K-JPG") : null;
    show(facade, top, !textured);
    // O cache pode estar parcial (a cena principal não usa todos os mapas da prévia).
    if (textured) {
      void Promise.all([
        loadFacadeTextureSet(facadeKey, 2, { displacement: false }),
        loadFacadeTextureSet("Concrete024_1K-JPG", 2, { displacement: false }),
      ]).then(([facade, top]) => show(facade, top));
    }
    return () => { canceled = true; };
  }, [customization, textureSettings]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-tinta">
      <div ref={containerRef} role="img" aria-label="Prévia 3D do seu edifício personalizado" className="size-full" />
      {error && <p role="status" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-papel">A prévia 3D não está disponível neste dispositivo. Você pode continuar personalizando.</p>}
      </div>
      {!error && <p className="shrink-0 text-center text-[11px] leading-4 text-muted-foreground">Arraste para girar</p>}
    </div>
  );
}
