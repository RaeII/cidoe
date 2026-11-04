import * as THREE from "three";

export type RooftopType =
  | "none"
  | "spotlights"
  | "helipad"
  | "garden"
  | "helicopter";

export type EdgeLightType =
  | "none"
  | "led";

export type BuildingTextureTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_BUILDING_TEXTURE_TRANSFORM: BuildingTextureTransform = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

export type BuildingShape =
  | "default"
  | "twisted"
  | "octagonal"
  | "setback"
  | "tapered"
  | "chrysler"
  | "hearst"
  | "empire"
  | "taipei"
  | "one-trade"
  | "yachthouse"
  | "residential"
  | "apartment"
  | "gourmet"
  | "loft";

export type BuildingCustomization = {
  color: string;
  rooftopType: RooftopType;
  signText: string;
  signSides: number; // 1–4 lados com letreiro
  edgeLightType: EdgeLightType;
  buildingShape: BuildingShape;
  /**
   * Pasta de textura da fachada deste edifício (`value` do catálogo).
   * null = herda a textura global da cena ([[scene-types#TextureSettings]]).
   */
  textureKey: string | null;
  tilingScale: number; // multiplicador da textura por edifício (1.0 = sem alteração)
  textureTransform: BuildingTextureTransform; // ajuste manual da textura por edifício
  hologramImage: string | null; // data URL (PNG/JPG/GIF). null = sem holograma
  hologramColor: string; // tint cyberpunk aplicado sobre a imagem
  hologramOpacity: number; // 0–1, multiplica brilho/alpha do holograma
};

export const DEFAULT_HOLOGRAM_COLOR = "#73f2ff";
export const DEFAULT_HOLOGRAM_OPACITY = 0.78;

export type DonationEntry = {
  id: number;
  value: number;
  customization?: BuildingCustomization;
};

export type ChunkData = {
  key: string;
  mesh: THREE.InstancedMesh;
  count: number;
  centers: Float32Array;
  heights: Float32Array;
  scales: Float32Array;
};

export type GroundEdgeMode = "straight" | "circular" | "square";

export type HorizonSettings = {
  /** Alcance dos edifícios à frente; não limita chão ou montanhas. */
  distance: number;
  /** Distância de renderização dos prédios atrás da câmera (cull direcional). */
  backDistance: number;
  /** Limite do horizonte: `camera.far` + raio da esfera do céu. Não mexe no cull dos edifícios. */
  renderDistance: number;
  /** Reto: distância à frente; circular: raio; quadrado: meio lado. */
  groundDistance: number;
  groundEdgeMode: GroundEdgeMode;
  fogDensity: number;
  fogColor: string;
};

export type RenderDirectionSettings = {
  forwardDistance: number;
  sideDistance: number;
  backwardDistance: number;
};

export type GroundMaterialType = "standard" | "matte" | "soft-metal" | "polished";

export type TopTextureSettings = {
  normalScale: number;
  displacementScale: number;
  tilingScale: number;
  roughnessIntensity: number;
  metalnessIntensity: number;
  envMapIntensity: number;
};

export type TextureSettings = {
  enabled: boolean;
  textureKey: string; // pasta de textura da fachada (value do catálogo). Global por ora.
  /**
   * Sorteia a textura de cada edifício entre TODAS as texturas ativas do
   * catálogo (determinístico pelo id da doação). Off = cidade inteira com
   * `textureKey`. Prédio com textura escolhida na customização ignora o sorteio.
   */
  randomPerBuilding: boolean;
  normalScale: number;
  displacementScale: number;
  tilingScale: number;
  roughnessIntensity: number;
  metalnessIntensity: number;
  envMapIntensity: number;
  emissiveIntensity: number;
  clayRender: boolean;
  top: TopTextureSettings;
};

export type BuildingSettings = {
  color: string;
  roughness: number;
  metalness: number;
  targetMaxHeight: number;
};

export type GroundSettings = {
  color: string;
  roughness: number;
  metalness: number;
  materialType: GroundMaterialType;
};

// Relevo procedural ao redor da cidade (partes sem edifício).
// Mesmos controles do protótipo terrain.md (fbm + falhas + terraços + suavização),
// mais enabled e gradiente de cor low→high.
export type TerrainSettings = {
  enabled: boolean;
  seed: number;
  segments: number;      // resolução da malha (vértices por lado = segments + 1)
  size: number;          // largura total da malha (unidades de cena)
  height: number;        // amplitude do relevo (unidades de cena)
  frequency: number;     // escala do ruído (mais alto = colinas menores)
  octaves: number;       // camadas de detalhe fbm
  persistence: number;   // queda de amplitude por octave
  lacunarity: number;    // ganho de frequência por octave
  ridge: number;         // peso das cristas (ridge noise)
  faults: number;        // número de linhas de falha tectônica
  faultStrength: number; // força do degrau de cada falha
  smooth: number;        // iterações de suavização do heightfield
  terrace: number;       // número de patamares (0 = sem terraço)
  edge: number;          // rebaixamento da borda externa (0–1)
  wireframe: boolean;    // exibe malha em arame
  lowColor: string;      // cor das partes baixas
  highColor: string;     // cor dos picos
};

export type LightSettings = {
  ambientColor: string;
  ambientExtraIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  directionalColor: string;
  directionalDistance: number;
  directionalElevation: number;
  directionalAzimuth: number;
  directionalTargetX: number;
  directionalTargetY: number;
  directionalTargetZ: number;
};

export type PointLightConfig = {
  x: number;
  y: number;
  z: number;
  intensity: number;
};

export type EnvironmentSettings = {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** Modo noite: escurece céu/luz/névoa e liga as estrelas. Ver `NIGHT_PRESET`. */
  night: boolean;
  /** Brilho das janelas acesas. Só vale de noite (de dia as janelas ficam apagadas). */
  windowIntensity: number;
};

// Probe de reflexo dos prédios (CubeCamera + WebGLCubeRenderTarget do runtime).
// Ver [[scene-runtime#Probe de reflexo (envMap dos prédios)]].
export type ReflectionSettings = {
  enabled: boolean;
  /** Lado do cube render target em px (potência de 2: 128–1024). Recria o target. */
  resolution: number;
  probeX: number;
  probeY: number;
  probeZ: number;
  /** Probe na câmera em vez de ancorado na cidade (recaptura todo intervalo). */
  followCamera: boolean;
  /** Offset UV extra do céu só na captura: desce a faixa de céu abaixo do horizonte. */
  skyDrop: number;
  /** 0–0.95: achata o vetor de reflexão em direção ao horizonte. Simétrico no eixo
   *  vertical → toda fachada amostra a mesma faixa de elevação do cube. */
  envHorizon: number;
  /** Giro horizontal do envMap na fachada, em graus (eixo Y). Único eixo que preserva
   *  a simetria entre as faces. */
  envRotY: number;
  /** Altura da câmera onde começa a suavização do reflexo. */
  heightFadeStart: number;
  /** Altura da câmera onde a suavização atinge o máximo. */
  heightFadeEnd: number;
  /** Rugosidade mínima aplicada ao reflexo na altura máxima (0–1). */
  heightBlur: number;
  /** Distância horizontal até onde o reflexo permanece completo. */
  reflectionDistanceStart: number;
  /** Distância horizontal a partir da qual o reflexo desaparece. */
  reflectionDistanceEnd: number;
  /** Frames entre capturas (1 = todo frame). */
  updateInterval: number;
  /** Recaptura a cada intervalo mesmo sem mudança na cena. */
  continuous: boolean;
  /** Plano cinza + relevo visíveis na captura. */
  includeGround: boolean;
  /** Asfalto, calçada e lotes visíveis na captura. */
  includeCityFloor: boolean;
};

export type BlockLayoutSettings = {
  blockSize: number;
  streetWidth: number;
  towerRatio: number;     // fração de doações tratadas como torres (0–1)
  towersPerBlock: number; // quantas torres por quadra (ocupa os N slots mais centrais)
  baseHeightCap: number;  // teto de altura da base urbana como fração de maxSceneHeight (0–1)
  lotColor: string;       // cor dos lotes vazios das quadras (loteamento esperando edifício)
  sidewalkColor: string;  // cor do topo da calçada (meio-fio em volta das quadras)
  sidewalkSideColor: string; // cor das faces laterais da calçada (mais escura = efeito de sombra/altura)
  sidewalkHeight: number; // altura do topo da calçada (degrau acima do chão), em unidades de mundo
  /**
   * `false` (padrão): layout por quadra — torres agrupadas nos slots centrais de cada
   * quadra, base urbana embaralhada nos slots restantes.
   * `true`: gradiente global — a doação mais alta fica no centro exato da cena e a
   * altura decresce conforme o slot se afasta da origem, sem agrupar torre por quadra.
   */
  centerTallest: boolean;
};

export type SceneStats = {
  /** Amostra de frames consecutivos; contagens do último frame, incluindo capturas. */
  performance?: {
    fps: number;
    frameTimeMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  buildings: number;
  /** Prédios ocultos pelo cull de distância (frontal + traseiro). */
  culled: number;
  fpsMode: string;
  chunks: number;
  /** Último frame saiu com céu (HDRI) resolvido, shaders prontos, sem customização na fila e sem textura baixando. */
  sceneReady: boolean;
};

export type CameraDebugInfo = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  target: {
    x: number;
    y: number;
    z: number;
  };
};

export type CameraVisibilityState = {
  x: number;
  z: number;
  forwardX: number;
  forwardZ: number;
};

// Visibilidade dos componentes HTML sobrepostos na tela. Persistido em localStorage.
export type UIVisibilitySettings = {
  cameraLog: boolean;       // log de posição da câmera (canto inferior esquerdo)
  donationInput: boolean;   // input de doação individual
  bulkInput: boolean;       // input de geração em lote (mín/máx/qtd)
  blockLayoutInput: boolean; // input de configuração de quadras
  buildingLayoutCard: boolean; // card flutuante de organização/quantidade dos edifícios
};

export type CitySceneConfig = {
  chunkSize: number;
  chunkRadius: number;
  blockSize: number;
  roadWidth: number;
  minHeight: number;
  maxHeight: number;
  maxBuildingsPerChunk: number;
  dprCap: number;
  /** Teto do DPR no modo leve (IS_LOW_TIER). */
  liteDprCap: number;
  targetFps: number;
  /** Alvo da resolução dinâmica no modo leve; não limita o rAF. */
  liteFps: number;
  minRenderScale: number;
  maxRenderScale: number;
  far: number;
  reflectionFar: number;
  maxSolarIntensity: number;
  minAmbientDynamic: number;
  maxAmbientDynamic: number;
  sceneBackground: string;
  sceneFogColor: string;
  sceneFogDensity: number;
  cameraFov: number;
  cameraNear: number;
  initialCameraPosition: {
    x: number;
    y: number;
    z: number;
  };
  controlTarget: {
    x: number;
    y: number;
    z: number;
  };
  controls: {
    dampingFactor: number;
    rotateSpeed: number;
    zoomSpeed: number;
    panSpeed: number;
    minDistance: number;
    maxDistance: number;
    maxPolarAngle: number;
  };
};
