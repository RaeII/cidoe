import * as THREE from "three";
import { createScenePreparer } from "./createScenePreparer";
import { createFocusRenderer } from "./createFocusRenderer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createGroundPlane } from "../builders/createGroundPlane";
import { createLightingRig } from "../builders/createLightingRig";
import { createTerrain } from "../builders/createTerrain";
import { loadEnvironment } from "../builders/loadEnvironment";
import { CITY_SCENE_CONFIG, DEFAULT_SCENE_STATS } from "../config/citySceneConfig";
import { NIGHT_PRESET } from "../config/environmentConfig";
import { TERRAIN_MAX_BUILDINGS } from "../config/terrainConfig";
import { createDonationManager } from "../managers/createDonationManager";
import type {
  BlockLayoutSettings,
  BuildingCustomization,
  BuildingSettings,
  CameraDebugInfo,
  EnvironmentSettings,
  GroundSettings,
  LightSettings,
  HorizonSettings,
  ReflectionSettings,
  SceneStats,
  TerrainSettings,
  TextureSettings,
} from "../types";
import { runDevAssertionsOnce } from "../utils/devAssertions";
import { IS_LOW_TIER, isSoftwareGL } from "../utils/deviceTier";

// Piso urbano mantém o cull separado dos edifícios. Relevo não usa cull de distância.
const CITY_FLOOR_CULL_SPAN = 1.8;

// Cede a main thread: o resto roda numa tarefa nova (Lighthouse mede tarefa por tarefa).
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
// Depois do próximo frame: o layout do commit do React já saiu e ler clientWidth não força
// reflow da página inteira dentro da nossa tarefa. Aba oculta espera ficar visível.
const afterNextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

type CitySceneRuntimeOptions = {
  mount: HTMLDivElement;
  buildingSettings: BuildingSettings;
  textureSettings: TextureSettings;
  groundSettings: GroundSettings;
  terrainSettings: TerrainSettings;
  lightSettings: LightSettings;
  horizonSettings: HorizonSettings;
  environmentSettings: EnvironmentSettings;
  reflectionSettings: ReflectionSettings;
  blockLayoutSettings: BlockLayoutSettings;
  onStatsChange: (stats: SceneStats) => void;
  onCameraDebugChange?: (cameraInfo: CameraDebugInfo) => void;
  onHoverChange?: (value: number | null, x: number, y: number) => void;
  onBuildingClick?: (donationId: number | null) => void;
};

export type CitySceneRuntime = {
  updateBuildingSettings: (settings: BuildingSettings) => void;
  updateTextureSettings: (settings: TextureSettings) => void;
  updateGroundSettings: (settings: GroundSettings) => void;
  updateTerrainSettings: (settings: TerrainSettings) => void;
  updateLightSettings: (settings: LightSettings) => void;
  updateHorizonSettings: (settings: HorizonSettings) => void;
  updateEnvironmentSettings: (settings: EnvironmentSettings) => void;
  updateReflectionSettings: (settings: ReflectionSettings) => void;
  updateBlockLayout: (settings: BlockLayoutSettings) => void;
  /** 0 = sem granulado (resolução nativa travada). >0 libera o downscale por FPS. */
  setGrain: (grain: number) => void;
  addDonation: (value: number) => void;
  addDonations: (values: number[]) => void;
  setDonations: (entries: ReadonlyArray<{ id: number; value: number }>) => void;
  updateDonationCustomization: (donationId: number, customization: BuildingCustomization) => void;
  /** Texturas sorteáveis por edifício (values do catálogo). Vazio = textura global em tudo. */
  setFacadeTexturePool: (keys: readonly string[]) => void;
  focusOnDonation: (donationId: number) => void;
  clearFocus: () => void;
  dispose: () => void;
};

/**
 * Cria a cena em etapas, cedendo a main thread entre elas (contexto WebGL | céu, luz,
 * chão e relevo | doações | resto): síncrono era uma tarefa de ~40 ms no M4 dentro do
 * commit do React (~170 ms no Lighthouse mobile). Rejeita sem WebGL ou com WebGL por
 * software — o hook trata como "cena indisponível".
 */
export async function createCitySceneRuntime({
  mount,
  buildingSettings,
  textureSettings,
  groundSettings,
  terrainSettings,
  lightSettings,
  horizonSettings,
  environmentSettings,
  reflectionSettings,
  blockLayoutSettings,
  onStatsChange,
  onCameraDebugChange,
  onHoverChange,
  onBuildingClick,
}: CitySceneRuntimeOptions): Promise<CitySceneRuntime> {
  runDevAssertionsOnce();
  await afterNextFrame();

  let currentStats: SceneStats = { ...DEFAULT_SCENE_STATS };
  const emitStatsPatch = (patch: Partial<SceneStats>) => {
    const nextStats = { ...currentStats, ...patch };
    if (
      nextStats.buildings === currentStats.buildings &&
      nextStats.culled === currentStats.culled &&
      nextStats.fpsMode === currentStats.fpsMode &&
      nextStats.chunks === currentStats.chunks &&
      nextStats.sceneReady === currentStats.sceneReady &&
      nextStats.performance === currentStats.performance
    ) return;
    currentStats = nextStats;
    onStatsChange(currentStats);
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CITY_SCENE_CONFIG.sceneBackground);
  scene.fog = new THREE.FogExp2(
    horizonSettings.fogColor,
    horizonSettings.fogDensity,
  );

  const camera = new THREE.PerspectiveCamera(
    CITY_SCENE_CONFIG.cameraFov,
    mount.clientWidth / mount.clientHeight,
    CITY_SCENE_CONFIG.cameraNear,
    horizonSettings.renderDistance,
  );
  camera.position.set(
    CITY_SCENE_CONFIG.initialCameraPosition.x,
    CITY_SCENE_CONFIG.initialCameraPosition.y,
    CITY_SCENE_CONFIG.initialCameraPosition.z,
  );

  // Modo leve (celular/máquina modesta): sem MSAA (atributo do contexto, decidido antes
  // de criar), DPR 1,5 e sem cube camera — reflexo vem do scene.environment (HDRI).
  const lite = IS_LOW_TIER;
  const renderer = new THREE.WebGLRenderer({
    antialias: !lite,
    powerPreference: "high-performance",
  });
  if (isSoftwareGL(renderer.getContext())) {
    // Sem GPU cada shader PBR trava a main thread por segundos (profile SwiftShader: 7 s e
    // 17 s numa tarefa). Mesmo caminho do "sem WebGL": o hook captura e libera o loading.
    renderer.dispose();
    renderer.forceContextLoss();
    throw new Error("WebGL por software");
  }
  // Checagem de erro de shader = getProgramInfoLog/getShaderInfoLog síncronos por programa.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.info.autoReset = false;
  // Opacos de frente pra trás ANTES do material. O padrão do three ordena por material.id
  // primeiro; com um clone de material por prédio custom a profundidade virava sorteio e a
  // GPU pintava fachada PBR que depois era coberta. Mesmo objeto (empate em z) mantém a ordem
  // por material de antes. Adreno 618, visão inicial: 106 → 92 ms/frame.
  renderer.setOpaqueSort((a, b) =>
    a.groupOrder - b.groupOrder ||
    a.renderOrder - b.renderOrder ||
    a.z - b.z ||
    a.material.id - b.material.id ||
    a.materialVariant - b.materialVariant ||
    a.id - b.id);

  let renderScale = 1;
  // Piso da escala dinâmica. 1 = downscale desligado (sem granulado), o padrão.
  let renderScaleFloor = CITY_SCENE_CONFIG.minRenderScale;
  const dprCap = lite ? CITY_SCENE_CONFIG.liteDprCap : CITY_SCENE_CONFIG.dprCap;
  const targetFps = lite ? CITY_SCENE_CONFIG.liteFps : CITY_SCENE_CONFIG.targetFps;
  const getPixelRatio = () => Math.min(window.devicePixelRatio || 1, dprCap) * renderScale;

  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CITY_SCENE_CONFIG.controls.dampingFactor;
  controls.rotateSpeed = CITY_SCENE_CONFIG.controls.rotateSpeed;
  controls.zoomSpeed = CITY_SCENE_CONFIG.controls.zoomSpeed;
  controls.panSpeed = CITY_SCENE_CONFIG.controls.panSpeed;
  controls.minDistance = CITY_SCENE_CONFIG.controls.minDistance;
  controls.maxDistance = CITY_SCENE_CONFIG.controls.maxDistance;
  controls.maxPolarAngle = CITY_SCENE_CONFIG.controls.maxPolarAngle;
  controls.target.set(
    CITY_SCENE_CONFIG.controlTarget.x,
    CITY_SCENE_CONFIG.controlTarget.y,
    CITY_SCENE_CONFIG.controlTarget.z,
  );
  controls.update();
  await yieldToMain();

  let loadedEnvMap: THREE.Texture | null = null;
  let loadedBgTexture: THREE.Texture | null = null;
  let isDisposed = false;

  // EnvMap dos prédios só é recapturado quando a CENA muda. Órbita não suja o cube: probe é
  // estático (ver envProbePosition), então girar a câmera daria captura idêntica — o reflexo
  // varia sozinho pelo reflect() no shader.
  let cubeDirty = true;
  const cubeCaptureDebounceMs = 180;
  let cubeDirtyAt = performance.now() - cubeCaptureDebounceMs;

  // Render sob demanda: frame só sai quando algo mudou (câmera, cena, asset, holograma).
  // Cena parada = main thread livre (TBT/INP) e GPU/bateria em repouso no celular.
  let renderNeeded = true;
  const requestRender = () => {
    renderNeeded = true;
  };
  // Cull de distância pendente: câmera andou ou rebuild deixou tudo visível de novo.
  let cullPending = true;
  // Programa novo (objeto novo, textura que liga define, HDRI) compila ANTES do frame que
  // o usa — ver runCompilePass.
  let compileRequested = true;
  const requestCompile = () => {
    compileRequested = true;
    renderNeeded = true;
  };
  // HDRI resolvido: carregou ou falhou (falha não pode prender o loading da página).
  let envLoaded = false;
  // Algum arquivo do manager default ainda baixando (HDRI, fachadas, topo, normais).
  let assetsLoading = false;
  // setDonations/addDonation já chegou ao menos uma vez (cidade vazia não é "pronta").
  let donationsReceived = false;

  // Toda mudança de cena passa aqui: suja o cube, pede frame e refaz o cull (rebuild de
  // instâncias volta tudo a visível).
  const markCubeDirty = () => {
    cubeDirty = true;
    cubeDirtyAt = performance.now();
    renderNeeded = true;
    cullPending = true;
  };

  // Asset assíncrono que chega DEPOIS da primeira captura tem que sujar o cube. Sem isso o
  // HDRI (fetch + decode de um JPG 4K) entra na cena bem depois do frame 4 e o reflexo fica
  // sem céu até alguma outra mudança — antes a órbita escondia o problema recapturando sempre.
  // onLoad do manager default cobre TextureLoader/ImageBitmapLoader (HDRI, fachadas) e KTX2Loader.
  // onStart derruba sceneReady na hora (síncrono): o editor lê isso antes de liberar o loading.
  // Manager é global: runtime descartado (StrictMode, remount) só limpa se ainda for o dono.
  const handleLoadStart = () => {
    assetsLoading = true;
    emitStatsPatch({ sceneReady: false });
  };
  const handleLoadEnd = () => {
    assetsLoading = false;
    markCubeDirty();
  };
  // Cada arquivo que chega pode ligar um define (map, normalMap…) num material → programa novo.
  const handleLoadProgress = (_url: string, loaded: number, total: number) => {
    assetsLoading = loaded < total;
    requestCompile();
  };
  THREE.DefaultLoadingManager.onStart = handleLoadStart;
  THREE.DefaultLoadingManager.onLoad = handleLoadEnd;
  THREE.DefaultLoadingManager.onProgress = handleLoadProgress;
  // Objeto novo na cena (prédio custom, letreiro, luz do LED, grupo instanciado realocado).
  scene.addEventListener("childadded", requestCompile);
  scene.addEventListener("childremoved", requestCompile);

  const environmentUpdater = loadEnvironment(
    scene,
    renderer,
    environmentSettings,
    horizonSettings.renderDistance,
    (envMap, bgTexture) => {
      loadedEnvMap = envMap;
      loadedBgTexture = bgTexture;
      envLoaded = true;
      // scene.environment liga envMap em todo material PBR: todos os programas mudam.
      requestCompile();
      markCubeDirty();
    },
    () => isDisposed,
    () => {
      envLoaded = true;
      requestRender();
    },
  );

  const lightingRig = createLightingRig(scene, lightSettings);
  const groundPlane = createGroundPlane(
    scene,
    groundSettings,
    horizonSettings,
  );
  const terrainRig = createTerrain(scene, terrainSettings, groundSettings.color);
  await yieldToMain();
  // Plano cinza é o CHÃO INFINITO: sempre visível, segue a câmera (ver animate) e fica abaixo do
  // relevo. Onde há relevo, o terreno cobre; além da borda do relevo (mesh fixo na origem), este
  // plano preenche o vazio → sem limite ao mover a câmera numa cidade grande.

  // Probe de reflexo. Tudo (resolução, posição, intervalo, o que entra na captura) vem de
  // ReflectionSettings — ver aba "reflexo" do painel e [[scene-config#reflectionConfig.ts]].
  //
  // Probe ancorado na CIDADE por padrão, não na câmera: com o probe na câmera, olhar o prédio
  // de frente amostrava a direção que sai da câmera (céu/chão vazio atrás dela) → "sem
  // reflexo"; e o conteúdo do cube escorregava junto com a órbita → reflexo só "aparecia" em
  // certo ângulo. Ancorado, o reflexo mostra a cidade em qualquer ângulo e fica estável.
  //
  // skyDrop desce a faixa de céu só na captura (0.2 de offset UV = ~36°): olhar o prédio de
  // frente com a câmera acima espelha pra BAIXO do horizonte, faixa onde o HDRI só tem cinza
  // chapado — parecia "sem reflexo". Com o céu descido, azul/nuvens caem nessa direção.
  let currentReflection = reflectionSettings;
  let currentEnvironment = environmentSettings;
  const envProbePosition = new THREE.Vector3();

  // Modo noite. Céu escuro + estrelas ficam no environmentUpdater; aqui a parte de CENA:
  // ambiente vira luar, IBL do HDRI diurno perde peso, névoa e silhueta escurecem.
  // Reaplicar sempre que luz, horizonte ou ambiente mudarem — senão o valor "de dia"
  // volta por cima (lightingRig.update parte sempre dos settings do painel).
  let currentLight = lightSettings;
  let currentHorizon = horizonSettings;

  const applyNightMode = () => {
    const night = currentEnvironment.night;
    const metrics = lightingRig.update(currentLight);
    if (night) {
      lightingRig.ambient.color.set(NIGHT_PRESET.ambientColor);
      lightingRig.ambient.intensity = metrics.ambientTotal * NIGHT_PRESET.ambientScale;
    }
    scene.environmentIntensity = night ? NIGHT_PRESET.environmentIntensity : 1;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(night ? NIGHT_PRESET.fogColor : currentHorizon.fogColor);
    }
    donationManager.setNight(night, currentEnvironment.windowIntensity);
  };

  const createCubeProbe = (resolution: number) => {
    const target = new THREE.WebGLCubeRenderTarget(resolution, {
      type: THREE.HalfFloatType,
      // MeshPhysicalMaterial converte este cube para PMREM; mipmap nativo seria
      // outra filtragem da mesma captura e não é amostrado diretamente.
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
    });
    // Mesmo near da câmera: com followCamera o probe está no ponto de vista e recaptura ao andar.
    const cubeCamera = new THREE.CubeCamera(CITY_SCENE_CONFIG.cameraNear, CITY_SCENE_CONFIG.reflectionFar, target);
    for (const face of cubeCamera.children) { face.layers.enable(1); face.layers.enable(2); }
    scene.add(cubeCamera);
    return { target, cubeCamera };
  };

  let { target: buildingCubeTarget, cubeCamera: buildingCubeCamera } = createCubeProbe(
    reflectionSettings.resolution,
  );

  const focusRenderer = createFocusRenderer(renderer, scene, camera);
  if (focusRenderer.supported) { camera.layers.enable(1); camera.layers.enable(2); }
  const donationManager = createDonationManager({
    scene,
    renderer,
    buildingSettings,
    textureSettings,
    blockLayoutSettings,
    compositeFocus: focusRenderer.supported,
  });
  await yieldToMain();
  // Modo leve não captura cube (6 renders da cidade + PMREM por captura): fachada usa o
  // scene.environment. Reflexo da cidade vira reflexo do céu.
  const cubeAllowed = !lite;
  const cubeActive = () => cubeAllowed && currentReflection.enabled;
  donationManager.setEnvMap(cubeActive() ? buildingCubeTarget.texture : null);
  donationManager.setEnvMapRotation(reflectionSettings.envRotY);
  donationManager.setEnvHorizon(reflectionSettings.envHorizon);
  donationManager.setReflectionDistanceRange(
    reflectionSettings.reflectionDistanceStart,
    reflectionSettings.reflectionDistanceEnd,
  );
  // Chão da cidade usa alcance próprio; edifícios seguem distance/backDistance.
  const cityFloorCullRadius = () => currentHorizon.renderDistance * CITY_FLOOR_CULL_SPAN;
  donationManager.setRenderDistance(
    horizonSettings.distance,
    horizonSettings.backDistance,
    cityFloorCullRadius(),
  );
  // Depois do manager: applyNightMode acende as janelas e ajusta o reflexo da fachada.
  applyNightMode();
  terrainRig.setCityRadius(donationManager.getCityRadius());

  // Reabre a zona plana do relevo quando a cidade cresce. Cheap: setCityRadius
  // só recalcula a malha quando o raio muda (ganho de anel).
  // Acima de TERRAIN_MAX_BUILDINGS o relevo some: a cidade já passou da borda da malha e
  // o painel perde a palavra final (currentTerrain guarda o que o usuário pediu).
  let currentTerrain = terrainSettings;
  const terrainEnabled = () =>
    currentTerrain.enabled && donationManager.getDonationCount() <= TERRAIN_MAX_BUILDINGS;
  const syncTerrainToCity = () => {
    terrainRig.setCityRadius(donationManager.getCityRadius());
    terrainRig.mesh.visible = terrainEnabled();
  };

  // A malha é fixa na origem. O far precisa conter seu bounding sphere inteiro:
  // um corte curto acompanhando a câmera fazia as colinas parecerem encolher.
  const updateCameraFar = () => {
    const bounds = terrainRig.mesh.geometry.boundingSphere;
    const terrainFar = terrainRig.mesh.visible && bounds
      ? camera.position.distanceTo(bounds.center) + bounds.radius + 1
      : 0;
    const far = Math.max(currentHorizon.renderDistance, terrainFar);
    if (camera.far === far) return false;
    camera.far = far;
    camera.updateProjectionMatrix();
    return true;
  };

  // Hover: raycast com throttle por RAF para não impactar o loop de animação
  let pendingHoverEvent: MouseEvent | null = null;
  let hoverRafId: number | null = null;
  const handleMouseMove = onHoverChange
    ? (event: MouseEvent) => {
        pendingHoverEvent = event;
        if (hoverRafId === null) {
          hoverRafId = requestAnimationFrame(() => {
            if (pendingHoverEvent) {
              const value = donationManager.getHoveredValue(
                pendingHoverEvent,
                camera,
                renderer.domElement,
              );
              onHoverChange(value, pendingHoverEvent.clientX, pendingHoverEvent.clientY);
              pendingHoverEvent = null;
            }
            hoverRafId = null;
          });
        }
      }
    : null;
  if (handleMouseMove) renderer.domElement.addEventListener("mousemove", handleMouseMove);
  const handleMouseLeave = onHoverChange
    ? () => {
        pendingHoverEvent = null;
        onHoverChange(null, 0, 0);
      }
    : null;
  if (handleMouseLeave) renderer.domElement.addEventListener("mouseleave", handleMouseLeave);

  // Clique: detectar edifício clicado (só dispara se não houve drag)
  let pointerDownPos: { id: number; x: number; y: number } | null = null;
  const cancelClick = () => { pointerDownPos = null; };
  const handlePointerDown = (event: PointerEvent) => {
    pointerDownPos = event.isPrimary === false ? null : { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!pointerDownPos || event.pointerId !== pointerDownPos.id) return;
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    if (dx * dx + dy * dy > 25) cancelClick();
  };
  const handlePointerUp = onBuildingClick
    ? (event: PointerEvent) => {
        const down = pointerDownPos;
        cancelClick();
        if (!down || event.pointerId !== down.id) return;
        const dx = event.clientX - down.x;
        const dy = event.clientY - down.y;
        // Ignorar se moveu mais de 5px (drag da câmera)
        if (dx * dx + dy * dy > 25) return;
        const donationId = donationManager.getClickedDonationId(
          event as unknown as MouseEvent,
          camera,
          renderer.domElement,
        );
        onBuildingClick(donationId);
      }
    : null;
  if (onBuildingClick) {
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointercancel", cancelClick);
  }
  if (handlePointerUp) renderer.domElement.addEventListener("pointerup", handlePointerUp);

  // --- Animação de foco na câmera ---
  let cameraAnim: {
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPos: THREE.Vector3;
    endTarget: THREE.Vector3;
    progress: number;
    duration: number;
  } | null = null;

  // Salvar posição da câmera antes do foco para restaurar
  let savedCameraPos: THREE.Vector3 | null = null;
  let savedCameraTarget: THREE.Vector3 | null = null;
  // Um gesto do usuário assume a câmera; a interpolação não pode puxá-la de volta.
  const cancelCameraAnimation = () => { cameraAnim = null; };
  controls.addEventListener("start", cancelCameraAnimation);

  let animationId = 0;
  let lastTime = performance.now();
  let fpsAccumulator = 0;
  let frames = 0;
  let metricsAccumulator = 0;
  let metricsFrames = 0;
  let smoothedFps = 60;
  let cubeFrameCounter = 0;
  let cameraDebugAccumulator = 0;
  let skipNextFpsSample = false;
  let lastResolutionChangeAt = -Infinity;
  const cullForward = new THREE.Vector3();
  const viewFrustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  // Posição da última captura do cube: probe na câmera só recaptura se a câmera andou.
  const lastCapturePos = new THREE.Vector3(Infinity, Infinity, Infinity);

  // Fatia de trabalho na main thread por tarefa. Lighthouse mobile multiplica a CPU por 4:
  // 4 ms aqui ≈ 16 ms lá, longe dos 50 ms de tarefa longa.
  const SLICE_MS = 4;

  const scenePreparer = createScenePreparer(renderer, scene);
  let compiling = false;
  const runCompilePass = async () => {
    compileRequested = false;
    compiling = true;
    try {
      await scenePreparer.prepare(camera, cubeActive() ? buildingCubeTarget : null,
        buildingCubeCamera.children[0] as THREE.Camera, () => isDisposed, focusRenderer.target);
    } finally {
      compiling = false;
      renderNeeded = true;
    }
  };

  // CitySceneEditor reaplica todas as customizações logo depois de setDonations (~200
  // chamadas: rebuild de instâncias, malha de formato, letreiro). Síncrono = ~420 ms numa
  // tarefa só no profile. Fila por id (a última vence) drenada em fatias de SLICE_MS:
  // 1) aplica customizações com o rebuild adiado (um rebuild só no fim da rajada, não um
  //    por transição de formato); 2) cria as malhas de formato em fatias (pumpCustomShapes).
  const pendingCustomizations = new Map<number, BuildingCustomization>();
  let customizationTimer = 0;
  let shapesPending = false;
  const drainCustomizations = () => {
    customizationTimer = 0;
    const deadline = performance.now() + SLICE_MS;
    if (pendingCustomizations.size > 0) {
      donationManager.setRebuildDeferred(true);
      for (const [donationId, customization] of pendingCustomizations) {
        pendingCustomizations.delete(donationId);
        donationManager.updateDonationCustomization(donationId, customization);
        if (performance.now() > deadline) break;
      }
      if (pendingCustomizations.size === 0) {
        donationManager.setRebuildDeferred(false);
        shapesPending = true;
      }
    } else {
      shapesPending = donationManager.pumpCustomShapes(SLICE_MS);
    }
    markCubeDirty();
    if (pendingCustomizations.size > 0 || shapesPending) {
      customizationTimer = window.setTimeout(drainCustomizations, 0);
    }
  };

  const updateDynamicResolution = (fps: number, time: number) => {
    if (time - lastResolutionChangeAt < 1500) return;
    const previousScale = renderScale;
    if (fps < targetFps - 8) {
      renderScale = Math.max(renderScaleFloor, renderScale - 0.05);
    } else if (fps > targetFps + 1) {
      renderScale = Math.min(CITY_SCENE_CONFIG.maxRenderScale, renderScale + 0.025);
    }
    if (previousScale !== renderScale) {
      lastResolutionChangeAt = time;
      renderer.setPixelRatio(getPixelRatio());
      renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    }
  };

  // Frame anterior foi desenhado? FPS só é amostrado entre frames desenhados seguidos —
  // com render sob demanda o intervalo ocioso não é lentidão.
  let renderedLastTick = false;

  // "change" e não o retorno do update() do loop: zoom (roda/pinça) é aplicado inteiro no
  // update() do próprio handler do evento — o do loop devolve false e o frame não saía
  // (câmera andava sem redesenhar e "teleportava" no próximo frame pedido por outra coisa).
  const handleControlsChange = () => {
    renderNeeded = true;
    cullPending = true;
  };
  controls.addEventListener("change", handleControlsChange);

  let canvasVisible = true;
  const canRender = () => canvasVisible && !document.hidden;

  const animate = (time: number) => {
    animationId = 0;
    if (!canRender()) return;
    animationId = requestAnimationFrame(animate);
    const elapsed = Math.max(0, (time - lastTime) / 1000);
    const delta = Math.min(elapsed, 0.05);
    lastTime = time;

    // O fator base é de 60 Hz; tempo real mantém a mesma inércia em outras frequências.
    controls.dampingFactor = 1 - (1 - CITY_SCENE_CONFIG.controls.dampingFactor) ** (elapsed * 60);
    controls.update();

    // Interpolar câmera durante animação de foco
    if (cameraAnim && !compileRequested && !compiling && pendingCustomizations.size === 0 && !shapesPending) {
      renderNeeded = true;
      cullPending = true;
      cameraAnim.progress = Math.min(1, cameraAnim.progress + delta / cameraAnim.duration);
      // Ease-out cubic
      const t = 1 - Math.pow(1 - cameraAnim.progress, 3);
      camera.position.lerpVectors(cameraAnim.startPos, cameraAnim.endPos, t);
      controls.target.lerpVectors(cameraAnim.startTarget, cameraAnim.endTarget, t);
      controls.update();
      if (cameraAnim.progress >= 1) {
        cameraAnim = null;
      }
    }

    // O frustum precisa acompanhar cada movimento: throttle deixaria buracos ao girar.
    if (updateCameraFar()) cullPending = true;
    if (cullPending) {
      cullPending = false;
      renderNeeded = true;
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      viewFrustum.setFromProjectionMatrix(viewProjection);
      const culled = donationManager.updateDistanceCulling(
        camera.position,
        camera.getWorldDirection(cullForward),
        viewFrustum,
      );
      // O probe fixo recompõe a cidade completa; cull só atualiza UI/render principal.
      if (culled !== currentStats.culled) {
        emitStatsPatch({ culled });
      }
    }

    // Fila de customização drenando: objetos novos chegam a cada fatia. Compila e desenha
    // uma vez no fim, não a cada fatia.
    const draining = pendingCustomizations.size > 0 || shapesPending;
    if (compileRequested && !compiling && !draining) void runCompilePass();
    // Nada mudou, ou shader ainda compilando: o canvas segura o último frame.
    if (!renderNeeded || compiling || draining) {
      renderedLastTick = false;
      return;
    }
    renderNeeded = false;
    const consecutiveFrame = renderedLastTick;
    if (!renderedLastTick) skipNextFpsSample = true;
    renderedLastTick = true;

    donationManager.setReflectionRoughnessFloor(
      currentReflection.enabled
        ? THREE.MathUtils.smoothstep(
            camera.position.y - groundPlane.mesh.position.y,
            currentReflection.heightFadeStart,
            currentReflection.heightFadeEnd,
          ) * currentReflection.heightBlur
        : 0,
    );
    groundPlane.updateCamera(camera);
    environmentUpdater.updatePosition(camera.position.x, camera.position.y, camera.position.z);

    if (onCameraDebugChange) {
      cameraDebugAccumulator += delta;
      if (cameraDebugAccumulator >= 0.2) {
        cameraDebugAccumulator = 0;
        onCameraDebugChange({
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z,
          },
        });
      }
    }

    if (skipNextFpsSample) {
      skipNextFpsSample = false;
    } else {
      fpsAccumulator += elapsed;
      frames += 1;
    }
    if (fpsAccumulator >= 0.5 && frames > 0) {
      const currentFps = frames / fpsAccumulator;
      smoothedFps = smoothedFps * 0.72 + currentFps * 0.28;
      updateDynamicResolution(smoothedFps, time);
      fpsAccumulator = 0;
      frames = 0;
    }
    // Diagnóstico inclui o custo de capturas; somente o scaler filtra esse evento esporádico.
    let sampledFps: number | null = null;
    if (consecutiveFrame) {
      metricsAccumulator += elapsed;
      metricsFrames++;
      if (metricsAccumulator >= 0.5) {
        sampledFps = metricsFrames / metricsAccumulator;
        metricsAccumulator = 0;
        metricsFrames = 0;
      }
    } else {
      metricsAccumulator = 0;
      metricsFrames = 0;
    }
    renderer.info.reset();

    // Captura no máximo a cada updateInterval frames, e só quando muda algo que ela vê: cena
    // (cubeDirty, com debounce) ou, com probe na câmera, a posição da câmera. Câmera parada
    // = captura idêntica → não paga 6 renders + PMREM (eram 15–20 ms a cada 4 frames).
    // continuous sem followCamera segue recapturando a cada intervalo nos frames desenhados.
    cubeFrameCounter = (cubeFrameCounter + 1) % Math.max(1, Math.round(currentReflection.updateInterval));
    const cameraMovedSinceCapture = () =>
      currentReflection.followCamera && camera.position.distanceToSquared(lastCapturePos) > 1e-6;
    if (
      cubeActive() &&
      cubeFrameCounter === 0 &&
      (
        cameraMovedSinceCapture() ||
        (currentReflection.continuous && !currentReflection.followCamera) ||
        (cubeDirty && time - cubeDirtyAt >= cubeCaptureDebounceMs)
      )
    ) {
      cubeDirty = false;
      lastCapturePos.copy(camera.position);
      if (currentReflection.followCamera) {
        envProbePosition.copy(camera.position);
      } else {
        envProbePosition.set(
          currentReflection.probeX,
          currentReflection.probeY,
          currentReflection.probeZ,
        );
      }
      buildingCubeCamera.position.copy(envProbePosition);
      // Céu segue a câmera no render normal — na captura tem que seguir o PROBE, senão a
      // esfera (raio 200) fica deslocada ou até atrás dele.
      environmentUpdater.updatePosition(
        envProbePosition.x,
        envProbePosition.y,
        envProbePosition.z,
      );
      environmentUpdater.updateSettings({
        ...currentEnvironment,
        offsetY: currentEnvironment.offsetY + currentReflection.skyDrop,
      });
      donationManager.beginEnvCapture(currentReflection.includeCityFloor);
      // Quando excluídos pelo controle de reflexo, relevo e plano cinza deixam o hemisfério
      // de baixo do cube livre para o céu (ver skyDrop).
      const terrainWasVisible = terrainRig.mesh.visible;
      const groundWasVisible = groundPlane.mesh.visible;
      if (!currentReflection.includeGround) {
        terrainRig.mesh.visible = false;
        groundPlane.mesh.visible = false;
      }
      // Estrelas fora do reflexo: sizeAttenuation off → o mesmo tamanho em px de um cube
      // pequeno vira mancha gigante na fachada. O updateSettings abaixo as devolve.
      environmentUpdater.setStarsVisible(false);
      buildingCubeCamera.update(renderer, scene);
      // O custo da captura/PMREM aparece no delta do próximo rAF; não deixar um
      // evento esporádico reduzir permanentemente a resolução principal.
      skipNextFpsSample = true;
      terrainRig.mesh.visible = terrainWasVisible;
      groundPlane.mesh.visible = groundWasVisible;
      donationManager.endEnvCapture();
      // Devolve o céu pra câmera antes do render principal deste frame.
      environmentUpdater.updateSettings(currentEnvironment);
      environmentUpdater.updatePosition(camera.position.x, camera.position.y, camera.position.z);
    }

    // Captura pendente (debounce, intervalo, câmera que parou entre capturas) segura o loop.
    if (cubeActive() && (cubeDirty || cameraMovedSinceCapture())) renderNeeded = true;

    // Holograma visível anima: loop continua.
    if (donationManager.tickAnimations(time / 1000, elapsed * 1000)) renderNeeded = true;

    focusRenderer.render(donationManager.hasFocusedDonation());
    if (sampledFps !== null) {
      emitStatsPatch({ performance: {
        fps: sampledFps,
        frameTimeMs: 1000 / sampledFps,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      } });
    }
    // Sinal pro loading da página sair: frame com céu, shaders prontos, cidade recebida, fila
    // de customização vazia (gate acima) e nenhuma textura baixando. Volta a false no onStart.
    if (envLoaded && donationsReceived && !assetsLoading) emitStatsPatch({ sceneReady: true });
  };

  // 1º frame no próximo rAF, não dentro do effect de mount.
  animationId = requestAnimationFrame(animate);

  const handleVisibility = () => {
    if (!canRender()) {
      cancelAnimationFrame(animationId);
      animationId = 0;
      return;
    }
    lastTime = performance.now();
    renderedLastTick = false;
    fpsAccumulator = 0;
    frames = 0;
    metricsAccumulator = 0;
    metricsFrames = 0;
    cullPending = true;
    requestRender();
    if (!animationId) animationId = requestAnimationFrame(animate);
  };
  const intersection = new IntersectionObserver(([entry]) => {
    canvasVisible = entry.isIntersecting;
    handleVisibility();
  });
  intersection.observe(mount);
  document.addEventListener("visibilitychange", handleVisibility);

  const handleResize = () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    requestRender();
    cullPending = true;
  };

  window.addEventListener("resize", handleResize);

  return {
    updateBuildingSettings(settings) {
      donationManager.updateBuildingSettings(settings);
      markCubeDirty();
    },
    updateTextureSettings(settings) {
      donationManager.updateTextureSettings(settings);
      // Set já em cache aplica mapas na hora, sem passar pelo loader: defines mudam aqui.
      requestCompile();
      markCubeDirty();
    },
    setFacadeTexturePool(keys) {
      donationManager.setFacadeTexturePool(keys);
      requestCompile();
      markCubeDirty();
    },
    updateGroundSettings(settings) {
      groundPlane.update(settings);
      // Zona plana do relevo = chão da cidade: mantém a mesma cor.
      terrainRig.setGroundColor(settings.color);
      markCubeDirty();
    },
    updateTerrainSettings(settings) {
      currentTerrain = settings;
      // update() reaproveita o cityRadius retido pelo rig — relevo e zona plana juntos.
      terrainRig.update({ ...settings, enabled: terrainEnabled() });
      // Plano cinza continua sempre visível (chão infinito abaixo do relevo).
      markCubeDirty();
    },
    updateLightSettings(settings) {
      currentLight = settings;
      applyNightMode();
      markCubeDirty();
    },
    updateHorizonSettings(settings) {
      currentHorizon = settings;
      // Edifícios e piso urbano mantêm seus alcances; relevo permanece inteiro.
      donationManager.setRenderDistance(settings.distance, settings.backDistance, cityFloorCullRadius());
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = settings.fogDensity;
      }
      // Horizonte é o mínimo do far; colinas visíveis não podem ser truncadas.
      updateCameraFar();
      environmentUpdater.setRadius(settings.renderDistance);
      // Chão tem alcance próprio (groundDistance): o slider entra por aqui junto do horizonte.
      groundPlane.updateHorizon(settings);
      // Cor da névoa sai daqui: no modo noite ganha override.
      applyNightMode();
      markCubeDirty();
    },
    updateBlockLayout(settings) {
      donationManager.updateBlockLayout(settings);
      syncTerrainToCity();
      markCubeDirty();
    },
    setGrain(grain) {
      // grain 0..1 -> piso 1..0.5. Em 0 o piso é 1: updateDynamicResolution nunca desce.
      renderScaleFloor = 1 - Math.min(Math.max(grain, 0), 1) * 0.5;
      if (renderScale < renderScaleFloor) {
        // Subir na hora, senão a imagem fica granulada até o FPS se recuperar sozinho.
        renderScale = renderScaleFloor;
        lastResolutionChangeAt = performance.now();
        renderer.setPixelRatio(getPixelRatio());
        renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      }
      requestRender();
    },
    updateEnvironmentSettings(settings) {
      // Noite liga/desliga as luzes do LED: nº de luzes muda todos os programas.
      if (settings.night !== currentEnvironment.night) requestCompile();
      currentEnvironment = settings;
      environmentUpdater.updateSettings(settings);
      applyNightMode();
      markCubeDirty();
    },
    updateReflectionSettings(settings) {
      const resolutionChanged = settings.resolution !== currentReflection.resolution;
      const enabledChanged = settings.enabled !== currentReflection.enabled;
      const captureChanged =
        resolutionChanged ||
        enabledChanged ||
        settings.probeX !== currentReflection.probeX ||
        settings.probeY !== currentReflection.probeY ||
        settings.probeZ !== currentReflection.probeZ ||
        settings.followCamera !== currentReflection.followCamera ||
        settings.skyDrop !== currentReflection.skyDrop ||
        settings.includeGround !== currentReflection.includeGround ||
        settings.includeCityFloor !== currentReflection.includeCityFloor;
      currentReflection = settings;
      // Resolução do cube é imutável no target: trocar exige recriar target + CubeCamera e
      // reapontar o envMap das fachadas.
      if (resolutionChanged) {
        scene.remove(buildingCubeCamera);
        buildingCubeTarget.dispose();
        const probe = createCubeProbe(settings.resolution);
        buildingCubeTarget = probe.target;
        buildingCubeCamera = probe.cubeCamera;
      }
      if (resolutionChanged || enabledChanged) {
        donationManager.setEnvMap(cubeActive() ? buildingCubeTarget.texture : null);
        requestCompile();
      }
      // Direção só muda a amostragem no material — não invalida a captura.
      donationManager.setEnvMapRotation(settings.envRotY);
      donationManager.setEnvHorizon(settings.envHorizon);
      donationManager.setReflectionDistanceRange(
        settings.reflectionDistanceStart,
        settings.reflectionDistanceEnd,
      );
      if (captureChanged) markCubeDirty();
      requestRender();
    },

    addDonation(value) {
      donationsReceived = true;
      donationManager.addDonation(value);
      syncTerrainToCity();
      emitStatsPatch({ buildings: donationManager.getDonationCount() });
      markCubeDirty();
    },
    addDonations(values) {
      donationsReceived = true;
      donationManager.addDonations(values);
      syncTerrainToCity();
      emitStatsPatch({ buildings: donationManager.getDonationCount() });
      markCubeDirty();
    },
    setDonations(entries) {
      donationsReceived = true;
      donationManager.setDonations(entries);
      syncTerrainToCity();
      emitStatsPatch({ buildings: donationManager.getDonationCount() });
      markCubeDirty();
    },
    updateDonationCustomization(donationId, customization) {
      // Enfileira (ver drainCustomizations): a rajada pós-setDonations vira fatias curtas.
      pendingCustomizations.set(donationId, customization);
      if (!customizationTimer) customizationTimer = window.setTimeout(drainCustomizations, 0);
    },
    focusOnDonation(donationId) {
      const worldPos = donationManager.getDonationWorldPosition(donationId);
      if (!worldPos) return;

      // Salvar posição atual para restaurar depois
      if (!savedCameraPos) {
        savedCameraPos = camera.position.clone();
        savedCameraTarget = controls.target.clone();
      }

      focusRenderer.prepare();
      // A composição mantém os materiais originais; fallback aplica transparência individual.
      donationManager.setFocusedDonation(donationId);
      requestCompile();

      // Manter o lado atual e subir acima do topo para deixar a cobertura visível
      const targetPos = worldPos.clone();
      targetPos.y = Math.max(0, worldPos.y - 5);
      const FOCUS_DISTANCE = 8;
      const dir = camera.position.clone().sub(targetPos);
      dir.y = 0;
      // Fallback se câmera estiver exatamente acima do alvo (direção horizontal degenerada)
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 1);
      dir.normalize();
      const endCamPos = targetPos.clone().add(dir.multiplyScalar(FOCUS_DISTANCE));
      endCamPos.y = worldPos.y + 4.3;

      cameraAnim = {
        startPos: camera.position.clone(),
        startTarget: controls.target.clone(),
        endPos: endCamPos,
        endTarget: targetPos,
        progress: 0,
        duration: 0.8,
      };
    },
    clearFocus() {
      donationManager.setFocusedDonation(null);
      requestCompile();

      if (savedCameraPos && savedCameraTarget) {
        cameraAnim = {
          startPos: camera.position.clone(),
          startTarget: controls.target.clone(),
          endPos: savedCameraPos,
          endTarget: savedCameraTarget,
          progress: 0,
          duration: 0.8,
        };
        savedCameraPos = null;
        savedCameraTarget = null;
      }
    },
    dispose() {
      if (handleMouseMove) renderer.domElement.removeEventListener("mousemove", handleMouseMove);
      if (handleMouseLeave) renderer.domElement.removeEventListener("mouseleave", handleMouseLeave);
      if (onBuildingClick) renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      if (onBuildingClick) renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      if (onBuildingClick) renderer.domElement.removeEventListener("pointercancel", cancelClick);
      if (handlePointerUp) renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      cancelAnimationFrame(animationId);
      controls.removeEventListener("start", cancelCameraAnimation);
      clearTimeout(customizationTimer);
      window.removeEventListener("resize", handleResize);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      scene.removeEventListener("childadded", requestCompile);
      scene.removeEventListener("childremoved", requestCompile);
      const manager = THREE.DefaultLoadingManager;
      if (manager.onStart === handleLoadStart) manager.onStart = () => {};
      if (manager.onLoad === handleLoadEnd) manager.onLoad = () => {};
      if (manager.onProgress === handleLoadProgress) manager.onProgress = () => {};
      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      donationManager.dispose();
      focusRenderer.dispose();
      groundPlane.dispose();
      terrainRig.dispose();
      lightingRig.dispose();
      isDisposed = true;
      environmentUpdater.dispose();
      loadedEnvMap?.dispose();
      loadedBgTexture?.dispose();
      scene.remove(buildingCubeCamera);
      buildingCubeTarget.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    },
  };
}
