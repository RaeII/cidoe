import * as THREE from "three";
import { DEFAULT_BUILDING_TEXTURE_TRANSFORM } from "../types";
import type {
  BlockLayoutSettings,
  BuildingCustomization,
  BuildingShape,
  BuildingTextureTransform,
  BuildingSettings,
  DonationEntry,
  EdgeLightType,
  RooftopType,
  TextureSettings,
} from "../types";
import {
  createRooftopMesh,
  disposeRooftopMesh,
  disposeRooftopSharedResources,
  mergeRooftopParts,
} from "../builders/createRooftopMesh";
import {
  createSignMesh,
  disposeSignMesh,
} from "../builders/createSignMesh";
import {
  createEdgeLightMesh,
  disposeEdgeLightMesh,
  disposeEdgeLightSharedResources,
  DEFAULT_EDGE_LIGHT_COLOR,
  EDGE_LIGHT_SPILL_INTENSITY,
  EDGE_LIGHT_SPILL_POOL_SIZE,
  EDGE_LIGHT_SPILL_RANGE,
} from "../builders/createEdgeLightMesh";
import {
  createHologramMesh,
  disposeHologramMesh,
  positionHologram,
  setHologramImage,
  setHologramOpacity,
  setHologramTint,
  tickHologram,
  type HologramEntry,
} from "../builders/createHologramMesh";
import { DEFAULT_HOLOGRAM_COLOR, DEFAULT_HOLOGRAM_OPACITY } from "../types";
import { setEmpireBuildingMeshColor } from "../builders/createEmpireBuildingMesh";
import {
  getYachthouseRoofOffset,
  setYachthouseBuildingHeight,
  YACHTHOUSE_ROOFTOP_SCALE,
  YACHTHOUSE_TOWER_CENTERS,
} from "../builders/createYachthouseBuildingMesh";
import {
  RESIDENTIAL_ROOFTOP_SCALE,
  setResidentialBuildingHeight,
  setResidentialStoneMaps,
} from "../builders/createResidentialBuildingMesh";
import {
  APARTMENT_ROOFTOP_SCALE,
  setApartmentBuildingHeight,
} from "../builders/createApartmentBuildingMesh";
import {
  GOURMET_ROOFTOP_SCALE,
  setGourmetBuildingHeight,
} from "../builders/createGourmetBuildingMesh";
import {
  LOFT_ROOFTOP_SCALE,
  setLoftBuildingHeight,
} from "../builders/createLoftBuildingMesh";
import {
  createBuildingShapeMesh,
  createUnitBuildingGeometry,
  disposeBuildingShapeSharedResources,
  groupBoxGeometryByTop,
  setBuildingShapeMeshBatching,
} from "../builders/createBuildingShapeMesh";
import { pickIndex, seeded } from "../utils/random";
import {
  cullInstances,
  restoreInstances,
  snapshotInstances,
  type InstanceCullGroup,
} from "../utils/instanceCulling";
import { createBuildingParapets } from "../builders/createParapetMesh";
import { NIGHT_PRESET } from "../config/environmentConfig";

import {
  initFacadeTextureLoader,
  loadFacadeTextureSet,
  peekFacadeTextureSet,
  type FacadeTextureSet,
} from "../textures/facadeTextureLoader";
import { getFacadeMapUrls, resolveFacadeFolder } from "../textures/facadeTextureManifest";

// Pasta de fachada usada quando o catálogo aponta pra um asset que não existe mais.
const DEFAULT_FACADE_FOLDER = "Facade006_1K-mirrored-PNG";
// Salt do sorteio de textura por edifício (ver facadeGroupFor).
const FACADE_VARIANT_SEED = 37;
// Laje de cimento: cor fixa, não segue a cor do edifício nem a da customização.
const TOP_CEMENT_COLOR = "#b9b6b1";
// Topo dos prédios (concreto). Não faz parte do catálogo de fachada, mas passa
// pelo mesmo loader — ganha KTX2, lazy e cache compartilhado de graça.
const TOP_TEXTURE_FOLDER = "Concrete024_1K-JPG";

// Configuração de layout do visualizador de doações
export const DONATION_LAYOUT = {
  maxSceneHeight: 16,     // Altura máxima visual na cena
  minBuildingHeight: 0.5, // Mínimo visual para qualquer doação
  buildingWidth: 2.0,
  buildingDepth: 2.0,
  slotSize: 3.2,          // Distância entre centros de cada prédio
} as const;

// Piso mínimo do loteamento, em anéis de quadras. r=1 → grade 3×3 de quadras
// sempre presente (asfalto + lotes vazios), mesmo com 0 doações, pra cena nunca
// ficar vazia. Cresce além disso conforme as doações exigem mais quadras.
const MIN_LOTEAMENTO_RADIUS = 1;

// Destaque das quadras centrais. Só as torres (top `towerRatio`) mudam de escala —
// a base urbana é idêntica em toda a cidade.
//
// Quadra central (índice 0 da espiral): grade ÍMPAR dentro da mesma pegada da quadra.
// Ímpar → existe slot exato no centro (a maior doação da cena vai nele); mesma pegada
// com menos slots → espaçamento maior, então a torre cabe mais larga sem colidir.
const CENTRAL_BLOCK_TOWER_WIDTH_BOOST = 1.15;
// Altura das torres da quadra central: boost MIN→MAX conforme o valor da doação
// dentro da quadra. Esticar o range amplia a diferença de altura entre as maiores
// doações — o topo fica muito acima do resto, em vez de todas parecerem iguais.
const CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MIN = 1.3;
const CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MAX = 1.9;
// 1º anel de quadras ao redor do centro: torres maiores que o resto da cidade, mas
// sempre menores que as da quadra central (boost < ..._BOOST_MIN acima).
const INNER_RING_TOWER_HEIGHT_BOOST = 1.15;

// Distância (mundo) além da qual acessórios de detalhe deixam de renderizar.
// Fog denso já os torna ilegíveis nessa faixa — só a silhueta do prédio importa.
const ACCESSORY_DETAIL_DISTANCE = 80;
const ACCESSORY_DETAIL_DISTANCE_SQ = ACCESSORY_DETAIL_DISTANCE * ACCESSORY_DETAIL_DISTANCE;

// Precomputa posições em espiral quadrada a partir do centro.
// Índice 0 = centro (doação mais alta), depois cresce em anéis.
// Cada anel adiciona 8*(ring) posições a distância crescente do centro.
function generateSpiralPositions(count: number): ReadonlyArray<[number, number]> {
  const positions: Array<[number, number]> = [[0, 0]];
  let ring = 1;
  while (positions.length < count) {
    for (let x = -ring; x < ring && positions.length < count; x++) {
      positions.push([x, -ring]);
    }
    for (let z = -ring; z < ring && positions.length < count; z++) {
      positions.push([ring, z]);
    }
    for (let x = ring; x > -ring && positions.length < count; x--) {
      positions.push([x, ring]);
    }
    for (let z = ring; z > -ring && positions.length < count; z--) {
      positions.push([-ring, z]);
    }
    ring++;
  }
  return positions;
}

let spiralPositions = generateSpiralPositions(512);

// Retorna os offsets de slot dentro de um bloco, ordenados do centro para fora.
// O índice 0 é sempre o slot mais próximo do centro do bloco (para o prédio mais alto).
function getBlockSlotOffsets(
  blockSize: number,
  slotSize: number = DONATION_LAYOUT.slotSize,
): ReadonlyArray<[number, number]> {
  const offsets: Array<[number, number]> = [];
  const half = (blockSize - 1) / 2;
  for (let row = 0; row < blockSize; row++) {
    for (let col = 0; col < blockSize; col++) {
      offsets.push([(col - half) * slotSize, (row - half) * slotSize]);
    }
  }
  offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  return offsets;
}

// Fisher-Yates determinístico usando seeded random com blockIndex como semente.
function shuffleBlockSlots(
  slots: ReadonlyArray<[number, number]>,
  blockIndex: number,
): Array<[number, number]> {
  const result: Array<[number, number]> = slots.map((s) => [s[0], s[1]]);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seeded(blockIndex, i) * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

type DonationManagerOptions = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  buildingSettings: BuildingSettings;
  textureSettings: TextureSettings;
  blockLayoutSettings: BlockLayoutSettings;
  compositeFocus?: boolean;
};

export type DonationManager = {
  addDonation: (value: number) => number;
  addDonations: (values: number[]) => void;
  /** Replace-all com o dataset do backend (IDs preservados). Usado no load inicial e ao trocar filtro. */
  setDonations: (entries: ReadonlyArray<{ id: number; value: number }>) => void;
  updateBuildingSettings: (settings: BuildingSettings) => void;
  updateTextureSettings: (settings: TextureSettings) => void;
  updateBlockLayout: (settings: BlockLayoutSettings) => void;
  setEnvMap: (envMap: THREE.Texture | null) => void;
  /** Giro horizontal do envMap na fachada/topo (graus). Muda a direção amostrada, não a captura. */
  setEnvMapRotation: (yDeg: number) => void;
  /**
   * Noite na fachada: acende parte das janelas (`windowIntensity` = brilho, do painel) e
   * derruba o reflexo pro valor noturno. De dia as janelas ficam apagadas.
   */
  setNight: (night: boolean, windowIntensity: number) => void;
  /** 0–0.95: achata o vetor de reflexão em direção ao horizonte, igual em toda fachada. */
  setEnvHorizon: (amount: number) => void;
  /** Piso de rugosidade aplicado ao reflexo distante. */
  setReflectionRoughnessFloor: (roughness: number) => void;
  /** Faixa horizontal onde o reflexo desaparece conforme a distância da câmera. */
  setReflectionDistanceRange: (start: number, end: number) => void;
  /** `includeCityFloor`: mantém asfalto/calçada/lotes visíveis durante a captura do cube. */
  beginEnvCapture: (includeCityFloor: boolean) => void;
  endEnvCapture: () => void;
  getDonationCount: () => number;
  getCityRadius: () => number;
  getHoveredValue: (event: MouseEvent, camera: THREE.Camera, domElement: HTMLElement) => number | null;
  getClickedDonationId: (event: MouseEvent, camera: THREE.Camera, domElement: HTMLElement) => number | null;
  getDonationWorldPosition: (donationId: number) => THREE.Vector3 | null;
  getDonationBounds: (donationId: number) => THREE.Box3 | null;
  setFocusedDonation: (donationId: number | null) => void;
  hasFocusedDonation: () => boolean;
  updateDonationCustomization: (donationId: number, customization: BuildingCustomization) => void;
  /**
   * true: transição de formato em updateDonationCustomization só marca o rebuild.
   * false: faz o rebuild pendente (um só para a rajada), sem criar malha de formato —
   * essas saem por pumpCustomShapes.
   */
  setRebuildDeferred: (deferred: boolean) => void;
  /** Cria malhas de formato pendentes até `budgetMs`. true = ainda falta. */
  pumpCustomShapes: (budgetMs: number) => boolean;
  /**
   * Pool de texturas sorteáveis por edifício (`value` das texturas ativas do
   * catálogo). Lista vazia = toda a cidade usa a textura global.
   */
  setFacadeTexturePool: (keys: readonly string[]) => void;
  /** True durante entrada, poeira ou holograma visível — mantém o runtime desenhando. */
  tickAnimations: (elapsedSeconds: number, deltaMs: number) => boolean;
  /** `groundDistance`: raio do chão da cidade (horizonte), independente dos prédios. */
  setRenderDistance: (distance: number, backDistance: number, groundDistance: number) => void;
  /** Retorna quantos prédios ficaram ocultos pelo cull de distância (frontal + traseiro). */
  updateDistanceCulling: (cameraPos: THREE.Vector3, cameraForward: THREE.Vector3, frustum?: THREE.Frustum) => number;
  dispose: () => void;
};

// Material autoral (Empire, Residencial): manager não aplica mapas nem
// intensidades globais de textura — o builder é dono dos mapas/valores.
function isTexturelessMaterial(material: THREE.Material): boolean {
  return material.userData.textureless === true;
}

export function createDonationManager({
  scene,
  renderer,
  buildingSettings,
  textureSettings,
  blockLayoutSettings,
  compositeFocus = false,
}: DonationManagerOptions): DonationManager {
  let disposed = false;
  // 4 é suficiente visualmente; anisotropia máxima (16) castiga o fill rate.
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  initFacadeTextureLoader(renderer);

  // Textura é assíncrona: nada é baixado no construtor. `peek` devolve o set se
  // ele já estiver no cache do loader (recriação do manager, ou troca de volta
  // pra uma textura já vista) — nesse caso a cena nasce texturizada, sem 1 frame
  // cinza. Se não, o material sobe sem mapas e recebe os mapas quando chegarem.
  //
  // Fachada: vem do catálogo (global, trocável em runtime via textureKey), e por
  // edifício via `customization.textureKey` (ver materialFacadeSets).
  // Emissive reusa o color map — evita uma 2ª cópia da mesma imagem na GPU.
  let facadeSet: FacadeTextureSet | null = peekFacadeTextureSet(textureSettings.textureKey);
  let topSet: FacadeTextureSet | null = peekFacadeTextureSet(TOP_TEXTURE_FOLDER);

  // Set de fachada por material. Ausente = usa o `facadeSet` global. Só os clones
  // de prédio com textura própria entram aqui. WeakMap, não userData: Material.copy
  // serializa userData com JSON, o que estouraria com THREE.Texture dentro.
  const materialFacadeSets = new WeakMap<THREE.Material, FacadeTextureSet>();
  const facadeSetFor = (material: THREE.Material): FacadeTextureSet | null =>
    materialFacadeSets.get(material) ?? facadeSet;

  const tilingUniform = { value: textureSettings.tilingScale };
  const topTilingUniform = { value: textureSettings.top.tilingScale };
  // Compartilhado por todos os materiais triplanares (inclui clones de custom shape).
  const envHorizonUniform = { value: 0 };
  const reflectionRoughnessFloorUniform = { value: 0 };
  const reflectionDistanceStartUniform = { value: 0 };
  const reflectionDistanceEndUniform = { value: 1 };
  // Janelas acesas de noite. 0 = dia (apagadas). Máscara reusa o metalnessMap da fachada:
  // ele já é branco no vidro e preto no caixilho, então nenhuma textura nova sobe pra GPU.
  const nightWindowUniform = { value: 0 };
  const nightWindowColorUniform = { value: new THREE.Color(NIGHT_PRESET.windowColor) };
  // Noite também derruba o reflexo na fachada: o slider "Intensidade na fachada" (aba
  // reflexo) vale só de dia. Override, não escrita no settings — o valor do painel volta
  // intacto ao amanhecer.
  let nightMode = false;
  const facadeEnvMapIntensity = (settings: TextureSettings) =>
    nightMode ? NIGHT_PRESET.facadeEnvMapIntensity : settings.envMapIntensity;

  // Geometria 1×1×1 — escala via instanceMatrix
  const buildingGeometry = createUnitBuildingGeometry();
  const parapets = createBuildingParapets(scene, compositeFocus);

  // Shader triplanar: aplica textura usando coordenadas de mundo, não UV locais.
  // Necessário para instanced mesh onde cada prédio tem escala/posição diferente.
  // Cria um uniform `uTilingMultiplier` (default 1.0) por material — guardado em
  // `material.userData.tilingMultiplier` para permitir override per-edifício em clones.
  const applyTriplanarShader = (
    material: THREE.MeshPhysicalMaterial,
    cacheKey: string,
    tiling: { value: number },
  ) => {
    // Fachada tem janela; topo não. Derivado do cacheKey pra não repetir o flag em
    // todos os call sites (inclui os clones de shape custom).
    const windows = cacheKey.includes("facade");
    // Topo de cimento: descarta vColor/instanceColor para o InstancedMesh não pintar
    // a laje com a cor do edifício (instanceColor vale p/ todos os grupos da geometria).
    const ignoreInstanceColor = cacheKey.includes("top");
    const tilingMultiplier = { value: 1.0 };
    const textureTransform = {
      value: new THREE.Vector4(
        DEFAULT_BUILDING_TEXTURE_TRANSFORM.scaleX,
        DEFAULT_BUILDING_TEXTURE_TRANSFORM.scaleY,
        DEFAULT_BUILDING_TEXTURE_TRANSFORM.offsetX,
        DEFAULT_BUILDING_TEXTURE_TRANSFORM.offsetY,
      ),
    };
    material.userData.tilingMultiplier = tilingMultiplier;
    material.userData.textureTransform = textureTransform;
    material.customProgramCacheKey = () => cacheKey;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTiling = tiling;
      shader.uniforms.uTilingMultiplier = tilingMultiplier;
      shader.uniforms.uTextureTransform = textureTransform;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        uniform float uTiling;
        uniform float uTilingMultiplier;
        uniform vec4 uTextureTransform;
        attribute vec3 aProjPosition;
        attribute vec3 aProjNormal;
        varying vec3 vTriplanarWorldPos;
        varying vec3 vTriplanarObjNormal;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        // Usa posição/normal de projeção (axis-aligned, pré-twist) para evitar
        // costura no meio do edifício torcido. Em geometria default, esses
        // atributos são cópias diretas de position/normal, então o
        // comportamento é idêntico ao anterior.
        #ifdef USE_INSTANCING
          vec4 triWp = modelMatrix * instanceMatrix * vec4(aProjPosition, 1.0);
        #else
          vec4 triWp = modelMatrix * vec4(aProjPosition, 1.0);
        #endif
        vTriplanarWorldPos = triWp.xyz;
        vTriplanarObjNormal = aProjNormal;
        // Projeção COM SINAL. Sem o sinal, +X e +Z leem a textura com handedness oposta
        // (visto de fora, +u aponta pra esquerda numa face e pra direita na outra): o
        // tangent frame derivado de vNormalMapUv espelha junto, e com normalScale alto o
        // normal map inverte os bumps → face frontal e lateral com padrão diferente.
        vec3 triAbsN = abs(aProjNormal);
        vec2 triUV;
        if (triAbsN.y >= triAbsN.x && triAbsN.y >= triAbsN.z) {
          triUV = vec2(triWp.x, triWp.z * (aProjNormal.y < 0.0 ? -1.0 : 1.0));
        } else if (triAbsN.x >= triAbsN.z) {
          triUV = vec2(-triWp.z * (aProjNormal.x < 0.0 ? -1.0 : 1.0), triWp.y);
        } else {
          triUV = vec2(triWp.x * (aProjNormal.z < 0.0 ? -1.0 : 1.0), triWp.y);
        }
        triUV *= uTiling * uTilingMultiplier;
        triUV = triUV * uTextureTransform.xy + uTextureTransform.zw;
        #ifdef USE_MAP
          vMapUv = triUV;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = triUV;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = triUV;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = triUV;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = triUV;
        #endif
        #ifdef USE_DISPLACEMENTMAP
          vDisplacementMapUv = triUV;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = triUV;
        #endif`,
      );
      shader.uniforms.uEnvHorizon = envHorizonUniform;
      shader.uniforms.uReflectionRoughnessFloor = reflectionRoughnessFloorUniform;
      shader.uniforms.uReflectionDistanceStart = reflectionDistanceStartUniform;
      shader.uniforms.uReflectionDistanceEnd = reflectionDistanceEndUniform;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        uniform float uEnvHorizon;
        uniform float uReflectionRoughnessFloor;
        uniform float uReflectionDistanceStart;
        uniform float uReflectionDistanceEnd;
        varying vec3 vTriplanarWorldPos;
        varying vec3 vTriplanarObjNormal;`,
      );
      // Luz do LED tem que CLAREAR o vizinho, não virar um ponto brilhante nele.
      // `directSpecular` é o lobo GGX da luz direta: numa fachada de roughness
      // baixa ele desenha o "bulbo" da PointLight espelhado na parede. Removido
      // aqui — sobra `directDiffuse`, que é justamente o clareado.
      // O reflexo do ambiente NÃO é afetado: ele vem de `indirectSpecular`
      // (getIBLRadiance / envMap), outro caminho do mesmo shader.
      // Só é seguro porque as únicas luzes DIRETAS da cena são as spillLights do
      // LED — o resto é AmbientLight + IBL do HDRI (ver createLightingRig).
      const DIRECT_SPECULAR_ANCHOR =
        "reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );";
      const physicalChunk = THREE.ShaderChunk.lights_physical_pars_fragment;
      if (import.meta.env.DEV && !physicalChunk.includes(DIRECT_SPECULAR_ANCHOR)) {
        console.warn("[donationManager] âncora do directSpecular sumiu — LED vira ponto de luz na fachada");
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_pars_fragment>",
        physicalChunk.replace(DIRECT_SPECULAR_ANCHOR, ""),
      );
      const ROUGHNESS_ANCHOR = "#include <roughnessmap_fragment>";
      if (import.meta.env.DEV && !shader.fragmentShader.includes(ROUGHNESS_ANCHOR)) {
        console.warn("[donationManager] âncora de roughness sumiu — suavização por altura inativa");
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        ROUGHNESS_ANCHOR,
        `${ROUGHNESS_ANCHOR}
        roughnessFactor = max(roughnessFactor, uReflectionRoughnessFloor);`,
      );
      // Achata o vetor de reflexão em direção ao horizonte. Rotação rígida (envMapRotation)
      // NÃO serve aqui: girar no X quase não mexe nas direções ±X e gira ±Z inteiro — a
      // própria correção fica dependente da face. Escalar só o Y é simétrico no eixo
      // vertical, então toda fachada vertical amostra a MESMA faixa de elevação do cube.
      // getIBLRadiance mora num #include que o three só expande DEPOIS do onBeforeCompile:
      // inlina o chunk aqui, senão as âncoras abaixo nunca casam.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <envmap_physical_pars_fragment>",
        THREE.ShaderChunk.envmap_physical_pars_fragment,
      );
      const IBL_ANCHOR = "reflectVec = inverseTransformDirection( reflectVec, viewMatrix );";
      if (import.meta.env.DEV && !shader.fragmentShader.includes(IBL_ANCHOR)) {
        console.warn("[donationManager] âncora do getIBLRadiance sumiu — uEnvHorizon inativo");
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        IBL_ANCHOR,
        `${IBL_ANCHOR}
        reflectVec = normalize(vec3(reflectVec.x, reflectVec.y * (1.0 - uEnvHorizon), reflectVec.z));`,
      );
      const IBL_IRRADIANCE_ANCHOR =
        "vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );";
      shader.fragmentShader = shader.fragmentShader.replace(
        IBL_IRRADIANCE_ANCHOR,
        `if (envMapIntensity <= 0.0) return vec3(0.0);
        ${IBL_IRRADIANCE_ANCHOR}`,
      );
      const IBL_SAMPLE_ANCHOR =
        "vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );";
      if (import.meta.env.DEV && !shader.fragmentShader.includes(IBL_SAMPLE_ANCHOR)) {
        console.warn("[donationManager] amostragem do getIBLRadiance sumiu — alcance inativo");
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        IBL_SAMPLE_ANCHOR,
        `if (envMapIntensity <= 0.0) return vec3(0.0);
        vec2 reflectionDelta = vTriplanarWorldPos.xz - cameraPosition.xz;
        float reflectionDistanceSq = dot(reflectionDelta, reflectionDelta);
        float reflectionEndSq = uReflectionDistanceEnd * uReflectionDistanceEnd;
        if (reflectionDistanceSq >= reflectionEndSq) return vec3(0.0);
        float reflectionProximity = 1.0;
        float reflectionStartSq = uReflectionDistanceStart * uReflectionDistanceStart;
        if (reflectionDistanceSq > reflectionStartSq) {
          reflectionProximity = 1.0 - smoothstep(
            uReflectionDistanceStart,
            uReflectionDistanceEnd,
            sqrt(reflectionDistanceSq)
          );
        }
        ${IBL_SAMPLE_ANCHOR}`,
      );
      // Janelas acesas (só fachada — o topo não tem grade de janela).
      // Grade 14×8 = janelas por tile da textura de fachada padrão (Facade006). Cada
      // célula acende ou não por hash da própria célula, e o triUV é de MUNDO: o padrão
      // sai diferente por prédio de graça, e fica estável entre frames.
      if (windows) {
        shader.uniforms.uNightWindow = nightWindowUniform;
        shader.uniforms.uNightWindowColor = nightWindowColorUniform;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>
          uniform float uNightWindow;
          uniform vec3 uNightWindowColor;`,
        );
        const EMISSIVE_ANCHOR = "#include <emissivemap_fragment>";
        if (import.meta.env.DEV && !shader.fragmentShader.includes(EMISSIVE_ANCHOR)) {
          console.warn("[donationManager] âncora do emissive sumiu — janelas não acendem de noite");
        }
        shader.fragmentShader = shader.fragmentShader.replace(
          EMISSIVE_ANCHOR,
          `${EMISSIVE_ANCHOR}
          // Sem metalnessMap não existe máscara de vidro; fachada fica sem janela acesa.
          #ifdef USE_METALNESSMAP
            if (uNightWindow > 0.0) {
              vec2 windowCell = floor(vMetalnessMapUv * vec2(14.0, 8.0));
              float windowHash = fract(sin(dot(windowCell, vec2(12.9898, 78.233))) * 43758.5453);
              float windowGlass = texture2D(metalnessMap, vMetalnessMapUv).b;
              totalEmissiveRadiance += uNightWindowColor * uNightWindow * windowGlass
                * step(windowHash, ${NIGHT_PRESET.windowLitFraction.toFixed(3)});
            }
          #endif`,
        );
      }
      const IBL_RETURN_ANCHOR = "return envMapColor.rgb * envMapIntensity;";
      if (import.meta.env.DEV && !shader.fragmentShader.includes(IBL_RETURN_ANCHOR)) {
        console.warn("[donationManager] retorno do getIBLRadiance sumiu — alcance inativo");
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        IBL_RETURN_ANCHOR,
        "return envMapColor.rgb * envMapIntensity * reflectionProximity;",
      );
      if (ignoreInstanceColor) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "");
      }
    };
  };

  // Clearcoat: verniz sobre a fachada (video-2). Custa um segundo lobo especular no
  // material mais caro do three.js, mas é ele que dá o brilho de vidro nas quinas e
  // no topo — sem ele o prédio fica fosco mesmo com envMap.
  const facadeMaterial = new THREE.MeshPhysicalMaterial({
    color: buildingSettings.color,
    roughness: buildingSettings.roughness,
    metalness: buildingSettings.metalness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
  });
  applyTriplanarShader(facadeMaterial, "donation-facade-triplanar", tilingUniform);

  const topMaterial = new THREE.MeshPhysicalMaterial({
    color: TOP_CEMENT_COLOR,
    roughness: buildingSettings.roughness,
    metalness: buildingSettings.metalness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
  });
  applyTriplanarShader(topMaterial, "donation-top-triplanar", topTilingUniform);
  for (const material of parapets.materials) {
    applyTriplanarShader(material, "donation-parapet-triplanar", topTilingUniform);
  }

  // Materiais clonados para o edifício em destaque (opacidade total, independente do instanced)
  const focusFacadeMaterial = facadeMaterial.clone();
  const focusTopMaterial = topMaterial.clone();
  applyTriplanarShader(focusFacadeMaterial, "focus-facade-triplanar", tilingUniform);
  applyTriplanarShader(focusTopMaterial, "focus-top-triplanar", topTilingUniform);

  let capacity = 512;

  // ── Grupos de fachada ──────────────────────────────────────────────────────
  // Um InstancedMesh por textura de fachada em uso: draw calls = nº de texturas,
  // não de prédios. Grupo 0 = textura global da cena (facadeMaterial); os demais
  // vêm do pool do catálogo (setFacadeTexturePool). É o que deixa cada edifício
  // ter a própria textura — sorteada ou escolhida — sem mesh dedicado por prédio.
  // O topo (cimento) é igual em todos, então topMaterial é compartilhado.
  type FacadeGroup = {
    folder: string; // "" = herda a textura global da cena
    material: THREE.MeshPhysicalMaterial;
    mesh: THREE.InstancedMesh;
    capacity: number;
    colors: Float32Array; // instanceColor compactado deste grupo
    renderCount: number;
    logicalCount: number;
    matricesChanged: boolean;
    colorsChanged: boolean;
  };

  const ensureGroupCapacity = (group: FacadeGroup, needed: number) => {
    if (needed <= group.capacity) return;
    let cap = Math.max(group.capacity, 64);
    while (cap < needed) cap = Math.ceil(cap * 1.5);
    scene.remove(group.mesh);
    group.mesh.dispose();
    group.capacity = cap;
    group.colors = new Float32Array(cap * 3);
    group.mesh = new THREE.InstancedMesh(buildingGeometry, [group.material, topMaterial], cap);
    group.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.mesh.matrixAutoUpdate = false; // Transformações vivem no instanceMatrix.
    group.mesh.count = 0;
    scene.add(group.mesh);
  };

  const createFacadeGroup = (
    folder: string,
    material: THREE.MeshPhysicalMaterial,
  ): FacadeGroup => {
    const group: FacadeGroup = {
      folder,
      material,
      mesh: new THREE.InstancedMesh(buildingGeometry, [material, topMaterial], 0),
      capacity: 0,
      colors: new Float32Array(0),
      renderCount: 0,
      logicalCount: 0,
      matricesChanged: false,
      colorsChanged: false,
    };
    // Capacidade real vem do rebuild (ensureGroupCapacity com a contagem do
    // grupo). Aqui só o mínimo: nascer com a capacidade global daria N × total
    // de instâncias alocadas — dezenas de MB à toa com a cidade cheia.
    ensureGroupCapacity(group, 64);
    return group;
  };

  const facadeGroups: FacadeGroup[] = [createFacadeGroup("", facadeMaterial)];
  // pasta → índice do grupo. A pasta da textura global sempre aponta pro grupo 0.
  const groupIndexByFolder = new Map<string, number>([
    [resolveFacadeFolder(textureSettings.textureKey), 0],
  ]);
  // Pool sorteável: `value` das texturas ATIVAS do catálogo (vem do backend).
  let facadeTexturePool: readonly string[] = [];
  // Índices de grupo do sorteio (dedupe do pool, já resolvidos).
  let randomGroupIndices: number[] = [];

  // --- Cull de distância do chão da cidade ---
  // Lotes, calçadas, postes e asfalto somem pelo alcance do HORIZONTE, não pelo dos
  // EDIFÍCIOS. O teste é RADIAL: a borda que ele desenha é um ARCO e, com o raio dos
  // prédios (208 padrão), esse arco caía DENTRO do frustum (o canto vai a ~1.55*far) —
  // o loteamento aparecia cortado numa curva que escorregava junto com a câmera. O limite
  // traseiro (46 padrão) fazia o mesmo pela base da imagem com a câmera inclinada.
  // Mesmo critério do relevo — ver TERRAIN_CULL_SPAN em createCitySceneRuntime.
  let lotCull: InstanceCullGroup | null = null;
  let sidewalkCull: InstanceCullGroup | null = null;
  let lampCull: InstanceCullGroup | null = null;
  let roadCull: InstanceCullGroup | null = null;
  let groundCullSq = Infinity;
  // Última câmera vista pelo cull. Rebuild refaz o cull na hora — senão o chão
  // reaparece inteiro até o próximo passe (throttle de 0.25 s no runtime).
  const lastCullPos = new THREE.Vector3();
  let hasCullView = false;
  let viewFrustum: THREE.Frustum | null = null;

  const cullGroundInstances = () => {
    if (!hasCullView) return;
    const visible = (x: number, z: number) => {
      const dx = x - lastCullPos.x;
      const dz = z - lastCullPos.z;
      return dx * dx + dz * dz <= groundCullSq;
    };
    cullInstances(lotCull, visible, viewFrustum);
    cullInstances(sidewalkCull, visible, viewFrustum);
    cullInstances(lampCull, visible, viewFrustum);
    cullInstances(roadCull, visible, viewFrustum);
  };

  // --- Rede de estradas (asfalto entre blocos) ---
  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x18191c),
    roughness: 0.92,
    metalness: 0.01,
  });

  // --- Calçadas (concreto elevado, meio-fio em volta de cada quadra) ---
  // Calçada estreita no vão entre a borda dos lotes e a borda do asfalto,
  // elevada acima do chão e do asfalto. Box instanciado = 1 draw call pra todas.
  const SIDEWALK_RESERVE = 3.6;       // recuo do asfalto (rua − recuo = largura do asfalto)
  const SIDEWALK_GAP = 0.25;          // respiro de chão livre entre a quadra e a calçada
  const SIDEWALK_BOTTOM = -0.08;      // fundo do box, abaixo do terreno (-0.04) p/ não flutuar; topo vem de sidewalkHeight
  const sidewalkGeometry = new THREE.BoxGeometry(1, 1, 1);
  // Dois grupos reais: laterais/base e topo. Remapear só materialIndex manteria
  // os 6 draw calls originais do BoxGeometry.
  groupBoxGeometryByTop(sidewalkGeometry, 1, 0);
  const sidewalkTopMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blockLayoutSettings.sidewalkColor),
    roughness: 0.95,
    metalness: 0.0,
  });
  const sidewalkSideMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blockLayoutSettings.sidewalkSideColor),
    roughness: 0.95,
    metalness: 0.0,
  });
  const sidewalkDummy = new THREE.Object3D();
  let sidewalkCapacity = 0;
  let sidewalkMesh: THREE.InstancedMesh | null = null;

  // Faixa da calçada, medida do centro da quadra: começa depois da borda externa dos
  // lotes (+ respiro) e termina na borda do asfalto. Calçada preenche a faixa; poste
  // assenta no meio dela.
  const curbBand = (blockSpacing: number, streetWidth: number, roadWidth: number) => {
    const blockFootprint = blockSpacing - streetWidth;
    const lotEdge = blockFootprint / 2 + (DONATION_LAYOUT.slotSize - 0.5) / 2;
    return {
      blockFootprint,
      innerHalf: lotEdge + SIDEWALK_GAP,
      outerHalf: blockSpacing / 2 - roadWidth / 2,
    };
  };

  // Desenha uma moldura de calçada (4 tiras) em volta de cada quadra. As molduras
  // quebram naturalmente nos cruzamentos (cantos das quadras), deixando o asfalto
  // perpendicular passar livre. Tira N/S cobre os cantos; L/O fica entre eles.
  const rebuildSidewalks = (
    r: number,
    blockSpacing: number,
    streetWidth: number,
    roadWidth: number,
  ) => {
    // Calçada estreita: ocupa o vão entre a borda externa dos lotes e a borda do
    // asfalto, com SIDEWALK_GAP de chão livre antes da quadra (respiro). Não sobe na
    // quadra nem invade o asfalto.
    const { blockFootprint, innerHalf, outerHalf } = curbBand(blockSpacing, streetWidth, roadWidth);
    const sidewalkWidth = outerHalf - innerHalf;
    if (sidewalkWidth <= 0.01 || blockFootprint <= 0) {
      if (sidewalkMesh) sidewalkMesh.count = 0;
      sidewalkCull = null;
      return;
    }
    const midHalf = (innerHalf + outerHalf) / 2;
    const blocksPerSide = 2 * r + 1;
    const needed = blocksPerSide * blocksPerSide * 4; // 4 tiras por quadra

    let m = sidewalkMesh;
    if (!m || needed > sidewalkCapacity) {
      if (m) {
        scene.remove(m);
        m.dispose();
      }
      sidewalkCapacity = Math.max(64, Math.ceil(needed * 1.5));
      m = new THREE.InstancedMesh(
        sidewalkGeometry,
        [sidewalkTopMaterial, sidewalkSideMaterial],
        sidewalkCapacity,
      );
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      sidewalkMesh = m;
    }

    // Altura configurável: topo em sidewalkHeight, fundo fixo abaixo do terreno.
    const swTop = currentBlockLayout.sidewalkHeight;
    const swBoxHeight = swTop - SIDEWALK_BOTTOM;
    const swCenterY = (swTop + SIDEWALK_BOTTOM) / 2;

    let idx = 0;
    const addStrip = (cx: number, cz: number, sx: number, sz: number) => {
      sidewalkDummy.position.set(cx, swCenterY, cz);
      sidewalkDummy.scale.set(sx, swBoxHeight, sz);
      sidewalkDummy.updateMatrix();
      m!.setMatrixAt(idx++, sidewalkDummy.matrix);
    };

    for (let bx = -r; bx <= r; bx++) {
      for (let bz = -r; bz <= r; bz++) {
        const cx = bx * blockSpacing;
        const cz = bz * blockSpacing;
        addStrip(cx, cz + midHalf, 2 * outerHalf, sidewalkWidth); // norte
        addStrip(cx, cz - midHalf, 2 * outerHalf, sidewalkWidth); // sul
        addStrip(cx + midHalf, cz, sidewalkWidth, 2 * innerHalf); // leste
        addStrip(cx - midHalf, cz, sidewalkWidth, 2 * innerHalf); // oeste
      }
    }

    m.count = idx;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    sidewalkCull = snapshotInstances([m], idx);
  };

  // --- Postes de luz (meio-fio das quadras) ---
  // 8 por quadra (2 por lado que TEM rua), sempre em pé; de noite a luminária acende e
  // uma mancha de luz cai no asfalto.
  //
  // A luz é decal aditivo no chão, não PointLight: 200+ postes = 200+ luzes reais, o
  // que estoura o shader (e a contagem de luzes entra na chave de cache do programa,
  // então acender/apagar recompilaria tudo). O decal é 1 draw call e escala à vontade.
  // ponytail: sem PointLight, então poste não clareia fachada nem prédio — só a rua.
  // Escala da cena: prédio tem 2.0 de largura e até 16 de altura → 1 unidade ≈ 10 m.
  // Poste de 1.0 = ~10 m, altura real de poste de rua; 2+ ficaria torre de estádio.
  const LAMP_HEIGHT = 1.0;
  const LAMP_POLE_RADIUS = 0.035;
  const LAMP_POOL_SIZE = 4.0;         // lado da mancha de luz no chão (~20 m de raio)
  const LAMP_POOL_Y = -0.008;         // acima do asfalto (-0.015) e do tracejado (-0.010)
  const LAMP_COLOR = 0xffc06a;

  const lampPoleGeometry = new THREE.CylinderGeometry(
    LAMP_POLE_RADIUS * 0.7,
    LAMP_POLE_RADIUS,
    LAMP_HEIGHT,
    6,
  );
  lampPoleGeometry.translate(0, LAMP_HEIGHT / 2, 0); // pivô na base = assenta no meio-fio
  const lampHeadGeometry = new THREE.BoxGeometry(0.2, 0.055, 0.11);
  const lampPoleMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2b2d31),
    roughness: 0.7,
    metalness: 0.35,
  });
  // emissiveIntensity 0 = de dia a luminária é só um vidro apagado. Trocar intensity
  // é uniform: acender/apagar não recompila.
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a8a86),
    roughness: 0.4,
    emissive: new THREE.Color(LAMP_COLOR),
    emissiveIntensity: 0,
  });
  const lampPoolMaterial = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      varying vec2 vPoolUv;
      varying float vPoolFogDepth;
      void main() {
        vPoolUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vPoolFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uIntensity;
      uniform vec3 uColor;
      uniform float fogDensity;
      varying vec2 vPoolUv;
      varying float vPoolFogDepth;
      void main() {
        // Queda radial ao quadrado: centro quente, borda derretendo no asfalto.
        float d = min(1.0, length(vPoolUv - 0.5) * 2.0);
        float falloff = 1.0 - d;
        // Aditivo soma luz: a névoa tem que apagar em direção ao PRETO (não à cor da
        // névoa), senão as manchas dos postes distantes ficam brilhando dentro do fog.
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vPoolFogDepth * vPoolFogDepth);
        gl_FragColor = vec4(uColor * uIntensity * falloff * falloff * (1.0 - fogFactor), 1.0);
      }
    `,
    // Spread de UniformsLib.fog: `fog: true` faz o three preencher `fogDensity` por frame
    // com a densidade da FogExp2 da cena (ver refreshFogUniforms).
    uniforms: {
      ...THREE.UniformsLib.fog,
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color(LAMP_COLOR) },
    },
    fog: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lampPoolGeometry = new THREE.PlaneGeometry(LAMP_POOL_SIZE, LAMP_POOL_SIZE);
  lampPoolGeometry.rotateX(-Math.PI / 2);
  const lampDummy = new THREE.Object3D();
  let lampCapacity = 0;
  let lampPoleMesh: THREE.InstancedMesh | null = null;
  let lampHeadMesh: THREE.InstancedMesh | null = null;
  let lampPoolMesh: THREE.InstancedMesh | null = null;

  const rebuildStreetLamps = (
    r: number,
    blockSpacing: number,
    streetWidth: number,
    roadWidth: number,
  ) => {
    const { blockFootprint, innerHalf, outerHalf } = curbBand(blockSpacing, streetWidth, roadWidth);
    const curbHalf = (innerHalf + outerHalf) / 2;                 // poste no meio da calçada
    // Mancha empurrada da calçada pro meio da rua (centro da via = blockSpacing/2).
    // 0.55, não 1.0: com a mancha no eixo da via as duas calçadas jogam luz no MESMO
    // ponto e o aditivo dobra num risco quente no meio da rua.
    const poolCenter = curbHalf + (blockSpacing / 2 - curbHalf) * 0.55;
    if (
      import.meta.env.DEV &&
      (poolCenter < outerHalf || poolCenter > blockSpacing / 2 + roadWidth / 2)
    ) {
      console.warn("[donationManager] mancha de luz do poste caiu fora do asfalto");
    }
    const poolOffset = poolCenter - curbHalf;
    // 2 postes por lado (a 1/4 e 3/4 do lado) = 8 por quadra. 1 por lado deixava a rua
    // quase toda escura; 4+ por lado vira alameda de poste.
    const alongOffset = blockFootprint / 4;
    const blocksPerSide = 2 * r + 1;
    const needed = blocksPerSide * blocksPerSide * 8;

    if (r === 0 || blockFootprint <= 0) {
      if (lampPoleMesh) lampPoleMesh.count = 0;
      if (lampHeadMesh) lampHeadMesh.count = 0;
      if (lampPoolMesh) lampPoolMesh.count = 0;
      lampCull = null;
      return;
    }

    if (!lampPoleMesh || needed > lampCapacity) {
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) {
        if (!m) continue;
        scene.remove(m);
        m.dispose();
      }
      lampCapacity = Math.max(64, Math.ceil(needed * 1.5));
      lampPoleMesh = new THREE.InstancedMesh(lampPoleGeometry, lampPoleMaterial, lampCapacity);
      lampHeadMesh = new THREE.InstancedMesh(lampHeadGeometry, lampHeadMaterial, lampCapacity);
      lampPoolMesh = new THREE.InstancedMesh(lampPoolGeometry, lampPoolMaterial, lampCapacity);
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(m);
      }
    }

    const baseY = currentBlockLayout.sidewalkHeight; // assenta no topo do meio-fio
    let idx = 0;
    // dirX/dirZ apontam da quadra pra rua: define de que lado do meio-fio o poste fica
    // e pra onde a mancha de luz é empurrada. `along` desliza o poste ao longo do lado.
    const addLamp = (cx: number, cz: number, dirX: number, dirZ: number, along: number) => {
      // Ao longo do lado = eixo perpendicular a dir (lado N/S corre em X, L/O corre em Z).
      const x = cx + dirX * curbHalf + (dirX === 0 ? along : 0);
      const z = cz + dirZ * curbHalf + (dirZ === 0 ? along : 0);
      lampDummy.position.set(x, baseY, z);
      lampDummy.scale.set(1, 1, 1);
      lampDummy.rotation.set(0, 0, 0);
      lampDummy.updateMatrix();
      lampPoleMesh!.setMatrixAt(idx, lampDummy.matrix);
      // Luminária deslocada pro lado da rua (braço implícito), na ponta do poste.
      lampDummy.position.set(x + dirX * 0.12, baseY + LAMP_HEIGHT, z + dirZ * 0.12);
      // Luminária é comprida no X: no lado N/S (rua correndo em X) ela tem que girar
      // 90° pro corpo apontar pra rua, não deitar ao longo dela.
      lampDummy.rotation.set(0, dirZ !== 0 ? Math.PI / 2 : 0, 0);
      lampDummy.updateMatrix();
      lampHeadMesh!.setMatrixAt(idx, lampDummy.matrix);
      lampDummy.position.set(x + dirX * poolOffset, LAMP_POOL_Y, z + dirZ * poolOffset);
      lampDummy.rotation.set(0, 0, 0);
      lampDummy.updateMatrix();
      lampPoolMesh!.setMatrixAt(idx, lampDummy.matrix);
      idx++;
    };

    for (let bx = -r; bx <= r; bx++) {
      for (let bz = -r; bz <= r; bz++) {
        const cx = bx * blockSpacing;
        const cz = bz * blockSpacing;
        // Só nos lados que dão pra uma rua — quadra da borda não ganha poste virado
        // pro vazio fora do loteamento.
        for (const along of [-alongOffset, alongOffset]) {
          if (bz < r) addLamp(cx, cz, 0, 1, along);
          if (bz > -r) addLamp(cx, cz, 0, -1, along);
          if (bx < r) addLamp(cx, cz, 1, 0, along);
          if (bx > -r) addLamp(cx, cz, -1, 0, along);
        }
      }
    }

    for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) {
      m!.count = idx;
      m!.instanceMatrix.needsUpdate = true;
      m!.computeBoundingSphere();
    }
    // Poste, luminária e mancha de luz compartilham o índice: somem juntos no cull.
    lampCull = snapshotInstances([lampPoleMesh, lampHeadMesh, lampPoolMesh], idx);
  };

  // Shader da faixa central tracejada (divisória de pistas). A coordenada ao longo da
  // via vem da posição da INSTÂNCIA, então os segmentos desenham um tracejado contínuo
  // como se ainda fossem uma tira só.
  const dashVS = /* glsl */`
    varying float vDashAlong;
    void main() {
      vec4 local = instanceMatrix * vec4(position, 1.0);
      // Eixo da via = aquele em que o segmento é comprido (o outro tem a largura da faixa).
      float sx = length(instanceMatrix[0].xyz);
      float sz = length(instanceMatrix[2].xyz);
      vDashAlong = sz > sx ? local.z : local.x;
      gl_Position = projectionMatrix * modelViewMatrix * local;
    }
  `;
  const dashFS = /* glsl */`
    varying float vDashAlong;
    uniform float dashSpacing;  // comprimento físico de um ciclo traço+vão
    uniform float blockSpacing; // distância entre cruzamentos
    uniform float interHalf;    // meia-largura do cruzamento (zona sem faixa)

    void main() {
      // Apaga a faixa nos cruzamentos pra ela não conflitar com a faixa da via
      // perpendicular. Cruzamentos em (k+0.5)*blockSpacing; distInter = distância
      // física ao cruzamento mais próximo.
      float u = vDashAlong / blockSpacing - 0.5;
      float distInter = abs(fract(u + 0.5) - 0.5) * blockSpacing;
      if (distInter < interHalf) discard;

      // Padrão de tracejado: 15% cheio, 85% vazio
      if (fract(vDashAlong / dashSpacing) > 0.15) discard;

      gl_FragColor = vec4(0.92, 0.88, 0.55, 0.7); // amarelo-creme
    }
  `;

  const dashMaterial = new THREE.ShaderMaterial({
    vertexShader: dashVS,
    fragmentShader: dashFS,
    uniforms: {
      dashSpacing: { value: 1 },
      blockSpacing: { value: 1 },
      interHalf: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });

  // Asfalto e faixa central são INSTANCIADOS por segmento de quadra (antes: duas tiras
  // contínuas por eixo). Continua 1 draw call por mesh, mas o cull de distância
  // consegue sumir com a rua longe — tira contínua é tudo-ou-nada.
  const roadSegmentGeometry = new THREE.PlaneGeometry(1, 1);
  roadSegmentGeometry.rotateX(-Math.PI / 2); // deita no chão; matriz de instância escala
  const roadDummy = new THREE.Object3D();
  let roadCapacity = 0;
  let asphaltMesh: THREE.InstancedMesh | null = null;
  let dashMesh: THREE.InstancedMesh | null = null;
  let lastRoadR = -1;
  let lastRoadBlockSpacing = 0;
  let lastRoadStreetWidth = 0;

  const rebuildRoads = (r: number, blockSpacing: number, streetWidth: number) => {
    if (
      r === lastRoadR &&
      blockSpacing === lastRoadBlockSpacing &&
      streetWidth === lastRoadStreetWidth
    ) return;
    lastRoadR = r;
    lastRoadBlockSpacing = blockSpacing;
    lastRoadStreetWidth = streetWidth;

    if (r === 0) {
      if (asphaltMesh) asphaltMesh.count = 0;
      if (dashMesh) dashMesh.count = 0;
      if (sidewalkMesh) sidewalkMesh.count = 0;
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) if (m) m.count = 0;
      roadCull = null;
      sidewalkCull = null;
      lampCull = null;
      return; // bloco único, sem estradas entre blocos
    }

    // Asfalto: rua menos a reserva das calçadas (`SIDEWALK_RESERVE`) — fica mais
    // estreito que a rua. A calçada (`rebuildSidewalks`) preenche o resto.
    const roadWidth = Math.max(1.0, streetWidth - SIDEWALK_RESERVE);
    // Meia-largura do cruzamento onde a faixa central é apagada (= largura da via
    // perpendicular, + folga) — evita o conflito de faixas no cruzamento.
    const interHalf = roadWidth / 2 + 0.15;

    // Comprimento: estende até a borda EXTERNA das quadras mais externas, pra o asfalto
    // chegar ao final do loteamento (não parar nas interseções internas).
    // blockFootprint = blockSpacing - streetWidth; meia-extensão = r*blockSpacing + blockFootprint/2,
    // então o comprimento total = 2*(r*blockSpacing + blockFootprint/2) = 2*r*blockSpacing + blockFootprint.
    const blockFootprint = blockSpacing - streetWidth;
    const totalLen = 2 * r * blockSpacing + blockFootprint;
    const roadY = -0.015;
    const dashY = roadY + 0.005;
    const dashSpacing = 1.0; // espaçamento físico (unidades) de cada ciclo traço+vão
    const dashWidth = roadWidth * 0.02;
    // Uma via fatiada em 2r+1 segmentos ≈ 1 por fileira de quadras: granularidade do
    // cull sem custo de draw call (instâncias do mesmo mesh).
    const segCount = 2 * r + 1;
    const segLen = totalLen / segCount;
    const needed = 2 * (2 * r) * segCount; // vias longitudinais + transversais

    if (!asphaltMesh || needed > roadCapacity) {
      for (const m of [asphaltMesh, dashMesh]) {
        if (!m) continue;
        scene.remove(m);
        m.dispose();
      }
      roadCapacity = Math.max(64, Math.ceil(needed * 1.5));
      asphaltMesh = new THREE.InstancedMesh(roadSegmentGeometry, asphaltMaterial, roadCapacity);
      dashMesh = new THREE.InstancedMesh(roadSegmentGeometry, dashMaterial, roadCapacity);
      for (const m of [asphaltMesh, dashMesh]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(m);
      }
    }
    dashMaterial.uniforms.dashSpacing.value = dashSpacing;
    dashMaterial.uniforms.blockSpacing.value = blockSpacing;
    dashMaterial.uniforms.interHalf.value = interHalf;

    let idx = 0;
    // `alongX` = via correndo em X (transversal); senão corre em Z (longitudinal).
    const addSegment = (cx: number, cz: number, alongX: boolean, length: number) => {
      // +0.002 de overlap entre segmentos vizinhos: coplanares e da mesma cor, então o
      // z-fighting é invisível — a costura de um gap de arredondamento não seria.
      const span = length + 0.002;
      roadDummy.rotation.set(0, 0, 0);
      roadDummy.position.set(cx, roadY, cz);
      roadDummy.scale.set(alongX ? span : roadWidth, 1, alongX ? roadWidth : span);
      roadDummy.updateMatrix();
      asphaltMesh!.setMatrixAt(idx, roadDummy.matrix);
      roadDummy.position.set(cx, dashY, cz);
      roadDummy.scale.set(alongX ? length : dashWidth, 1, alongX ? dashWidth : length);
      roadDummy.updateMatrix();
      dashMesh!.setMatrixAt(idx, roadDummy.matrix);
      idx++;
    };

    // Faixas longitudinais (direção Z), entre colunas de blocos (separação em X)
    for (let bx = -r; bx < r; bx++) {
      const x = (bx + 0.5) * blockSpacing;
      for (let i = 0; i < segCount; i++) {
        addSegment(x, -totalLen / 2 + (i + 0.5) * segLen, false, segLen);
      }
    }

    // Faixas transversais (direção X), entre linhas de blocos (separação em Z)
    for (let bz = -r; bz < r; bz++) {
      const z = (bz + 0.5) * blockSpacing;
      for (let i = 0; i < segCount; i++) {
        addSegment(-totalLen / 2 + (i + 0.5) * segLen, z, true, segLen);
      }
    }

    for (const m of [asphaltMesh, dashMesh]) {
      m!.count = idx;
      m!.instanceMatrix.needsUpdate = true;
      m!.computeBoundingSphere();
    }
    roadCull = snapshotInstances([asphaltMesh, dashMesh], idx);

    // Calçadas elevadas em volta de cada quadra, preenchendo o resto da rua
    rebuildSidewalks(r, blockSpacing, streetWidth, roadWidth);
    rebuildStreetLamps(r, blockSpacing, streetWidth, roadWidth);
    cullGroundInstances();
  };

  // --- Lotes vazios (loteamento esperando edifícios) ---
  // Cada slot de quadra sem edifício recebe um tile de chão demarcado. Junto com o
  // asfalto, isso deixa a cena povoada mesmo com poucas/zero doações e some sob os
  // prédios conforme o loteamento é preenchido. InstancedMesh = 1 draw call pra todos.
  const LOT_TILE_SIZE = DONATION_LAYOUT.slotSize - 0.5; // gap entre tiles = divisão dos lotes
  const LOT_HALF = (LOT_TILE_SIZE / 2).toFixed(4);
  const LOT_Y = -0.012; // acima da zona plana do relevo (-0.04) e do plano cinza (-0.03)
  const lotGeometry = new THREE.PlaneGeometry(LOT_TILE_SIZE, LOT_TILE_SIZE);
  lotGeometry.rotateX(-Math.PI / 2); // deita o plano no chão; matriz de instância só translada
  const lotMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blockLayoutSettings.lotColor), // cor configurável das quadras
    roughness: 0.98,
    metalness: 0.0,
  });
  // Borda escura demarcando cada lote (estilo planta de loteamento). Injetada no
  // MeshStandardMaterial pra manter iluminação + recebimento de sombra do pipeline.
  lotMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec2 vLotPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vLotPos = position.xz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec2 vLotPos;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 lotA = abs(vLotPos) / ${LOT_HALF};
      float lotBorder = smoothstep(0.80, 0.96, max(lotA.x, lotA.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42, lotBorder);`,
    );
  };

  const lotDummy = new THREE.Object3D();
  let lotCapacity = 0;
  let lotMesh: THREE.InstancedMesh | null = null;

  const rebuildLots = (positions: ReadonlyArray<[number, number]>) => {
    const needed = positions.length;
    if (needed === 0) {
      if (lotMesh) lotMesh.count = 0;
      lotCull = null;
      return;
    }
    let m = lotMesh;
    if (!m || needed > lotCapacity) {
      if (m) {
        scene.remove(m);
        m.dispose();
      }
      lotCapacity = Math.max(64, Math.ceil(needed * 1.5));
      m = new THREE.InstancedMesh(lotGeometry, lotMaterial, lotCapacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      lotMesh = m;
    }
    for (let i = 0; i < needed; i++) {
      lotDummy.position.set(positions[i][0], LOT_Y, positions[i][1]);
      lotDummy.updateMatrix();
      m.setMatrixAt(i, lotDummy.matrix);
    }
    m.count = needed;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    lotCull = snapshotInstances([m], needed);
    cullGroundInstances();
  };

  const donations: DonationEntry[] = [];
  const donationById = new Map<number, DonationEntry>();
  let nextId = 0;
  // Meio-extensão (mundo) da cidade construída. Consumido pelo relevo para abrir a zona plana.
  let cityHalfExtent = 0;
  let currentTextureSettings = { ...textureSettings };
  let currentBlockLayout = { ...blockLayoutSettings };
  const dummy = new THREE.Object3D();
  // Cull de distância dos prédios: o buffer renderizado é compactado para que
  // `mesh.count` contenha só instâncias visíveis (zero-scale ainda gastaria vértices).
  let renderDistanceSq = Infinity;
  let backDistanceSq = Infinity;
  let logicalInstanceCount = 0;
  let instanceHidden = new Uint8Array(0);
  // Grupo de fachada (= textura) de cada instância lógica. Uint8 = teto de 256
  // texturas simultâneas, folgado pro catálogo curado.
  let instanceGroup = new Uint8Array(0);
  let useInstanceColors = false;
  let logicalInstanceColorArray = new Float32Array(0);
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(1);
  raycaster.layers.enable(2);
  const mouseVec = new THREE.Vector2();
  const instanceToValue: number[] = [];
  const instanceToDonationId: number[] = [];
  const donationIdToInstanceIndex = new Map<number, number>();
  const instanceRenderIndices: number[] = [];
  const donationTransforms = new Map<number, { position: THREE.Vector3; scale: THREE.Vector3 }>();
  // Arrays paralelos por índice de instância (posição + meia-extensão do AABB).
  // Culling e picking a 100k leem daqui — donationTransforms.get() por instância
  // a cada tick custava 100k lookups de Map (hitches de vários ms).
  let instPosX = new Float32Array(0);
  let instPosY = new Float32Array(0);
  let instPosZ = new Float32Array(0);
  let instHalfX = new Float32Array(0);
  let instHalfY = new Float32Array(0);
  let instHalfZ = new Float32Array(0);
  // Picking: 1 AABB por quadra + faixa contígua de instâncias (preenchidas quadra
  // a quadra no rebuildInstances). Raycast testa ~centenas de quadras, depois só
  // as instâncias das quadras atingidas — prédio default é caixa, AABB é hit exato.
  type PickBlock = {
    minX: number; maxX: number; minZ: number; maxZ: number; maxY: number;
    start: number; end: number;
    viewCulled: boolean;
  };
  const pickBlocks: PickBlock[] = [];
  // Prédios com formato customizado (ex: twisted) renderizam como Mesh próprio
  // — pulam alocação no InstancedMesh e mantêm clones de material por edifício.
  type CustomShapeEntry = {
    mesh: THREE.Mesh;
    facadeMat: THREE.MeshPhysicalMaterial;
    topMat: THREE.MeshPhysicalMaterial;
    shape: BuildingShape;
  };
  const customShapeMeshes = new Map<number, CustomShapeEntry>();
  const customShapesHiddenBeforeCapture: number[] = [];
  const currentBuildingColor = new THREE.Color(buildingSettings.color);
  // No shader, instanceColor é MULTIPLICADO pela cor do material
  // (`diffuseColor *= vColor`). Logo, enquanto o InstancedMesh tiver instanceColor,
  // a base dos materiais tem que ser branca — senão a cor sai ao quadrado e todos
  // os prédios escurecem no instante em que um único recebe cor customizada.
  const INSTANCE_COLOR_BASE = new THREE.Color(0xffffff);
  // Só a fachada: o topo descarta o instanceColor no shader, então mantém TOP_CEMENT_COLOR.
  const setInstancedBaseColor = (color: THREE.Color) => {
    for (const group of facadeGroups) group.material.color.copy(color);
  };
  const tmpTransformMatrix = new THREE.Matrix4();
  const tmpTransformPosition = new THREE.Vector3();
  const tmpTransformQuaternion = new THREE.Quaternion();
  const tmpTransformScale = new THREE.Vector3();

  const compactVisibleInstances = (includeCulled = false) => {
    instanceRenderIndices.length = logicalInstanceCount;
    instanceRenderIndices.fill(-1);
    for (const group of facadeGroups) {
      group.renderCount = 0;
      group.matricesChanged = false;
      group.colorsChanged = false;
    }
    for (let logicalIndex = 0; logicalIndex < logicalInstanceCount; logicalIndex++) {
      if (!includeCulled && instanceHidden[logicalIndex]) continue;
      if (instanceToDonationId[logicalIndex] === focusedDonationId) continue;
      const group = facadeGroups[instanceGroup[logicalIndex]] ?? facadeGroups[0];
      const renderIndex = group.renderCount;
      // Capacidade é dimensionada no rebuild; a guarda cobre o caso de o grupo
      // ter recebido instância fora dele (nunca deve acontecer).
      if (renderIndex >= group.capacity) continue;
      instanceRenderIndices[logicalIndex] = renderIndex;

      tmpTransformPosition.set(
        instPosX[logicalIndex],
        instPosY[logicalIndex],
        instPosZ[logicalIndex],
      );
      tmpTransformScale.set(
        instHalfX[logicalIndex] * 2,
        instHalfY[logicalIndex] * 2,
        instHalfZ[logicalIndex] * 2,
      );
      tmpTransformQuaternion.identity();
      tmpTransformMatrix.compose(
        tmpTransformPosition,
        tmpTransformQuaternion,
        tmpTransformScale,
      );
      const matrices = group.mesh.instanceMatrix.array;
      for (let f = 0; f < 16; f++) {
        const index = renderIndex * 16 + f;
        const value = Math.fround(tmpTransformMatrix.elements[f]);
        if (matrices[index] === value) continue;
        matrices[index] = value;
        group.matricesChanged = true;
      }

      if (useInstanceColors) {
        const source = logicalIndex * 3;
        const target = renderIndex * 3;
        for (let f = 0; f < 3; f++) {
          const value = logicalInstanceColorArray[source + f];
          if (group.colors[target + f] === value) continue;
          group.colors[target + f] = value;
          group.colorsChanged = true;
        }
      }
      group.renderCount++;
    }

    for (const group of facadeGroups) {
      if (group.matricesChanged || group.renderCount > group.mesh.count) group.mesh.boundingSphere = null;
      group.mesh.count = group.renderCount;
      if (group.matricesChanged && group.renderCount > 0) {
        group.mesh.instanceMatrix.addUpdateRange(0, group.renderCount * 16);
        group.mesh.instanceMatrix.needsUpdate = true;
      }
      if (useInstanceColors) {
        if (
          !group.mesh.instanceColor ||
          group.mesh.instanceColor.array !== group.colors
        ) {
          group.mesh.instanceColor = new THREE.InstancedBufferAttribute(group.colors, 3);
          group.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        if (group.colorsChanged && group.renderCount > 0) {
          group.mesh.instanceColor.addUpdateRange(0, group.renderCount * 3);
          group.mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  };

  const setInstanceMetadata = (
    instanceIndex: number,
    donationId: number,
    value: number,
    groupIndex: number,
  ) => {
    instanceToValue[instanceIndex] = value;
    instanceToDonationId[instanceIndex] = donationId;
    donationIdToInstanceIndex.set(donationId, instanceIndex);
    instanceGroup[instanceIndex] = groupIndex;
    facadeGroups[groupIndex].logicalCount++;
    // dummy já está posicionado/escalado pelo chamador (rebuildInstances)
    instPosX[instanceIndex] = dummy.position.x;
    instPosY[instanceIndex] = dummy.position.y;
    instPosZ[instanceIndex] = dummy.position.z;
    instHalfX[instanceIndex] = dummy.scale.x / 2;
    instHalfY[instanceIndex] = dummy.scale.y / 2;
    instHalfZ[instanceIndex] = dummy.scale.z / 2;
  };

  // Lê position/scale lógicos da doação a partir de um map, independentemente
  // de o prédio ser renderizado via InstancedMesh ou como mesh customizado (twisted).
  // Acessórios (rooftop, sign, edge light) usam essa rota única para sincronização.
  const readDonationTransform = (donationId: number) => {
    const transform = donationTransforms.get(donationId);
    if (!transform) return false;
    tmpTransformPosition.copy(transform.position);
    tmpTransformScale.copy(transform.scale);
    tmpTransformQuaternion.identity();
    tmpTransformMatrix.compose(
      tmpTransformPosition,
      tmpTransformQuaternion,
      tmpTransformScale,
    );
    return true;
  };

  // Picking sem raycast no InstancedMesh: three itera as 100k instâncias por
  // mousemove (O(n) interno) — trava o hover. Aqui: intersectsBox nos ~1,6k AABBs
  // de quadra (µs), depois Ray.intersectBox só nas instâncias das quadras atingidas
  // (~dezenas). Custom shapes (poucos) seguem raycaster normal; vence o mais perto.
  const pickBox = new THREE.Box3();
  const pickPoint = new THREE.Vector3();

  const pickAt = (
    event: MouseEvent,
    camera: THREE.Camera,
    domElement: HTMLElement,
  ): { donationId: number; value: number } | null => {
    const rect = domElement.getBoundingClientRect();
    mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    const ray = raycaster.ray;

    let bestIndex = -1;
    let bestDist = Infinity;
    for (const blk of pickBlocks) {
      pickBox.min.set(blk.minX, 0, blk.minZ);
      pickBox.max.set(blk.maxX, blk.maxY, blk.maxZ);
      if (!ray.intersectsBox(pickBox)) continue;
      for (let i = blk.start; i < blk.end; i++) {
        if (instanceHidden[i]) continue; // culled = invisível = não pickável
        pickBox.min.set(instPosX[i] - instHalfX[i], instPosY[i] - instHalfY[i], instPosZ[i] - instHalfZ[i]);
        pickBox.max.set(instPosX[i] + instHalfX[i], instPosY[i] + instHalfY[i], instPosZ[i] + instHalfZ[i]);
        if (!ray.intersectBox(pickBox, pickPoint)) continue;
        const dist = pickPoint.distanceTo(ray.origin);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }
    }

    // Custom shapes: geometria não é caixa — raycaster normal (poucas unidades)
    let customHit: THREE.Intersection | null = null;
    if (customShapeMeshes.size > 0) {
      const targets: THREE.Object3D[] = [];
      for (const entry of customShapeMeshes.values()) targets.push(entry.mesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) customHit = hits[0];
    }

    if (bestIndex >= 0 && (!customHit || bestDist <= customHit.distance)) {
      return { donationId: instanceToDonationId[bestIndex], value: instanceToValue[bestIndex] };
    }
    if (customHit) {
      const id = customHit.object.userData.donationId;
      const value = customHit.object.userData.donationValue;
      if (typeof id === "number" && typeof value === "number") return { donationId: id, value };
    }
    return null;
  };

  const getAllFacadeMaterials = (): THREE.MeshPhysicalMaterial[] => {
    const list: THREE.MeshPhysicalMaterial[] = [focusFacadeMaterial];
    for (const group of facadeGroups) list.push(group.material);
    for (const entry of customShapeMeshes.values()) list.push(entry.facadeMat);
    return list;
  };

  const getAllTopMaterials = (): THREE.MeshPhysicalMaterial[] => {
    const list: THREE.MeshPhysicalMaterial[] = [topMaterial, focusTopMaterial];
    for (const entry of customShapeMeshes.values()) list.push(entry.topMat);
    return list;
  };

  const textureDefineMask = (mat: THREE.MeshPhysicalMaterial) =>
    Number(Boolean(mat.map)) |
    (Number(Boolean(mat.normalMap)) << 1) |
    (Number(Boolean(mat.roughnessMap)) << 2) |
    (Number(Boolean(mat.metalnessMap)) << 3) |
    (Number(Boolean(mat.bumpMap)) << 4) |
    (Number(Boolean(mat.displacementMap)) << 5) |
    (Number(Boolean(mat.emissiveMap)) << 6);

  // Um material só. Chamado em lote (applyTextureToFacade) e isolado quando o set
  // de um prédio específico chega do loader.
  const applyFacadeMaterial = (
    mat: THREE.MeshPhysicalMaterial,
    settings: TextureSettings,
  ) => {
    if (isTexturelessMaterial(mat)) return;
    const set = facadeSetFor(mat);
    const previousMask = textureDefineMask(mat);
    if (settings.enabled && set) {
      mat.map = set.color;
      mat.normalMap = settings.normalScale !== 0 ? set.normal : null;
      mat.normalScale.set(settings.normalScale, settings.normalScale);
      mat.roughnessMap = settings.roughnessIntensity > 0 ? set.roughness : null;
      mat.metalnessMap = settings.metalnessIntensity !== 0 ? set.metalness : null;
      mat.roughness = settings.roughnessIntensity;
      mat.metalness = settings.metalnessIntensity;
      // Sem normalMap, o displacement fornece o bump; os dois não se somam no shader.
      mat.bumpMap = mat.normalMap ? null : set.displacement;
      // Com scale 0 o displacement é um fetch de vértice inútil — só liga quando ativo.
      mat.displacementMap = settings.displacementScale > 0 ? set.displacement : null;
      mat.displacementScale = settings.displacementScale;
      mat.emissiveMap = settings.emissiveIntensity > 0 ? set.color : null;
    } else {
      mat.map = null;
      mat.normalMap = null;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.bumpMap = null;
      mat.displacementMap = null;
      mat.displacementScale = 0;
      mat.emissiveMap = null;
    }
    mat.emissiveIntensity = settings.emissiveIntensity;
    mat.envMapIntensity = facadeEnvMapIntensity(settings);
    if (previousMask !== textureDefineMask(mat)) mat.needsUpdate = true;
  };

  const applyTextureToFacade = (settings: TextureSettings) => {
    for (const mat of getAllFacadeMaterials()) applyFacadeMaterial(mat, settings);
  };

  const applyTextureToTop = (settings: TextureSettings) => {
    const top = settings.top;
    const targets = getAllTopMaterials();
    for (const mat of targets) {
      if (isTexturelessMaterial(mat)) continue;
      const previousMask = textureDefineMask(mat);
      if (settings.enabled && topSet) {
        mat.map = topSet.color;
        mat.normalMap = top.normalScale !== 0 ? topSet.normal : null;
        mat.normalScale.set(top.normalScale, top.normalScale);
        mat.roughnessMap = top.roughnessIntensity > 0 ? topSet.roughness : null;
        mat.roughness = top.roughnessIntensity;
        mat.metalness = top.metalnessIntensity;
        mat.bumpMap = mat.normalMap ? null : topSet.displacement;
        mat.displacementMap = top.displacementScale > 0 ? topSet.displacement : null;
        mat.displacementScale = top.displacementScale;
      } else {
        mat.map = null;
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.bumpMap = null;
        mat.displacementMap = null;
        mat.displacementScale = 0;
      }
      mat.envMapIntensity = top.envMapIntensity;
      if (previousMask !== textureDefineMask(mat)) mat.needsUpdate = true;
    }
    // Pedra/reboco dos autorais usa o mesmo concreto do topo (chega async, liga/desliga junto).
    for (const entry of customShapeMeshes.values()) {
      if (entry.shape === "residential" || entry.shape === "apartment" || entry.shape === "gourmet" || entry.shape === "loft") {
        setResidentialStoneMaps(entry.facadeMat, settings.enabled ? topSet : null);
      }
    }
    parapets.updateTexture(topMaterial);
  };

  const facadeLoadOptions = () => ({
    normal: currentTextureSettings.normalScale !== 0,
    roughness: currentTextureSettings.roughnessIntensity > 0,
    metalness: currentTextureSettings.metalnessIntensity !== 0,
    displacement: currentTextureSettings.displacementScale > 0,
    bump: true,
  });
  let topRequestKey = "";
  let stoneTexturesNeeded = false;
  const requestTopSet = () => {
    if (!currentTextureSettings.enabled) return;
    // Pedra autoral usa normal/roughness independentemente dos controles do topo.
    const top = currentTextureSettings.top;
    const options = {
      normal: stoneTexturesNeeded || top.normalScale !== 0,
      roughness: stoneTexturesNeeded || top.roughnessIntensity > 0,
      metalness: false,
      displacement: top.displacementScale > 0 || top.normalScale === 0,
      bump: true,
    };
    const key = JSON.stringify(options);
    if (topRequestKey === key) return;
    topRequestKey = key;
    void loadFacadeTextureSet(TOP_TEXTURE_FOLDER, maxAniso, options).then((set) => {
      if (!set || disposed) return;
      topSet = set;
      applyTextureToTop(currentTextureSettings);
    });
  };

  // Troca da textura GLOBAL de fachada. O token descarta resolução de uma seleção
  // que já foi superada por outra (usuário clicando rápido no seletor).
  let facadeRequestToken = 0;
  const requestGlobalFacadeSet = (value: string) => {
    const token = ++facadeRequestToken;
    const cached = peekFacadeTextureSet(value);
    if (cached) {
      facadeSet = cached;
      applyTextureToFacade(currentTextureSettings);
    }
    if (!currentTextureSettings.enabled) return;
    void loadFacadeTextureSet(value, maxAniso, facadeLoadOptions())
      .then((set) => {
        // Pasta inexistente: cai no padrão em vez de deixar a cidade sem textura.
        if (set || resolveFacadeFolder(value) === DEFAULT_FACADE_FOLDER) return set;
        return loadFacadeTextureSet(DEFAULT_FACADE_FOLDER, maxAniso, facadeLoadOptions());
      })
      .then((set) => {
        if (!set || disposed || token !== facadeRequestToken) return;
        facadeSet = set;
        applyTextureToFacade(currentTextureSettings);
      });
  };

  applyTextureToFacade(textureSettings);
  applyTextureToTop(textureSettings);
  requestGlobalFacadeSet(textureSettings.textureKey);
  requestTopSet();

  // Expande os arrays lógicos e as posições de espiral quando o total excede a
  // capacidade atual. Os InstancedMesh são dimensionados por grupo no rebuild
  // (ver ensureGroupCapacity), já com a contagem real de cada textura.
  const growIfNeeded = (needed: number) => {
    if (needed <= capacity) return;
    while (capacity < needed) capacity = Math.ceil(capacity * 1.5);
    if (spiralPositions.length < capacity) {
      spiralPositions = generateSpiralPositions(capacity);
    }
  };

  // Sistema de 2 camadas: torres + base urbana.
  //
  // Torres (top towerRatio%) usam o range completo de altura e ocupam os N slots
  // mais centrais de cada quadra (towersPerBlock por quadra), em espiral.
  //
  // Base urbana (restante) usa teto de altura reduzido (baseHeightCap × maxSceneHeight)
  // e é embaralhada deterministicamente nos slots restantes de todas as quadras.
  // Define se a doação precisa virar um Mesh dedicado (saindo do InstancedMesh).
  // Dispara quando o formato é diferente de "default" ou quando há customização
  // que exige estado de material próprio (ex: tilingScale ≠ 1.0).
  const needsCustomMesh = (c?: BuildingCustomization): boolean => {
    if (!c) return false;
    if (c.buildingShape !== "default") return true;
    if (Math.abs(c.tilingScale - 1) > 0.001) return true;
    if (!isDefaultTextureTransform(c.textureTransform)) return true;
    if (hasUngroupedFacadeTexture(c)) return true;
    return false;
  };

  // Textura por edifício só custa um mesh dedicado quando NÃO existe grupo pra
  // ela (pasta fora do pool do catálogo). Com grupo, o prédio entra no
  // InstancedMesh daquela textura — ver facadeGroups.
  const hasUngroupedFacadeTexture = (c?: BuildingCustomization): boolean => {
    if (!hasOwnFacadeTexture(c)) return false;
    return !groupIndexByFolder.has(resolveFacadeFolder(c!.textureKey));
  };

  // Textura própria = diferente da global da cena.
  const hasOwnFacadeTexture = (c?: BuildingCustomization): boolean => {
    if (!c?.textureKey) return false;
    return (
      resolveFacadeFolder(c.textureKey) !==
      resolveFacadeFolder(currentTextureSettings.textureKey)
    );
  };

  // Grupo (textura) de uma doação: a escolhida na customização, senão o sorteio
  // determinístico pelo id sobre o pool do catálogo, senão a textura global.
  const facadeGroupFor = (donation: DonationEntry): number => {
    const own = resolveFacadeFolder(donation.customization?.textureKey);
    if (own) return groupIndexByFolder.get(own) ?? 0;
    if (randomGroupIndices.length === 0) return 0;
    return randomGroupIndices[pickIndex(donation.id, FACADE_VARIANT_SEED, randomGroupIndices.length)];
  };

  // Reconstrói a lista de grupos a partir do pool + textura global atual.
  // Chamado quando o catálogo chega e quando a textura global muda (a pasta
  // global sempre vira o grupo 0, então o mapa pasta→grupo muda junto).
  const rebuildFacadeGroups = () => {
    for (let i = facadeGroups.length - 1; i >= 1; i--) {
      const group = facadeGroups[i];
      scene.remove(group.mesh);
      group.mesh.dispose();
      group.material.dispose();
    }
    facadeGroups.length = 1;
    groupIndexByFolder.clear();
    groupIndexByFolder.set(resolveFacadeFolder(currentTextureSettings.textureKey), 0);
    randomGroupIndices = [];

    for (const key of facadeTexturePool) {
      const folder = resolveFacadeFolder(key);
      // Pasta cadastrada no catálogo mas ausente do bundle: ignora (o prédio cai
      // na textura global em vez de ficar sem textura).
      if (!folder || !getFacadeMapUrls(folder)) continue;
      let index = groupIndexByFolder.get(folder);
      if (index === undefined) {
        if (facadeGroups.length >= 256) break; // teto do Uint8Array de instanceGroup
        const material = facadeMaterial.clone();
        applyTriplanarShader(material, "donation-facade-triplanar", tilingUniform);
        index = facadeGroups.length;
        facadeGroups.push(createFacadeGroup(folder, material));
        groupIndexByFolder.set(folder, index);
        applyFacadeFolder(material, folder);
      }
      if (!randomGroupIndices.includes(index)) randomGroupIndices.push(index);
    }
  };

  // Aplica no material clonado de UM prédio a textura própria dele; sem própria,
  // a do sorteio (mesma de facadeGroupFor) — senão formato custom fugia do sorteio.
  // "" = herda a global. Idempotente: rechamar com a mesma pasta não faz nada,
  // então syncCustomShapes pode chamar em todo rebuild sem custo.
  const materialFacadeKeys = new WeakMap<THREE.Material, string>();
  const applyBuildingFacadeTexture = (facadeMat: THREE.MeshPhysicalMaterial, donation: DonationEntry) => {
    const group = facadeGroupFor(donation);
    applyFacadeFolder(
      facadeMat,
      hasOwnFacadeTexture(donation.customization)
        ? resolveFacadeFolder(donation.customization!.textureKey)
        : group === 0 ? "" : facadeGroups[group].folder,
    );
  };

  const applyFacadeFolder = (facadeMat: THREE.MeshPhysicalMaterial, desired: string, refresh = false) => {
    if (!refresh && materialFacadeKeys.get(facadeMat) === desired) return;
    materialFacadeKeys.set(facadeMat, desired);

    if (!desired) {
      materialFacadeSets.delete(facadeMat);
      applyFacadeMaterial(facadeMat, currentTextureSettings);
      return;
    }
    const cached = peekFacadeTextureSet(desired);
    if (cached) {
      materialFacadeSets.set(facadeMat, cached);
      applyFacadeMaterial(facadeMat, currentTextureSettings);
    }
    if (!currentTextureSettings.enabled) return;
    void loadFacadeTextureSet(desired, maxAniso, facadeLoadOptions()).then((set) => {
      // Seleção mudou enquanto baixava — descarta o resultado velho.
      if (!set || disposed || materialFacadeKeys.get(facadeMat) !== desired) return;
      materialFacadeSets.set(facadeMat, set);
      applyFacadeMaterial(facadeMat, currentTextureSettings);
    });
  };

  const isDefaultTextureTransform = (textureTransform?: BuildingTextureTransform): boolean => {
    const transform = textureTransform ?? DEFAULT_BUILDING_TEXTURE_TRANSFORM;
    return (
      Math.abs(transform.scaleX - DEFAULT_BUILDING_TEXTURE_TRANSFORM.scaleX) <= 0.001 &&
      Math.abs(transform.scaleY - DEFAULT_BUILDING_TEXTURE_TRANSFORM.scaleY) <= 0.001 &&
      Math.abs(transform.offsetX - DEFAULT_BUILDING_TEXTURE_TRANSFORM.offsetX) <= 0.001 &&
      Math.abs(transform.offsetY - DEFAULT_BUILDING_TEXTURE_TRANSFORM.offsetY) <= 0.001
    );
  };

  const sameTextureTransform = (
    a?: BuildingTextureTransform,
    b?: BuildingTextureTransform,
  ): boolean => {
    const ta = a ?? DEFAULT_BUILDING_TEXTURE_TRANSFORM;
    const tb = b ?? DEFAULT_BUILDING_TEXTURE_TRANSFORM;
    return (
      Math.abs(ta.scaleX - tb.scaleX) <= 0.001 &&
      Math.abs(ta.scaleY - tb.scaleY) <= 0.001 &&
      Math.abs(ta.offsetX - tb.offsetX) <= 0.001 &&
      Math.abs(ta.offsetY - tb.offsetY) <= 0.001
    );
  };

  const setMaterialTextureTransform = (
    material: THREE.MeshPhysicalMaterial,
    textureTransform?: BuildingTextureTransform,
  ) => {
    const transform = textureTransform ?? DEFAULT_BUILDING_TEXTURE_TRANSFORM;
    const uniform = material.userData.textureTransform as
      | { value: THREE.Vector4 }
      | undefined;
    uniform?.value.set(
      transform.scaleX,
      transform.scaleY,
      transform.offsetX,
      transform.offsetY,
    );
  };

  const recordTransform = (donationId: number) => {
    let transform = donationTransforms.get(donationId);
    if (!transform) {
      transform = { position: new THREE.Vector3(), scale: new THREE.Vector3() };
      donationTransforms.set(donationId, transform);
    }
    transform.position.copy(dummy.position);
    transform.scale.copy(dummy.scale);
  };

  const rebuildInstances = () => {
    finishEntrance();
    donationTransforms.clear();
    instanceToValue.length = 0;
    instanceToDonationId.length = 0;
    donationIdToInstanceIndex.clear();
    pickBlocks.length = 0;
    if (instanceGroup.length < capacity) instanceGroup = new Uint8Array(capacity);
    for (const group of facadeGroups) group.logicalCount = 0;
    if (instPosX.length < capacity) {
      instPosX = new Float32Array(capacity);
      instPosY = new Float32Array(capacity);
      instPosZ = new Float32Array(capacity);
      instHalfX = new Float32Array(capacity);
      instHalfY = new Float32Array(capacity);
      instHalfZ = new Float32Array(capacity);
    }
    if (logicalInstanceColorArray.length < capacity * 3) {
      logicalInstanceColorArray = new Float32Array(capacity * 3);
    }

    const { blockSize, streetWidth, towerRatio, towersPerBlock, baseHeightCap, centerTallest } =
      currentBlockLayout;
    const buildingsPerBlock = blockSize * blockSize;
    const blockFootprint = (blockSize - 1) * DONATION_LAYOUT.slotSize;
    const blockSpacing = blockFootprint + streetWidth;
    const slotOffsets = getBlockSlotOffsets(blockSize);

    // Quadra central = grade ímpar na mesma pegada (ver CENTRAL_BLOCK_TOWER_*).
    // Menos slots que as outras quadras → capacidade própria.
    // ponytail: tile de lote vazio segue o slotSize global, então lote vago da quadra
    // central fica um pouco menor que o espaçamento dela. Só aparece com a cena quase
    // vazia; se incomodar, escalar `lotDummy` por quadra em rebuildLots.
    const centralBlockSize = blockSize % 2 === 0 ? Math.max(1, blockSize - 1) : blockSize;
    const centralSlotOffsets = getBlockSlotOffsets(
      centralBlockSize,
      centralBlockSize > 1 ? blockFootprint / (centralBlockSize - 1) : 0,
    );
    const centralCapacity = centralBlockSize * centralBlockSize;
    const capacityOf = (b: number) => (b === 0 ? centralCapacity : buildingsPerBlock);
    const slotsOf = (b: number) => (b === 0 ? centralSlotOffsets : slotOffsets);
    const tpb = Math.max(1, Math.min(towersPerBlock, centralCapacity));

    // Loteamento: a cena sempre mostra a grade de quadras (asfalto + lotes vazios)
    // mesmo com poucas/zero doações. Com 0 doação, só renderiza o loteamento vazio.
    const hasDonations = donations.length > 0;
    const maxValue = hasDonations ? donations[0].value : 1;
    // Modo "mais alto no centro" ignora a divisão torre/base: uma curva de altura só.
    const towerCount =
      hasDonations && !centerTallest ? Math.max(1, Math.round(donations.length * towerRatio)) : 0;
    const baseMaxHeight = DONATION_LAYOUT.maxSceneHeight * baseHeightCap;

    // Camada do meio = metade do que sobrou depois do topo. Recebe as quadras centrais
    // como prêmio de posição; a altura dela vive na faixa do meio da régua.
    const midCount = Math.max(0, Math.round((donations.length - towerCount) / 2));
    const midEnd = towerCount + midCount; // 1º índice da camada de baixo

    // Três faixas de altura encaixadas, sem sobreposição: cada camada ocupa um trecho
    // próprio da régua e nunca invade o da camada acima. É isso que impede um prédio de
    // camada inferior de nascer mais alto que um da superior quando a curva de doações é
    // desigual (antes cada camada era normalizada pelo próprio maior valor, e com doação
    // de cauda longa o degrau invertia).
    const midFloorHeight =
      DONATION_LAYOUT.minBuildingHeight +
      (baseMaxHeight - DONATION_LAYOUT.minBuildingHeight) / 2;
    // Altura dentro de uma faixa: proporcional ao valor entre o menor e o maior da faixa.
    const bandHeight = (
      value: number, firstIdx: number, lastIdx: number, floorH: number, ceilH: number,
    ): number => {
      const hi = donations[firstIdx]?.value ?? value;
      const lo = donations[lastIdx]?.value ?? hi;
      const span = hi - lo;
      const t = span > 0 ? (value - lo) / span : 1;
      return floorH + t * (ceilH - floorH);
    };
    // Modo "mais alto no centro" não usa faixas: régua única, altura direta do valor
    // contra a maior doação da cena. A separação visual ali vem da posição, não da camada.
    const centeredHeight = (value: number): number =>
      DONATION_LAYOUT.minBuildingHeight +
      (maxValue > 0 ? value / maxValue : 0) *
        (DONATION_LAYOUT.maxSceneHeight - DONATION_LAYOUT.minBuildingHeight);

    // Mínimo de quadras necessárias para acomodar torres e base
    const towerBlockCount = Math.ceil(towerCount / tpb);
    const baseSlotsPerBlock = buildingsPerBlock - tpb;
    const baseCount = Math.max(0, donations.length - towerCount);
    // Os slots que a quadra central perdeu contam como base a acomodar em outras quadras.
    const centralDeficit = buildingsPerBlock - centralCapacity;
    const baseBlocksNeeded =
      baseSlotsPerBlock > 0 ? Math.ceil((baseCount + centralDeficit) / baseSlotsPerBlock) : 0;
    // Centralizado preenche slot a slot do centro pra fora, então basta caber o total.
    const totalBlocksMin = centerTallest
      ? Math.ceil((donations.length + centralDeficit) / buildingsPerBlock)
      : Math.max(towerBlockCount, baseBlocksNeeded);

    // Expandir para o próximo anel completo: (2R+1)² garante formato quadrado.
    // Sem isso, blocos parcialmente preenchidos no anel externo criam assimetria visual.
    // Piso MIN_LOTEAMENTO_RADIUS: o loteamento nunca encolhe abaixo desse raio, então
    // a cena já começa povoada e cresce conforme as doações exigem mais quadras.
    let r = MIN_LOTEAMENTO_RADIUS;
    while ((2 * r + 1) ** 2 < totalBlocksMin) r++;
    // Meio-extensão da cidade: centro do bloco mais externo + meia quadra + folga de um slot.
    cityHalfExtent = r * blockSpacing + blockFootprint / 2 + DONATION_LAYOUT.slotSize;
    const expandedBlocks = (2 * r + 1) ** 2;
    const innerBlocks = r === 0 ? 0 : (2 * (r - 1) + 1) ** 2;
    const outerRingSize = expandedBlocks - innerBlocks; // 8R posições no anel externo

    // Garantir que spiralPositions cobre todos os blocos expandidos
    if (spiralPositions.length < expandedBlocks) {
      spiralPositions = generateSpiralPositions(expandedBlocks + 64);
    }

    // Ordenar posições do anel externo por distância Manhattan decrescente da origem.
    // Cantos têm |bx|+|bz| = 2R, meios das arestas têm |bx|+|bz| = R.
    // Assim, ao preencher parcialmente o anel, os cantos ficam preenchidos primeiro,
    // evitando o padrão [8,8,8]/[8,8,0] onde um canto fica vazio.
    // Cantos têm |bx|+|bz| = 2R (maior Manhattan), meios das arestas têm |bx|+|bz| = R.
    // Ordem decrescente → cantos preenchidos primeiro ao preencher o anel parcialmente.
    const outerRingOrder = Array.from({ length: outerRingSize }, (_, i) => innerBlocks + i).sort(
      (a, b) => {
        const [ax, az] = spiralPositions[a];
        const [bx, bz] = spiralPositions[b];
        return (Math.abs(bx) + Math.abs(bz)) - (Math.abs(ax) + Math.abs(az));
      },
    ).reverse();

    const blocks: Array<{ towers: number[]; base: number[] }> = Array.from(
      { length: expandedBlocks },
      () => ({ towers: [], base: [] }),
    );

    if (centerTallest) {
      // Gradiente global: todos os slots da cidade ordenados por distância da origem.
      // `donations` já vem por valor decrescente, então o maior cai no slot central da
      // quadra central e a altura decresce para fora, sem agrupar torre por quadra.
      const allSlots: Array<{ b: number; d2: number }> = [];
      for (let b = 0; b < expandedBlocks; b++) {
        const [bx, bz] = spiralPositions[b];
        const cx = bx * blockSpacing;
        const cz = bz * blockSpacing;
        for (const [ox, oz] of slotsOf(b)) {
          allSlots.push({ b, d2: (cx + ox) ** 2 + (cz + oz) ** 2 });
        }
      }
      // Sort estável: dentro de uma quadra a ordem de empate bate com a de
      // `slotsByOriginDist` (mesmo comparador, mesma origem), que é a usada na colocação.
      allSlots.sort((a, b) => a.d2 - b.d2);
      const take = Math.min(donations.length, allSlots.length);
      for (let i = 0; i < take; i++) blocks[allSlots[i].b].base.push(i);
    } else {
      // Distribuir torres: tpb por quadra; anel interno em ordem espiral, externo por outerRingOrder
      for (let t = 0; t < towerCount; t++) {
        const linearBlock = Math.floor(t / tpb);
        const b = linearBlock < innerBlocks
          ? linearBlock
          : outerRingOrder[linearBlock - innerBlocks];
        if (b !== undefined) blocks[b].towers.push(t);
      }

      // Camada do meio e camada de baixo são sorteadas SEPARADAS e concatenadas com a do
      // meio na frente. As etapas A/B abaixo preenchem do centro pra fora, então a ordem do
      // array vira ordem geográfica: o meio ocupa as quadras centrais, o resto sobra pras de
      // fora. Fisher-Yates com seeded random → mesma cidade a cada reload.
      const shuffleRange = (from: number, to: number): number[] => {
        const out: number[] = [];
        for (let i = from; i < to; i++) out.push(i);
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(seeded(i, out.length, 42) * (i + 1));
          const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
      };
      const baseIndices = [
        ...shuffleRange(towerCount, midEnd),
        ...shuffleRange(midEnd, donations.length),
      ];

      // Etapa A: preencher anel interno até a capacidade normal
      let basePtr = 0;
      for (let b = 0; b < innerBlocks && basePtr < baseIndices.length; b++) {
        const slotsAvailable = capacityOf(b) - blocks[b].towers.length;
        for (let s = 0; s < slotsAvailable && basePtr < baseIndices.length; s++) {
          blocks[b].base.push(baseIndices[basePtr++]);
        }
      }

      // Etapa B: distribuir base restante uniformemente pelo anel externo.
      // Cada posição do anel recebe floor(remaining/outerRingSize) prédios,
      // com o restante (remainder) distribuído às primeiras posições (+1 cada).
      const baseForOuter = baseIndices.length - basePtr;
      if (outerRingSize > 0 && baseForOuter > 0) {
        const perBlock = Math.floor(baseForOuter / outerRingSize);
        const remainder = baseForOuter % outerRingSize;
        for (let i = 0; i < outerRingOrder.length && basePtr < baseIndices.length; i++) {
          const b = outerRingOrder[i];
          const count = perBlock + (i < remainder ? 1 : 0);
          for (let s = 0; s < count && basePtr < baseIndices.length; s++) {
            blocks[b].base.push(baseIndices[basePtr++]);
          }
        }
      }
    }

    // --- Posicionar instâncias ---
    let instanceIdx = 0;
    // Slots de quadra sem edifício → coletados como lotes demarcados (loteamento esperando).
    const emptyLots: Array<[number, number]> = [];

    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      const [bx, bz] = spiralPositions[b];
      const blockCenterX = bx * blockSpacing;
      const blockCenterZ = bz * blockSpacing;
      const blockStartInstance = instanceIdx;

      const occupiedSlots = block.towers.length + block.base.length;
      const isComplete = occupiedSlots === capacityOf(b);

      // Anel de quadras: 0 = quadra central, 1 = quadras coladas nela, 2+ = resto.
      const blockRing = Math.max(Math.abs(bx), Math.abs(bz));
      const isCentralBlock = blockRing === 0;

      // Torres chegam por valor decrescente, então a 1ª e a última do array dão o
      // range de valores da quadra — base do boost de altura da quadra central.
      const centralTowerFloor = isCentralBlock && block.towers.length
        ? donations[block.towers[block.towers.length - 1]].value
        : 0;
      const centralTowerSpan = isCentralBlock && block.towers.length
        ? donations[block.towers[0]].value - centralTowerFloor
        : 0;
      const towerHeightBoost = (value: number): number => {
        if (!isCentralBlock) return blockRing === 1 ? INNER_RING_TOWER_HEIGHT_BOOST : 1;
        if (centralTowerSpan <= 0) return CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MAX;
        return (
          CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MIN +
          ((value - centralTowerFloor) / centralTowerSpan) *
            (CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MAX - CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MIN)
        );
      };
      const towerWidthBoost = isCentralBlock ? CENTRAL_BLOCK_TOWER_WIDTH_BOOST : 1;

      // Bloco completo: slots aleatórios (embaralhados).
      // Bloco incompleto: torres no slot mais próximo ao centro da cena para evitar
      // prédios isolados flutuando longe dos vizinhos. orderedSlots guarda a ordem
      // usada (ocupados primeiro) pra saber quais sobram como lote vazio.
      let towerSlots: Array<[number, number]>;
      let shuffledBaseSlots: Array<[number, number]>;
      let orderedSlots: ReadonlyArray<[number, number]>;

      if (centerTallest) {
        // Slots da quadra na mesma ordem (distância da origem) usada na distribuição
        // global acima — block.base[s] cai exatamente no slot s dessa lista.
        const byOriginDist = [...slotsOf(b)].sort(
          (a, bSlot) =>
            (blockCenterX + a[0]) ** 2 + (blockCenterZ + a[1]) ** 2 -
            ((blockCenterX + bSlot[0]) ** 2 + (blockCenterZ + bSlot[1]) ** 2),
        );
        towerSlots = [];
        shuffledBaseSlots = byOriginDist;
        orderedSlots = byOriginDist;
      } else if (isCentralBlock && block.towers.length > 0) {
        // Maior doação da cena = torre 0 da quadra central → slot exato no centro
        // (centralSlotOffsets vem ordenado do centro pra fora, índice 0 = [0, 0]).
        const [centerSlot, ...restSlots] = centralSlotOffsets;
        const shuffled = shuffleBlockSlots(restSlots, b);
        towerSlots = [centerSlot, ...shuffled.slice(0, block.towers.length - 1)];
        shuffledBaseSlots = shuffled.slice(block.towers.length - 1);
        orderedSlots = [centerSlot, ...shuffled];
      } else if (isComplete) {
        const allSlots = shuffleBlockSlots(slotsOf(b), b);
        towerSlots = allSlots.slice(0, block.towers.length);
        shuffledBaseSlots = allSlots.slice(block.towers.length);
        orderedSlots = allSlots;
      } else {
        const slotsByOriginDist = [...slotsOf(b)].sort(
          (a, bSlot) =>
            (blockCenterX + a[0]) ** 2 + (blockCenterZ + a[1]) ** 2 -
            ((blockCenterX + bSlot[0]) ** 2 + (blockCenterZ + bSlot[1]) ** 2),
        );
        towerSlots = slotsByOriginDist.slice(0, block.towers.length);
        shuffledBaseSlots = slotsByOriginDist.slice(block.towers.length);
        orderedSlots = slotsByOriginDist;
      }

      // Torres nos slots mais próximos da origem da cena
      for (let t = 0; t < block.towers.length; t++) {
        const donIdx = block.towers[t];
        const [ox, oz] = towerSlots[t];
        const height =
          towerHeightBoost(donations[donIdx].value) *
          bandHeight(
            donations[donIdx].value, 0, towerCount - 1,
            baseMaxHeight, DONATION_LAYOUT.maxSceneHeight,
          );
        const id = donations[donIdx].id;
        dummy.position.set(blockCenterX + ox, height / 2, blockCenterZ + oz);
        dummy.scale.set(
          (1.0 + seeded(id, 1) * 1.6) * towerWidthBoost,
          height,
          (1.0 + seeded(id, 2) * 1.6) * towerWidthBoost,
        );
        dummy.updateMatrix();
        recordTransform(id);
        // Prédios com customização que exige estado de material próprio
        // (formato torcido, tilingScale ≠ 1.0, etc) pulam alocação no InstancedMesh —
        // são desenhados como Mesh próprio em syncCustomShapes.
        if (!needsCustomMesh(donations[donIdx].customization)) {
          setInstanceMetadata(
            instanceIdx,
            id,
            donations[donIdx].value,
            facadeGroupFor(donations[donIdx]),
          );
          instanceIdx++;
        }
      }

      // Base urbana nos slots restantes
      for (let s = 0; s < block.base.length; s++) {
        const donIdx = block.base[s];
        const [ox, oz] = shuffledBaseSlots[s];
        const height = centerTallest
          ? centeredHeight(donations[donIdx].value)
          : donIdx < midEnd
            ? bandHeight(donations[donIdx].value, towerCount, midEnd - 1, midFloorHeight, baseMaxHeight)
            : bandHeight(
                donations[donIdx].value, midEnd, donations.length - 1,
                DONATION_LAYOUT.minBuildingHeight, midFloorHeight,
              );
        const id = donations[donIdx].id;
        dummy.position.set(blockCenterX + ox, height / 2, blockCenterZ + oz);
        dummy.scale.set(1.0 + seeded(id, 1) * 1.6, height, 1.0 + seeded(id, 2) * 1.6);
        dummy.updateMatrix();
        recordTransform(id);
        if (!needsCustomMesh(donations[donIdx].customization)) {
          setInstanceMetadata(
            instanceIdx,
            id,
            donations[donIdx].value,
            facadeGroupFor(donations[donIdx]),
          );
          instanceIdx++;
        }
      }

      // Lotes vazios: só dentro do loteamento mínimo inicial (grade 3×3 em r=1),
      // pra cena não começar vazia. Fora dele a cidade cresce por doação real —
      // não semeamos lote vazio pra ela não "crescer junto"; slots vagos do anel
      // externo ficam só chão/asfalto. Slot ocupado nunca vira lote (some sozinho).
      const withinMinLoteamento =
        Math.abs(bx) <= MIN_LOTEAMENTO_RADIUS && Math.abs(bz) <= MIN_LOTEAMENTO_RADIUS;
      if (withinMinLoteamento) {
        for (let s = occupiedSlots; s < orderedSlots.length; s++) {
          emptyLots.push([
            blockCenterX + orderedSlots[s][0],
            blockCenterZ + orderedSlots[s][1],
          ]);
        }
      }

      // AABB da quadra p/ picking: min/max XZ + altura máx. das instâncias dela.
      // Quadras só com custom shapes ficam de fora (raycast próprio em pickAt).
      if (instanceIdx > blockStartInstance) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
        for (let i = blockStartInstance; i < instanceIdx; i++) {
          minX = Math.min(minX, instPosX[i] - instHalfX[i]);
          maxX = Math.max(maxX, instPosX[i] + instHalfX[i]);
          minZ = Math.min(minZ, instPosZ[i] - instHalfZ[i]);
          maxZ = Math.max(maxZ, instPosZ[i] + instHalfZ[i]);
          maxY = Math.max(maxY, instPosY[i] + instHalfY[i]);
        }
        pickBlocks.push({ minX, maxX, minZ, maxZ, maxY, start: blockStartInstance, end: instanceIdx, viewCulled: false });
      }
    }

    logicalInstanceCount = instanceIdx;

    // Layout reescreveu todas as matrizes → todas visíveis; próximo passe de cull re-esconde.
    if (instanceHidden.length < capacity) instanceHidden = new Uint8Array(capacity);
    else instanceHidden.fill(0);

    // Cada grupo já sabe quantas instâncias recebeu — dimensiona antes de escrever.
    for (const group of facadeGroups) ensureGroupCapacity(group, group.logicalCount);

    // Aplicar cores individuais (customização) por instância. Sem compactar aqui:
    // a compactação logo abaixo escreve matrizes E cores numa passada só.
    applyInstanceColors(false);
    compactVisibleInstances(true);

    // Reposicionar/criar prédios com formato customizado (twisted)
    syncCustomShapes();

    parapets.rebuild(donations.map((donation) => ({
      id: donation.id,
      shape: donation.customization?.buildingShape ?? "default",
      ...donationTransforms.get(donation.id)!,
    })));

    // Reposicionar acessórios de topo e letreiros
    syncRooftops();
    syncSigns();
    syncEdgeLights();
    syncHolograms();

    rebuildRoads(r, blockSpacing, streetWidth);
    rebuildLots(emptyLots);
  };

  const tmpColor = new THREE.Color();
  let focusedDonationId: number | null = null;
  let focusHighlightMesh: THREE.Mesh | null = null;
  const accessoryOriginalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const accessoryFadeMaterials = new Map<THREE.Material, THREE.Material>();
  const focusLayerMasks = new Map<THREE.Object3D, number>();

  const restoreFocusLayers = () => {
    for (const [object, mask] of focusLayerMasks) object.layers.mask = mask;
    focusLayerMasks.clear();
  };
  const applyFocusLayers = () => {
    restoreFocusLayers();
    if (focusedDonationId === null) return;
    const tag = (root: THREE.Object3D, selected: boolean) => root.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      focusLayerMasks.set(object, object.layers.mask);
      object.layers.set(selected ? 2 : 1);
    });
    for (const group of facadeGroups) tag(group.mesh, false);
    for (const [id, entry] of customShapeMeshes) tag(entry.mesh, id === focusedDonationId);
    for (const entries of [rooftopMeshes, signMeshes, edgeLightMeshes, hologramMeshes]) {
      for (const [id, entry] of entries) tag(entry.group, id === focusedDonationId);
    }
    if (focusHighlightMesh) tag(focusHighlightMesh, true);
  };

  const restoreAccessoryFocus = (dispose = true) => {
    for (const [mesh, material] of accessoryOriginalMaterials) mesh.material = material;
    accessoryOriginalMaterials.clear();
    if (dispose) {
      for (const material of accessoryFadeMaterials.values()) material.dispose();
      accessoryFadeMaterials.clear();
    }
  };

  const applyAccessoryFocus = () => {
    if (compositeFocus) { applyFocusLayers(); return; }
    restoreAccessoryFocus(focusedDonationId === null);
    const used = new Set<THREE.Material>();
    const fadeGroup = (donationId: number, group: THREE.Group) => {
      if (focusedDonationId === null || donationId === focusedDonationId) return;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const fade = (source: THREE.Material) => {
          used.add(source);
          let material = accessoryFadeMaterials.get(source);
          if (!material) {
            material = source.clone();
            material.onBeforeCompile = source.onBeforeCompile;
            material.customProgramCacheKey = source.customProgramCacheKey;
            material.opacity = source.opacity * 0.15;
            material.transparent = true;
            material.depthWrite = false;
            accessoryFadeMaterials.set(source, material);
          }
          return material;
        };
        accessoryOriginalMaterials.set(mesh, mesh.material);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fade) : fade(mesh.material);
      });
    };
    // Coberturas compartilham materiais: os clones esmaecidos não alteram o selecionado.
    for (const [id, entry] of rooftopMeshes) fadeGroup(id, entry.group);
    for (const [id, entry] of signMeshes) fadeGroup(id, entry.group);
    for (const [id, entry] of edgeLightMeshes) fadeGroup(id, entry.group);
    for (const [source, material] of accessoryFadeMaterials) {
      if (used.has(source)) continue;
      material.dispose();
      accessoryFadeMaterials.delete(source);
    }
    for (const [id, entry] of hologramMeshes) {
      const opacity = donationById.get(id)?.customization?.hologramOpacity ?? DEFAULT_HOLOGRAM_OPACITY;
      setHologramOpacity(entry, opacity * (focusedDonationId === null || id === focusedDonationId ? 1 : 0.15));
    }
  };

  const removeFocusHighlight = () => {
    if (focusHighlightMesh) {
      scene.remove(focusHighlightMesh);
      focusHighlightMesh = null;
    }
  };

  const materialFocusState = new WeakMap<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
  // Restaura também transparência/escrita de profundidade autorais (vidros e guarda-corpos).
  const setMatOpacity = (mat: THREE.Material, opacity: number) => {
    let original = materialFocusState.get(mat);
    if (!original) {
      original = { opacity: mat.userData.baseOpacity ?? mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
      materialFocusState.set(mat, original);
    }
    mat.opacity = original.opacity * opacity;
    mat.depthWrite = opacity < 1 ? false : original.depthWrite;
    const transparent = opacity < 1 || original.transparent;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.needsUpdate = true;
    }
  };

  const getCustomShapeMaterials = (entry: CustomShapeEntry): THREE.Material[] => {
    return Array.from(
      new Set(Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]),
    );
  };

  // Materiais autorais de formatos custom (ex: residential) com envMap próprio;
  // marcados por `authoredEnvMapIntensity`: seguem o envMap da cena, zeram na
  // captura e voltam ao valor do builder (não ao envMapIntensity global das fachadas).
  const getAuthoredEnvMaterials = (): THREE.MeshStandardMaterial[] => {
    const list: THREE.MeshStandardMaterial[] = [];
    for (const entry of customShapeMeshes.values()) {
      for (const material of getCustomShapeMaterials(entry)) {
        if (material.userData.authoredEnvMapIntensity !== undefined) {
          list.push(material as THREE.MeshStandardMaterial);
        }
      }
    }
    return list;
  };

  const setCustomShapeOpacity = (entry: CustomShapeEntry, opacity: number) => {
    const materials = getCustomShapeMaterials(entry);
    for (const material of materials) {
      setMatOpacity(material, opacity);
    }
    // O contexto esmaecido continua agrupado: um Empire não pode voltar a 2.293 draws.
    setBuildingShapeMeshBatching(entry.mesh, opacity < 1 || materials.every((material) => !material.transparent));
  };

  const applyFocus = (donationId: number | null) => {
    focusedDonationId = donationId;
    parapets.setFocus(donationId);
    if (!compositeFocus) applyAccessoryFocus();
    removeFocusHighlight();

    if (compositeFocus) {
      applyInstanceColors();
      compactVisibleInstances();
      if (donationId === null || customShapeMeshes.has(donationId)) {
        applyFocusLayers();
        return;
      }
    }

    if (donationId === null) {
      for (const group of facadeGroups) setMatOpacity(group.material, 1);
      setMatOpacity(topMaterial, 1);
      for (const entry of customShapeMeshes.values()) {
        setCustomShapeOpacity(entry, 1);
      }
      applyInstanceColors();
      compactVisibleInstances();
      return;
    }

    if (!compositeFocus) {
      for (const group of facadeGroups) setMatOpacity(group.material, 0.15);
      setMatOpacity(topMaterial, 0.15);
      setInstancedBaseColor(currentBuildingColor);
      useInstanceColors = false;
      clearInstanceColors();
      compactVisibleInstances();

      for (const [donId, entry] of customShapeMeshes) {
        const opacity = donId === donationId ? 1 : 0.15;
        setCustomShapeOpacity(entry, opacity);
      }
    }

    if (customShapeMeshes.has(donationId)) return;

    if (!readDonationTransform(donationId)) return;

    const donation = donationById.get(donationId);
    // Destaque replica a textura do grupo do prédio (sorteada ou escolhida).
    applyFacadeFolder(
      focusFacadeMaterial,
      donation ? facadeGroups[facadeGroupFor(donation)]?.folder ?? "" : "",
    );
    if (donation?.customization) {
      focusFacadeMaterial.color.set(donation.customization.color);
    } else {
      focusFacadeMaterial.color.copy(currentBuildingColor);
    }
    focusTopMaterial.color.copy(topMaterial.color);

    focusHighlightMesh = new THREE.Mesh(buildingGeometry, [focusFacadeMaterial, focusTopMaterial]);
    focusHighlightMesh.applyMatrix4(tmpTransformMatrix);
    scene.add(focusHighlightMesh);
    if (compositeFocus) applyFocusLayers();
  };

  const clearInstanceColors = () => {
    for (const group of facadeGroups) group.mesh.instanceColor = null;
  };

  const applyInstanceColors = (compact = true) => {
    if (logicalInstanceCount === 0) return;

    // O fallback esmaece instâncias sem cor; composição preserva as cores autorais.
    // Verificar se alguma doação tem customização
    const hasAnyCustom = (compositeFocus || focusedDonationId === null) && donations.some((d) => d.customization);
    if (!hasAnyCustom) {
      // Sem customizações: remover instanceColor para usar cor do material
      setInstancedBaseColor(currentBuildingColor);
      useInstanceColors = false;
      clearInstanceColors();
      return;
    }

    // Cor real vai toda no instanceColor → base branca (ver INSTANCE_COLOR_BASE).
    setInstancedBaseColor(INSTANCE_COLOR_BASE);
    useInstanceColors = true;
    for (let i = 0; i < logicalInstanceCount; i++) {
      const donId = instanceToDonationId[i];
      const donation = donationById.get(donId);
      if (donation?.customization) {
        tmpColor.set(donation.customization.color);
      } else {
        tmpColor.copy(currentBuildingColor);
      }
      logicalInstanceColorArray[i * 3] = tmpColor.r;
      logicalInstanceColorArray[i * 3 + 1] = tmpColor.g;
      logicalInstanceColorArray[i * 3 + 2] = tmpColor.b;
    }

    if (compact) compactVisibleInstances();
  };

  // --- Acessórios de topo ---
  // Mapa: donationId → { group, type }
  const rooftopMeshes = new Map<number, { group: THREE.Group; type: RooftopType }>();

  const positionRooftop = (donationId: number, group: THREE.Group) => {
    group.visible = readDonationTransform(donationId);
    if (!group.visible) return;
    const shape = customShapeMeshes.get(donationId)?.shape;
    const isYachthouse = shape === "yachthouse";
    // Residenciais: acessório sobre a casa de máquinas/caixa d'água (topo do mesh), escalado a ela.
    // Yatchcasa: sobre a cobertura em balanço da torre esquerda (abaixo do mastro).
    group.scale.setScalar(
      isYachthouse
        ? YACHTHOUSE_ROOFTOP_SCALE
        : shape === "residential"
          ? RESIDENTIAL_ROOFTOP_SCALE
          : shape === "apartment"
            ? APARTMENT_ROOFTOP_SCALE
            : shape === "gourmet"
              ? GOURMET_ROOFTOP_SCALE
              : shape === "loft"
                ? LOFT_ROOFTOP_SCALE
                : 1,
    );
    group.position.set(
      tmpTransformPosition.x + (isYachthouse ? YACHTHOUSE_TOWER_CENTERS[0] * tmpTransformScale.x : 0),
      tmpTransformPosition.y + (isYachthouse
        ? getYachthouseRoofOffset(tmpTransformScale.y)
        : tmpTransformScale.y * 0.5),
      tmpTransformPosition.z,
    );
  };

  const syncRooftops = () => {
    // Reposicionar todos os acessórios existentes com base nas posições atuais dos edifícios
    for (const [donId, entry] of rooftopMeshes) {
      positionRooftop(donId, entry.group);
    }
  };

  const setRooftop = (donationId: number, type: RooftopType) => {
    // Remover acessório anterior se existir
    const existing = rooftopMeshes.get(donationId);
    if (existing) {
      scene.remove(existing.group);
      disposeRooftopMesh(existing.group);
      rooftopMeshes.delete(donationId);
    }

    if (type === "none") return;

    const scale = getBuildingScale(donationId);
    const group = createRooftopMesh(
      type,
      scale ? { width: scale.x, depth: scale.z } : undefined,
    );
    if (!group) return;
    mergeRooftopParts(group);

    rooftopMeshes.set(donationId, { group, type });
    scene.add(group);

    // Posicionar imediatamente
    positionRooftop(donationId, group);
  };

  // --- Letreiros (signs) ---
  // Mapa: donationId → { group, text, sides }. `sides` é guardado junto
  // para que `syncSigns` possa reconstruir o letreiro quando a altura ou o
  // formato do edifício mudam — sem isso, depois de um rebuildInstances o
  // letreiro fica obsoleto (yOffset/signH dependem de buildingH; a orientação
  // depende do shape twisted).
  const signMeshes = new Map<
    number,
    { group: THREE.Group; text: string; sides: number }
  >();

  const getBuildingScale = (donationId: number): THREE.Vector3 | null => {
    if (!readDonationTransform(donationId)) return null;
    return tmpTransformScale.clone();
  };

  // Reconstrói todos os letreiros existentes com as dimensões/shape atuais.
  // Chamado em rebuildInstances porque novas doações podem alterar a altura ou
  // o shape efetivo do edifício e o letreiro precisa refletir isso.
  const syncSigns = () => {
    if (signMeshes.size === 0) return;
    const snapshot: Array<{ donationId: number; text: string; sides: number }> = [];
    for (const [donId, entry] of signMeshes) {
      snapshot.push({ donationId: donId, text: entry.text, sides: entry.sides });
    }
    for (const item of snapshot) {
      setSign(item.donationId, item.text, item.sides);
    }
  };

  const setSign = (donationId: number, text: string, sides: number) => {
    // Remover sign anterior
    const existing = signMeshes.get(donationId);
    if (existing) {
      scene.remove(existing.group);
      disposeSignMesh(existing.group);
      signMeshes.delete(donationId);
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    const scale = getBuildingScale(donationId);
    if (!scale) return;

    const donation = donationById.get(donationId);
    const shape = donation?.customization?.buildingShape ?? "default";

    const group = createSignMesh(trimmed, scale.x, scale.z, scale.y, sides, shape);
    if (!group) return;

    signMeshes.set(donationId, { group, text: trimmed, sides });
    scene.add(group);

    // Posicionar imediatamente no centro do edifício
    if (readDonationTransform(donationId)) {
      group.position.copy(tmpTransformPosition);
    }
  };

  const edgeLightMeshes = new Map<
    number,
    { group: THREE.Group; type: EdgeLightType }
  >();

  // Groups de LED escondidos durante a captura do cube (restaurados em endEnvCapture).
  const edgeLightsHiddenForCapture: THREE.Group[] = [];

  // Luz real que o LED joga nos edifícios VIZINHOS. O group do LED sai da captura
  // do envMap (ver beginEnvCapture), então o vizinho não espelha a fita — recebe
  // só iluminação difusa destas PointLight.
  //
  // Pool FIXO: a contagem de luzes visíveis entra na chave de cache do programa,
  // então criar/remover (ou alternar `visible`) por prédio recompilaria todos os
  // materiais a cada passe de cull. As luzes ficam sempre na cena e sempre
  // visíveis; sobra apenas mexer em posição e intensidade — zero recompilação.
  //
  // ponytail: pool de 8 — só os 8 LEDs visíveis mais próximos da câmera acendem.
  // Se a cidade ficar densa de LED, subir EDGE_LIGHT_SPILL_POOL_SIZE.
  const spillLights: THREE.PointLight[] = [];
  const spillCandidates: Array<{ donationId: number; distSq: number; position: THREE.Vector3 }> = [];
  const spillIntensitiesBeforeCapture: number[] = [];
  const releaseUnusedSpillPool = () => {
    if (edgeLightMeshes.size > 0) return;
    for (const light of spillLights) {
      scene.remove(light);
      light.dispose();
    }
    spillLights.length = 0;
    spillIntensitiesBeforeCapture.length = 0;
  };

  // Criado só na primeira ativação de LED: sem LED na cena, nenhum material paga
  // o custo das 8 luzes. Uma recompilação única quando o primeiro LED acende.
  const ensureSpillPool = () => {
    if (spillLights.length > 0) return;
    for (let i = 0; i < EDGE_LIGHT_SPILL_POOL_SIZE; i++) {
      const light = new THREE.PointLight(
        DEFAULT_EDGE_LIGHT_COLOR,
        0,
        EDGE_LIGHT_SPILL_RANGE,
        2,
      );
      scene.add(light);
      spillLights.push(light);
    }
  };

  // Reconstrói todos os LEDs existentes com as dimensões atuais do edifício.
  // É chamado em rebuildInstances porque novas doações podem alterar a altura
  // de edifícios já com LED — o group precisa ser recriado para refletir scale.y.
  const syncEdgeLights = () => {
    if (edgeLightMeshes.size === 0) return;
    const snapshot: Array<{ donationId: number; type: EdgeLightType }> = [];
    for (const [donId, entry] of edgeLightMeshes) {
      snapshot.push({ donationId: donId, type: entry.type });
    }
    for (const item of snapshot) {
      setEdgeLight(item.donationId, item.type);
    }
  };

  const setEdgeLight = (
    donationId: number,
    type: EdgeLightType,
  ) => {
    const existing = edgeLightMeshes.get(donationId);
    if (existing) {
      scene.remove(existing.group);
      disposeEdgeLightMesh(existing.group);
      edgeLightMeshes.delete(donationId);
    }

    if (type === "none") {
      releaseUnusedSpillPool();
      return;
    }

    const scale = getBuildingScale(donationId);
    if (!scale) {
      releaseUnusedSpillPool();
      return;
    }

    const donation = donationById.get(donationId);
    const shape = donation?.customization?.buildingShape ?? "default";

    const group = createEdgeLightMesh(
      type,
      { width: scale.x, depth: scale.z, height: scale.y },
      shape,
    );
    if (!group) {
      releaseUnusedSpillPool();
      return;
    }

    edgeLightMeshes.set(donationId, { group, type });
    scene.add(group);
    ensureSpillPool();

    if (readDonationTransform(donationId)) {
      group.position.set(
        tmpTransformPosition.x,
        tmpTransformPosition.y - tmpTransformScale.y / 2,
        tmpTransformPosition.z,
      );
    }
  };


  // --- Hologramas ---
  // Mapa: donationId → HologramEntry. O loadToken interno do entry protege
  // contra race conditions quando o usuário troca a imagem antes do load
  // anterior completar.
  const hologramMeshes = new Map<number, HologramEntry>();

  const getBuildingFootprint = (donationId: number) => {
    if (!readDonationTransform(donationId)) return null;
    return {
      width: tmpTransformScale.x,
      depth: tmpTransformScale.z,
      height: tmpTransformScale.y,
    };
  };

  const syncHolograms = () => {
    for (const [donId, entry] of hologramMeshes) {
      const footprint = getBuildingFootprint(donId);
      if (!footprint) {
        entry.group.visible = false;
        continue;
      }
      entry.group.visible = true;
      const center = tmpTransformPosition.clone();
      positionHologram(entry, center, footprint);
    }
  };

  const setHologram = (
    donationId: number,
    dataUrl: string | null,
    color: string,
    opacity: number,
  ) => {
    const existing = hologramMeshes.get(donationId);

    if (!dataUrl) {
      if (existing) {
        scene.remove(existing.group);
        disposeHologramMesh(existing);
        hologramMeshes.delete(donationId);
      }
      return;
    }

    const footprint = getBuildingFootprint(donationId);
    if (!footprint) return;

    let entry = existing;
    if (!entry) {
      entry = createHologramMesh(footprint, { color, opacity });
      hologramMeshes.set(donationId, entry);
      scene.add(entry.group);
      const center = tmpTransformPosition.clone();
      positionHologram(entry, center, footprint);
    } else {
      setHologramTint(entry, color);
      setHologramOpacity(entry, opacity);
    }

    if (entry.imageDataUrl === dataUrl) {
      // Mesmo dataURL — reposicionar apenas (cobre rebuilds sem trocar imagem)
      const center = tmpTransformPosition.clone();
      positionHologram(entry, center, footprint);
      return;
    }

    void setHologramImage(entry, dataUrl, footprint).then(() => {
      const fp = getBuildingFootprint(donationId);
      if (!fp) return;
      const center = tmpTransformPosition.clone();
      const e = hologramMeshes.get(donationId);
      if (e) positionHologram(e, center, fp);
    });
  };

  const updateCustomShapeColor = (donationId: number, color: string) => {
    const entry = customShapeMeshes.get(donationId);
    if (!entry) return;
    if (entry.shape === "empire") {
      setEmpireBuildingMeshColor(entry.mesh, color);
      return;
    }
    entry.facadeMat.color.set(color);
  };

  const disposeCustomShapeEntry = (entry: CustomShapeEntry) => {
    scene.remove(entry.mesh);
    for (const material of getCustomShapeMaterials(entry)) {
      if (material !== entry.facadeMat && material !== entry.topMat) {
        material.dispose();
      }
    }
    entry.facadeMat.dispose();
    entry.topMat.dispose();
  };

  // Garante que cada doação com customização que exige estado de material próprio
  // tenha um Mesh dedicado e atualizado. Cria/remove conforme as doações mudam e
  // reposiciona com base em donationTransforms.
  // Prazo para criar malha de formato em syncCustomShapes. Infinity = cria tudo na hora
  // (padrão de todo rebuild). 1º build de geometria complexa custa 10–30 ms (Empire,
  // One Trade, Taipei); com dezenas de prédios customizados, criar tudo num rebuild era
  // uma tarefa longa. Fora do prazo a doação fica pendente (sem malha) até
  // pumpCustomShapes.
  let shapeDeadline = Infinity;
  let shapesPending = false;
  // Rebuild adiado pela fila de customização do runtime (setRebuildDeferred).
  let rebuildDeferred = false;
  let rebuildPending = false;

  function syncCustomShapes() {
    const validIds = new Set<number>();

    for (const donation of donations) {
      if (!needsCustomMesh(donation.customization)) continue;

      const transform = donationTransforms.get(donation.id);
      if (!transform) continue;

      const shape = donation.customization?.buildingShape ?? "default";
      validIds.add(donation.id);
      let entry = customShapeMeshes.get(donation.id);

      if ((!entry || entry.shape !== shape) && performance.now() > shapeDeadline) {
        // Fora do prazo: mantém a malha antiga (se houver) e cria na próxima fatia.
        shapesPending = true;
        if (!entry) continue;
      } else if (!entry || entry.shape !== shape) {
        if (entry) {
          disposeCustomShapeEntry(entry);
          customShapeMeshes.delete(donation.id);
        }

        const customization = donation.customization!;
        const facadeMat = facadeMaterial.clone();
        const topMat = topMaterial.clone();
        // Re-aplica triplanar shader para que o clone tenha seu próprio
        // uTilingMultiplier (independente do main material).
        applyTriplanarShader(facadeMat, "donation-facade-triplanar", tilingUniform);
        applyTriplanarShader(topMat, "donation-top-triplanar", topTilingUniform);
        facadeMat.color.set(customization.color);
        // topMat herda TOP_CEMENT_COLOR do clone — laje não recebe a cor do edifício.
        facadeMat.userData.tilingMultiplier.value = customization.tilingScale;
        topMat.userData.tilingMultiplier.value = customization.tilingScale;
        setMaterialTextureTransform(facadeMat, customization.textureTransform);
        setMaterialTextureTransform(topMat, customization.textureTransform);

        // Shape `default` aqui = precisa de mesh próprio por outro motivo
        // (ex: tiling customizado) — reusa a geometria caixa do InstancedMesh.
        const sceneMesh = createBuildingShapeMesh(shape, facadeMat, topMat, buildingGeometry);
        if (shape === "empire") {
          tmpColor.set(customization.color);
          if (!tmpColor.equals(currentBuildingColor)) {
            setEmpireBuildingMeshColor(sceneMesh, customization.color);
          }
        } else if (shape === "residential" || shape === "apartment" || shape === "gourmet" || shape === "loft" || shape === "yachthouse") {
          // Builder pinta pedra/reboco/dourado; cor da customização só se ≠ global (igual Empire).
          // Dourado do Yatchcasa é metal liso: sem o concreto.
          if (shape !== "yachthouse") {
            if (!stoneTexturesNeeded) {
              stoneTexturesNeeded = true;
              requestTopSet();
            }
            setResidentialStoneMaps(facadeMat, currentTextureSettings.enabled ? topSet : null);
          }
          tmpColor.set(customization.color);
          if (!tmpColor.equals(currentBuildingColor)) facadeMat.color.set(customization.color);
        }

        sceneMesh.userData.donationId = donation.id;
        sceneMesh.userData.donationValue = donation.value;
        scene.add(sceneMesh);

        entry = { mesh: sceneMesh, facadeMat, topMat, shape };
        customShapeMeshes.set(donation.id, entry);
      }

      // Fora do bloco de criação: a textura própria do prédio também muda quando
      // a textura GLOBAL muda (o mesmo textureKey deixa de ser "igual à global").
      applyBuildingFacadeTexture(entry.facadeMat, donation);

      entry.mesh.position.copy(transform.position);
      entry.mesh.scale.copy(transform.scale);
      entry.mesh.userData.donationValue = donation.value;
      if (entry.shape === "residential") {
        // Nº de andares acompanha a altura (troca geometria do cache se mudou).
        setResidentialBuildingHeight(entry.mesh, transform.scale.y);
      } else if (entry.shape === "apartment") {
        setApartmentBuildingHeight(entry.mesh, transform.scale.y);
      } else if (entry.shape === "gourmet") {
        setGourmetBuildingHeight(entry.mesh, transform.scale.y);
      } else if (entry.shape === "loft") {
        setLoftBuildingHeight(entry.mesh, transform.scale.y);
      } else if (entry.shape === "yachthouse") {
        setYachthouseBuildingHeight(entry.mesh, transform.scale.y);
      }
    }

    for (const [donId, entry] of customShapeMeshes) {
      if (!validIds.has(donId)) {
        disposeCustomShapeEntry(entry);
        customShapeMeshes.delete(donId);
      }
    }
  }

  // --- Poeira de impacto ---
  // Burst de partículas soltas do chão quando o prédio bate. Points único reusado
  // (1 impacto por vez). Textura radial em memória, sem canvas nem asset externo.
  const DUST_COUNT = 30;
  const DUST_DURATION = 0.9; // segundos
  const makeDustTexture = () => {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const radius = Math.min(1, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2));
        const alpha = radius < 0.5 ? 0.95 - 1.1 * radius : 0.8 * (1 - radius);
        pixels[(y * size + x) * 4 + 3] = Math.round(alpha * 255);
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const dustTexture = makeDustTexture();
  const dustMaterial = new THREE.PointsMaterial({
    size: 1.2,
    map: dustTexture,
    color: new THREE.Color(0xbfb09a), // tom de terra/poeira
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustVelocities = new Float32Array(DUST_COUNT * 3);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
  dustPoints.visible = false;
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
  let dustElapsed = 0;
  let dustActive = false;

  const spawnDust = (cx: number, cz: number, footprintX: number, footprintZ: number) => {
    const spread = Math.max(footprintX, footprintZ) * 0.5 + 0.4;
    for (let i = 0; i < DUST_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = Math.random() * spread;
      dustPositions[i * 3] = cx + Math.cos(a) * r0;
      dustPositions[i * 3 + 1] = 0.05 + Math.random() * 0.15;
      dustPositions[i * 3 + 2] = cz + Math.sin(a) * r0;
      const speed = 1.2 + Math.random() * 2.8;
      dustVelocities[i * 3] = Math.cos(a) * speed;
      dustVelocities[i * 3 + 1] = 1.0 + Math.random() * 2.2; // jato pra cima
      dustVelocities[i * 3 + 2] = Math.sin(a) * speed;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dustMaterial.opacity = 0.9;
    dustMaterial.size = 1.2;
    dustPoints.visible = true;
    dustElapsed = 0;
    dustActive = true;
  };

  const tickDust = (dt: number) => {
    if (!dustActive) return;
    dustElapsed += dt;
    const p = Math.min(1, dustElapsed / DUST_DURATION);
    const drag = Math.max(0, 1 - 2.5 * dt);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustVelocities[i * 3 + 1] -= 5 * dt; // gravidade
      dustVelocities[i * 3] *= drag;
      dustVelocities[i * 3 + 2] *= drag;
      dustPositions[i * 3] += dustVelocities[i * 3] * dt;
      dustPositions[i * 3 + 1] = Math.max(0.02, dustPositions[i * 3 + 1] + dustVelocities[i * 3 + 1] * dt);
      dustPositions[i * 3 + 2] += dustVelocities[i * 3 + 2] * dt;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dustMaterial.opacity = 0.9 * (1 - p);
    dustMaterial.size = 1.2 + p * 1.8; // dissipa crescendo
    if (p >= 1) {
      dustActive = false;
      dustPoints.visible = false;
    }
  };

  // Tempo para a câmera se aproximar antes da queda, sem acelerar a levitação.
  const ENTRANCE_DURATION = 3.2;
  const ENTRANCE_LIFT = 5;
  const HOVER_END = 0.40;
  const SLOW_END = 0.78;
  let entranceAnim: { donationId: number; elapsed: number; offset: number; landed: boolean } | null = null;

  const setEntranceOffset = (offset: number) => {
    if (!entranceAnim) return;
    const { donationId } = entranceAnim;
    const transform = donationTransforms.get(donationId);
    if (!transform) return;
    const logicalIndex = donationIdToInstanceIndex.get(donationId);
    const renderIndex = logicalIndex === undefined ? -1 : instanceRenderIndices[logicalIndex];
    if (logicalIndex !== undefined && renderIndex >= 0) {
      const mesh = facadeGroups[instanceGroup[logicalIndex]].mesh;
      mesh.getMatrixAt(renderIndex, dummy.matrix);
      dummy.matrix.elements[13] = transform.position.y + offset;
      mesh.setMatrixAt(renderIndex, dummy.matrix);
      mesh.instanceMatrix.addUpdateRange(renderIndex * 16, 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
    const customMesh = customShapeMeshes.get(donationId)?.mesh;
    if (customMesh) customMesh.position.y = transform.position.y + offset;
    if (focusedDonationId === donationId && focusHighlightMesh) {
      focusHighlightMesh.position.y = transform.position.y + offset;
    }
    parapets.setVerticalOffset(donationId, offset);
    const delta = offset - entranceAnim.offset;
    for (const group of [rooftopMeshes.get(donationId)?.group, signMeshes.get(donationId)?.group,
      edgeLightMeshes.get(donationId)?.group, hologramMeshes.get(donationId)?.group]) {
      if (group) group.position.y += delta;
    }
    entranceAnim.offset = offset;
  };

  const finishEntrance = () => {
    setEntranceOffset(0);
    entranceAnim = null;
  };

  const startEntrance = (donationId: number) => {
    finishEntrance();
    if (!donationTransforms.has(donationId)) return;
    entranceAnim = { donationId, elapsed: 0, offset: 0, landed: false };
    setEntranceOffset(ENTRANCE_LIFT);
  };

  const tickEntrance = (dt: number) => {
    if (!entranceAnim) return;
    const transform = donationTransforms.get(entranceAnim.donationId);
    if (!transform) { finishEntrance(); return; }
    entranceAnim.elapsed += dt;
    const t = Math.min(1, entranceAnim.elapsed / ENTRANCE_DURATION);
    let offset: number;
    if (t < HOVER_END) offset = ENTRANCE_LIFT + Math.sin(t * 22) * 0.12;
    else if (t < SLOW_END) {
      const k = (t - HOVER_END) / (SLOW_END - HOVER_END);
      offset = ENTRANCE_LIFT * (1 - 0.2 * k);
    } else {
      const k = (t - SLOW_END) / (1 - SLOW_END);
      offset = ENTRANCE_LIFT * 0.8 * (1 - k * k);
    }
    setEntranceOffset(offset);
    if (!entranceAnim.landed && offset <= 0.02) {
      entranceAnim.landed = true;
      spawnDust(transform.position.x, transform.position.z, transform.scale.x, transform.scale.z);
    }
    if (t >= 1) finishEntrance();
  };

  // Render inicial: mostra o loteamento vazio (quadras + asfalto + lotes) já na
  // criação, antes de qualquer doação. Também define cityHalfExtent pro relevo abrir
  // a zona plana logo no setup do runtime.
  rebuildInstances();

  return {
    addDonation(value) {
      const donation: DonationEntry = {
        id: nextId++, value,
        customization: {
          buildingShape: "residential", color: currentBuildingColor.getStyle(),
          textureKey: null, tilingScale: 1, textureTransform: { ...DEFAULT_BUILDING_TEXTURE_TRANSFORM },
          rooftopType: "none", signText: "", signSides: 1, edgeLightType: "none",
          hologramImage: null, hologramColor: DEFAULT_HOLOGRAM_COLOR, hologramOpacity: DEFAULT_HOLOGRAM_OPACITY,
        },
      };
      donations.push(donation);
      donationById.set(donation.id, donation);
      donations.sort((a, b) => b.value - a.value);
      growIfNeeded(donations.length);
      rebuildInstances();
      startEntrance(donation.id);
      return donation.id;
    },
    addDonations(values) {
      for (const value of values) {
        const donation = { id: nextId++, value };
        donations.push(donation);
        donationById.set(donation.id, donation);
      }
      // Ordena uma vez e reconstrói uma vez para todo o lote
      donations.sort((a, b) => b.value - a.value);
      growIfNeeded(donations.length);
      rebuildInstances();
    },
    setDonations(entries) {
      // Replace-all do dataset do backend (load inicial e troca de filtro).
      // Foco não sobrevive: o id focado pode sair do dataset e a cena ficaria
      // presa no dimming (opacity 0.15) com o highlight órfão flutuando.
      applyFocus(null);

      const newIds = new Set<number>();
      for (const entry of entries) newIds.add(entry.id);

      // Acessórios (rooftop/sign/LED/holograma) são keyed por donationId e os
      // sync* só ESCONDEM, nunca deletam (remoção de doação não existia antes) —
      // dispose só dos ids que saíram do dataset; os que ficam são reposicionados
      // pelos sync* do rebuildInstances. Shared resources ficam (são reusados).
      // customShapeMeshes é limpo por syncCustomShapes (validIds).
      for (const [donId, entry] of rooftopMeshes) {
        if (newIds.has(donId)) continue;
        scene.remove(entry.group);
        disposeRooftopMesh(entry.group);
        rooftopMeshes.delete(donId);
      }
      for (const [donId, entry] of signMeshes) {
        if (newIds.has(donId)) continue;
        scene.remove(entry.group);
        disposeSignMesh(entry.group);
        signMeshes.delete(donId);
      }
      for (const [donId, entry] of edgeLightMeshes) {
        if (newIds.has(donId)) continue;
        scene.remove(entry.group);
        disposeEdgeLightMesh(entry.group);
        edgeLightMeshes.delete(donId);
      }
      for (const [donId, entry] of hologramMeshes) {
        if (newIds.has(donId)) continue;
        scene.remove(entry.group);
        disposeHologramMesh(entry);
        hologramMeshes.delete(donId);
      }
      releaseUnusedSpillPool();

      // Customização (cor/formato/tiling) vive em donation.customization —
      // preservar p/ ids que continuam no dataset (ex.: prédio customizado que
      // sobrevive à troca de filtro), senão o replace-all a apagaria da cena
      // enquanto o painel do editor ainda a mostraria.
      const prevCustomizations = new Map<number, BuildingCustomization>();
      for (const donation of donations) {
        if (donation.customization && newIds.has(donation.id)) {
          prevCustomizations.set(donation.id, donation.customization);
        }
      }

      donations.length = 0;
      donationById.clear();
      let maxId = 0;
      for (const entry of entries) {
        const donation: DonationEntry = { id: entry.id, value: entry.value };
        const customization = prevCustomizations.get(entry.id);
        if (customization) donation.customization = customization;
        donations.push(donation);
        donationById.set(donation.id, donation);
        if (entry.id > maxId) maxId = entry.id;
      }
      donations.sort((a, b) => b.value - a.value);
      // IDs vêm do backend; nextId acima do maior p/ doação manual local não colidir
      nextId = Math.max(maxId + 1, nextId);
      growIfNeeded(donations.length);
      rebuildInstances();
    },
    updateBuildingSettings(settings) {
      currentBuildingColor.set(settings.color); // manter em sync para instanceColor fallback
      for (const group of facadeGroups) group.material.color.set(settings.color);
      // topMaterial mantém TOP_CEMENT_COLOR — laje de cimento não muda de cor.
      // Roughness/metalness afetam todos os materiais (inclui clones twisted).
      // Cor é específica por edifício para clones — não sobrescrever aqui.
      if (!currentTextureSettings.enabled) {
        for (const mat of getAllFacadeMaterials()) {
          if (isTexturelessMaterial(mat)) continue; // formato autoral mantém o material
          mat.roughness = settings.roughness;
          mat.metalness = settings.metalness;
        }
        for (const mat of getAllTopMaterials()) {
          if (isTexturelessMaterial(mat)) continue;
          mat.roughness = settings.roughness;
          mat.metalness = settings.metalness;
        }
      }
      applyInstanceColors();
    },
    setFacadeTexturePool(keys) {
      const next = keys.filter(Boolean);
      const same =
        next.length === facadeTexturePool.length &&
        next.every((key, i) => key === facadeTexturePool[i]);
      if (same) return;
      facadeTexturePool = next;
      rebuildFacadeGroups();
      rebuildInstances();
    },
    updateTextureSettings(settings) {
      const folderChanged =
        resolveFacadeFolder(settings.textureKey) !==
        resolveFacadeFolder(currentTextureSettings.textureKey);
      const mapsChanged = settings.enabled !== currentTextureSettings.enabled ||
        settings.normalScale !== currentTextureSettings.normalScale ||
        settings.roughnessIntensity !== currentTextureSettings.roughnessIntensity ||
        settings.metalnessIntensity !== currentTextureSettings.metalnessIntensity ||
        settings.displacementScale !== currentTextureSettings.displacementScale;
      currentTextureSettings = { ...settings };
      if (folderChanged || mapsChanged) {
        requestGlobalFacadeSet(settings.textureKey);
        for (const mat of getAllFacadeMaterials()) {
          const folder = materialFacadeKeys.get(mat);
          if (folder) applyFacadeFolder(mat, folder, true);
        }
      }
      requestTopSet();
      tilingUniform.value = settings.tilingScale;
      topTilingUniform.value = settings.top.tilingScale;
      applyTextureToFacade(settings); // relê facadeSet (inclui clones custom)
      applyTextureToTop(settings);
      // A pasta global vira o grupo 0: trocar a textura da cena remapeia
      // pasta→grupo e realoca as instâncias.
      if (folderChanged) {
        rebuildFacadeGroups();
        rebuildInstances();
      }
    },
    updateBlockLayout(settings) {
      // Cores: aplicam direto nos materiais compartilhados, sem rebuild.
      lotMaterial.color.set(settings.lotColor);
      sidewalkTopMaterial.color.set(settings.sidewalkColor);
      sidewalkSideMaterial.color.set(settings.sidewalkSideColor);
      // Só os campos que afetam a geometria do layout exigem reconstruir as instâncias.
      const geometryChanged =
        settings.blockSize !== currentBlockLayout.blockSize ||
        settings.streetWidth !== currentBlockLayout.streetWidth ||
        settings.towerRatio !== currentBlockLayout.towerRatio ||
        settings.towersPerBlock !== currentBlockLayout.towersPerBlock ||
        settings.baseHeightCap !== currentBlockLayout.baseHeightCap ||
        settings.centerTallest !== currentBlockLayout.centerTallest;
      // Altura da calçada só reposiciona as tiras de calçada — rebuild localizado, sem mexer nos prédios.
      const sidewalkHeightChanged = settings.sidewalkHeight !== currentBlockLayout.sidewalkHeight;
      currentBlockLayout = { ...settings };
      if (geometryChanged) {
        rebuildInstances();
      } else if (sidewalkHeightChanged && lastRoadR >= 1) {
        const roadWidth = Math.max(1.0, lastRoadStreetWidth - SIDEWALK_RESERVE);
        rebuildSidewalks(lastRoadR, lastRoadBlockSpacing, lastRoadStreetWidth, roadWidth);
        // Poste assenta no topo do meio-fio — subiu a calçada, sobe o poste.
        rebuildStreetLamps(lastRoadR, lastRoadBlockSpacing, lastRoadStreetWidth, roadWidth);
        cullGroundInstances();
      }
    },
    setEnvMap(envMap) {
      for (const mat of getAllFacadeMaterials()) {
        mat.envMap = envMap;
        mat.needsUpdate = true;
      }
      // Probe recriado (resolução) ou reflexo desligado: vidros não podem ficar
      // apontando pro cube descartado.
      for (const mat of getAuthoredEnvMaterials()) {
        mat.envMap = envMap;
        mat.needsUpdate = true;
      }
    },
    setEnvMapRotation(yDeg) {
      // Só Y: rotação no eixo vertical gira o azimute de TODA fachada igualmente. Girar no
      // X quebraria a simetria (deixa ±X quase parado e vira ±Z inteiro).
      // envMapRotation vira uniform a cada frame (WebGLMaterials) — sem needsUpdate.
      // Clones de custom shape nascem de facadeMaterial/topMaterial e copiam o Euler.
      const y = THREE.MathUtils.degToRad(yDeg);
      for (const mat of getAllFacadeMaterials()) mat.envMapRotation.set(0, y, 0);
      for (const mat of getAllTopMaterials()) mat.envMapRotation.set(0, y, 0);
    },
    setNight(night, windowIntensity) {
      nightMode = night;
      nightWindowUniform.value = night ? Math.max(0, windowIntensity) : 0;
      lampHeadMaterial.emissiveIntensity = night ? NIGHT_PRESET.lampEmissive : 0;
      lampPoolMaterial.uniforms.uIntensity.value = night ? NIGHT_PRESET.lampPool : 0;
      // Reaplica pra fachada pegar o envMapIntensity da noite (e devolver o do painel).
      applyTextureToFacade(currentTextureSettings);
    },
    setEnvHorizon(amount) {
      // Clamp em 0.95: com 1.0 um reflexo apontando reto pra cima vira vec3(0) → NaN.
      envHorizonUniform.value = THREE.MathUtils.clamp(amount, 0, 0.95);
    },
    setReflectionRoughnessFloor(roughness) {
      reflectionRoughnessFloorUniform.value = THREE.MathUtils.clamp(roughness, 0, 1);
    },
    setReflectionDistanceRange(start, end) {
      reflectionDistanceStartUniform.value = Math.max(0, start);
      reflectionDistanceEndUniform.value = Math.max(reflectionDistanceStartUniform.value + 1, end);
    },
    beginEnvCapture(includeCityFloor) {
      for (const mat of getAllFacadeMaterials()) mat.envMapIntensity = 0;
      for (const mat of getAllTopMaterials()) mat.envMapIntensity = 0;
      for (const mat of getAuthoredEnvMaterials()) mat.envMapIntensity = 0;
      // O probe é fixo na cidade: captura o dataset completo, independente do
      // culling da câmera principal, e restaura o buffer compacto ao terminar.
      compactVisibleInstances(true);
      customShapesHiddenBeforeCapture.length = 0;
      for (const [donationId, entry] of customShapeMeshes) {
        if (entry.mesh.visible) continue;
        customShapesHiddenBeforeCapture.push(donationId);
        entry.mesh.visible = true;
      }
      // LED fora do reflexo, por completo: nem a fita espelhada, nem o clarão que
      // ela joga nos vizinhos entram no envMap. O que o LED ilumina só aparece no
      // render principal.
      edgeLightsHiddenForCapture.length = 0;
      for (const entry of edgeLightMeshes.values()) {
        if (!entry.group.visible) continue;
        edgeLightsHiddenForCapture.push(entry.group);
        entry.group.visible = false;
      }
      // Intensidade a 0 em vez de `visible = false`: apagar a luz mudaria a contagem
      // de luzes da cena e recompilaria todos os materiais a cada captura.
      spillIntensitiesBeforeCapture.length = 0;
      for (const light of spillLights) {
        spillIntensitiesBeforeCapture.push(light.intensity);
        light.intensity = 0;
      }
      // Chão da cidade também volta inteiro: o probe é fixo, não segue o cull da câmera.
      restoreInstances(lotCull);
      restoreInstances(sidewalkCull);
      restoreInstances(lampCull);
      restoreInstances(roadCull);
      // O controle pode retirar o piso da cidade (asfalto, calçada, lotes) para liberar o
      // hemisfério de baixo do cube ao céu e destacar o skyline na fachada.
      if (includeCityFloor) return;
      for (const m of [asphaltMesh, dashMesh]) if (m) m.visible = false;
      if (sidewalkMesh) sidewalkMesh.visible = false;
      if (lotMesh) lotMesh.visible = false;
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) if (m) m.visible = false;
    },
    endEnvCapture() {
      for (const mat of getAllFacadeMaterials()) {
        mat.envMapIntensity = facadeEnvMapIntensity(currentTextureSettings);
      }
      for (const mat of getAllTopMaterials()) {
        mat.envMapIntensity = currentTextureSettings.top.envMapIntensity;
      }
      // Depois do loop global: autorais sobrescrevem o valor das fachadas.
      for (const mat of getAuthoredEnvMaterials()) {
        mat.envMapIntensity = mat.userData.authoredEnvMapIntensity;
      }
      compactVisibleInstances();
      for (const donationId of customShapesHiddenBeforeCapture) {
        const entry = customShapeMeshes.get(donationId);
        if (entry) entry.mesh.visible = false;
      }
      customShapesHiddenBeforeCapture.length = 0;
      for (const group of edgeLightsHiddenForCapture) group.visible = true;
      edgeLightsHiddenForCapture.length = 0;
      for (let i = 0; i < spillLights.length; i++) {
        spillLights[i].intensity = spillIntensitiesBeforeCapture[i] ?? 0;
      }
      spillIntensitiesBeforeCapture.length = 0;
      for (const m of [asphaltMesh, dashMesh]) if (m) m.visible = true;
      if (sidewalkMesh) sidewalkMesh.visible = true;
      if (lotMesh) lotMesh.visible = true;
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) if (m) m.visible = true;
      cullGroundInstances();
    },
    getDonationCount() {
      return donations.length;
    },
    getCityRadius() {
      return cityHalfExtent;
    },
    getHoveredValue(event: MouseEvent, camera: THREE.Camera, domElement: HTMLElement) {
      return pickAt(event, camera, domElement)?.value ?? null;
    },
    getClickedDonationId(event: MouseEvent, camera: THREE.Camera, domElement: HTMLElement) {
      return pickAt(event, camera, domElement)?.donationId ?? null;
    },
    getDonationWorldPosition(donationId: number) {
      if (!readDonationTransform(donationId)) return null;
      const pos = tmpTransformPosition.clone();
      // Retornar o topo do prédio (pos.y é o centro, scale.y é a altura)
      pos.y += tmpTransformScale.y / 2;
      return pos;
    },
    getDonationBounds(donationId) {
      if (!readDonationTransform(donationId)) return null;
      const bounds = new THREE.Box3().setFromCenterAndSize(tmpTransformPosition, tmpTransformScale);
      const mesh = customShapeMeshes.get(donationId)?.mesh;
      if (mesh) bounds.union(new THREE.Box3().setFromObject(mesh));
      // Inclui o ponto mais alto da levitação para não cortar a cobertura no vídeo.
      if (entranceAnim?.donationId === donationId) bounds.max.y += 0.15;
      return bounds;
    },
    setRebuildDeferred(deferred: boolean) {
      rebuildDeferred = deferred;
      if (deferred || !rebuildPending) return;
      rebuildPending = false;
      // Malhas de formato ficam todas para pumpCustomShapes: o rebuild já custa a fatia.
      shapeDeadline = -Infinity;
      rebuildInstances();
      shapeDeadline = Infinity;
      if (focusedDonationId !== null) applyFocus(focusedDonationId);
    },
    pumpCustomShapes(budgetMs: number) {
      if (!shapesPending) return false;
      shapesPending = false;
      shapeDeadline = performance.now() + budgetMs;
      syncCustomShapes();
      shapeDeadline = Infinity;
      // Topo (yachthouse/residencial) e foco dependem da malha criada agora.
      syncRooftops();
      if (focusedDonationId !== null) applyFocus(focusedDonationId);
      return shapesPending;
    },
    setFocusedDonation(donationId: number | null) {
      if (focusedDonationId === donationId) return;
      applyFocus(donationId);
    },
    hasFocusedDonation() { return focusedDonationId !== null; },
    updateDonationCustomization(donationId: number, customization: BuildingCustomization) {
      const donation = donationById.get(donationId);
      if (!donation) return;

      const prevCustomization = donation.customization;
      const prevRooftop = prevCustomization?.rooftopType ?? "none";
      const prevSignText = prevCustomization?.signText ?? "";
      const prevSignSides = prevCustomization?.signSides ?? 1;
      const prevEdgeLightType = prevCustomization?.edgeLightType ?? "none";
      const prevShape = prevCustomization?.buildingShape ?? "default";
      const prevTilingScale = prevCustomization?.tilingScale ?? 1;
      const prevTextureTransform = prevCustomization?.textureTransform ??
        DEFAULT_BUILDING_TEXTURE_TRANSFORM;
      const prevTextureKey = prevCustomization?.textureKey ?? null;
      const prevHologramImage = prevCustomization?.hologramImage ?? null;
      const prevHologramColor = prevCustomization?.hologramColor ?? DEFAULT_HOLOGRAM_COLOR;
      const prevHologramOpacity = prevCustomization?.hologramOpacity ?? DEFAULT_HOLOGRAM_OPACITY;
      donation.customization = customization;

      const prevNeedsCustom = needsCustomMesh(prevCustomization);
      const nowNeedsCustom = needsCustomMesh(customization);

      // Acessórios independem da alocação: rodam também na troca de formato. Sem
      // isso a 1ª aplicação vinda do banco (formato + acessórios juntos, ver
      // CitySceneEditor) perdia topo/letreiro/LED/holograma de todo formato custom.
      const applyAccessories = () => {
        // Atualizar acessório de topo se o tipo mudou
        if (customization.rooftopType !== prevRooftop) {
          setRooftop(donationId, customization.rooftopType);
        }

        // Atualizar letreiro se o texto ou número de lados mudou
        if (customization.signText !== prevSignText || customization.signSides !== prevSignSides) {
          setSign(donationId, customization.signText, customization.signSides);
        }

        // LED de arestas: type muda → rebuild
        if (customization.edgeLightType !== prevEdgeLightType) {
          setEdgeLight(donationId, customization.edgeLightType);
        }

        // Holograma: imagem muda (incluindo remoção) → recarregar.
        // Cor/opacidade só ajustam uniforms — sem reload da textura.
        if (customization.hologramImage !== prevHologramImage) {
          setHologram(
            donationId,
            customization.hologramImage,
            customization.hologramColor,
            customization.hologramOpacity,
          );
        } else {
          const entry = hologramMeshes.get(donationId);
          if (entry) {
            if (customization.hologramColor !== prevHologramColor) {
              setHologramTint(entry, customization.hologramColor);
            }
            if (customization.hologramOpacity !== prevHologramOpacity) {
              setHologramOpacity(entry, customization.hologramOpacity);
            }
          }
        }
        if (focusedDonationId !== null) applyAccessoryFocus();
      };

      // Transição de allocation: se o prédio entra ou sai do customShapeMeshes
      // (ou troca de shape), re-alocar instâncias e re-aplicar foco. Material
      // (cor/textura) já nasce certo no rebuild — só acessórios seguem.
      if (prevNeedsCustom !== nowNeedsCustom || customization.buildingShape !== prevShape) {
        if (rebuildDeferred) {
          rebuildPending = true;
        } else {
          rebuildInstances();
          if (focusedDonationId !== null) {
            applyFocus(focusedDonationId);
          }
        }
        applyAccessories();
        return;
      }

      // Atualização de tiling em prédio que já está em customShapeMeshes:
      // só atualiza o uniform — sem rebuild.
      if (customization.tilingScale !== prevTilingScale) {
        const entry = customShapeMeshes.get(donationId);
        if (entry) {
          entry.facadeMat.userData.tilingMultiplier.value = customization.tilingScale;
          entry.topMat.userData.tilingMultiplier.value = customization.tilingScale;
        }
      }

      // Troca de textura em prédio que JÁ tem mesh próprio (ex: já era twisted):
      // só recarrega o material, sem rebuild. A transição instanced <-> mesh
      // próprio já saiu acima, pelo needsCustomMesh.
      if (customization.textureKey !== prevTextureKey) {
        const entry = customShapeMeshes.get(donationId);
        if (entry) {
          applyBuildingFacadeTexture(entry.facadeMat, donation);
        } else {
          // Instanciado: a textura define em QUAL InstancedMesh o prédio vive.
          // Basta remapear o grupo da instância e recompactar — sem refazer o
          // layout inteiro da cidade.
          const index = donationIdToInstanceIndex.get(donationId);
          const nextGroup = index === undefined ? 0 : facadeGroupFor(donation);
          if (index !== undefined && nextGroup !== instanceGroup[index]) {
            facadeGroups[instanceGroup[index]].logicalCount--;
            instanceGroup[index] = nextGroup;
            facadeGroups[nextGroup].logicalCount++;
            ensureGroupCapacity(facadeGroups[nextGroup], facadeGroups[nextGroup].logicalCount);
            compactVisibleInstances();
          }
          // O destaque tem material próprio sobre a instância: acompanha o grupo
          // sem recriar o mesh de foco nem reconstruir o layout.
          if (focusedDonationId === donationId && focusHighlightMesh) {
            applyFacadeFolder(focusFacadeMaterial, facadeGroups[nextGroup].folder);
          }
        }
      }

      if (!sameTextureTransform(customization.textureTransform, prevTextureTransform)) {
        const entry = customShapeMeshes.get(donationId);
        if (entry) {
          setMaterialTextureTransform(entry.facadeMat, customization.textureTransform);
          setMaterialTextureTransform(entry.topMat, customization.textureTransform);
        }
      }

      // Atualização de cor: caminhos diferentes para custom mesh vs instanced.
      if (customShapeMeshes.has(donationId)) {
        updateCustomShapeColor(donationId, customization.color);
      } else if (focusedDonationId === donationId && focusHighlightMesh) {
        focusFacadeMaterial.color.set(customization.color);
      } else if (compositeFocus || focusedDonationId === null) {
        applyInstanceColors();
      }

      applyAccessories();
    },
    tickAnimations(elapsedSeconds, deltaMs) {
      let animated = entranceAnim !== null || dustActive;
      const delta = Math.min(deltaMs / 1000, 0.05);
      tickEntrance(delta);
      tickDust(delta);
      for (const entry of hologramMeshes.values()) {
        // Holograma culled por distância não precisa de tick (shader nem roda).
        if (!entry.group.visible) continue;
        entry.group.updateWorldMatrix(true, true);
        const plane = entry.group.children[0] as THREE.Mesh;
        if (!viewFrustum || viewFrustum.intersectsObject(plane)) {
          tickHologram(entry, elapsedSeconds, deltaMs);
          animated = true;
        }
      }
      return animated;
    },
    setRenderDistance(distance, backDistance, groundDistance) {
      // Aplicado antes do próximo frame pelo runtime.
      renderDistanceSq = distance * distance;
      backDistanceSq = backDistance * backDistance;
      groundCullSq = groundDistance * groundDistance;
    },
    // LOD barato: acessórios de detalhe (topo, letreiro, LED, holograma) somem além
    // da distância onde o fog já os apaga — o prédio (silhueta) continua visível.
    // Prédios (instanciados e customizados) somem além da distância de renderização,
    // junto com o chão da cidade (lotes, calçadas, postes, asfalto).
    updateDistanceCulling(cameraPos, cameraForward, frustum) {
      lastCullPos.copy(cameraPos);
      hasCullView = true;
      viewFrustum = frustum ?? null;
      cullGroundInstances();
      // Forward projetado no plano XZ; olhando reto pra baixo não há "atrás" definido
      // → cull vira puramente radial (limite frontal pra todo mundo).
      let fx = cameraForward.x;
      let fz = cameraForward.z;
      const fLen = Math.hypot(fx, fz);
      const hasDirection = fLen > 1e-3;
      if (hasDirection) {
        fx /= fLen;
        fz /= fLen;
      }
      const distSqTo = (p: THREE.Vector3) => {
        const dx = p.x - cameraPos.x;
        const dz = p.z - cameraPos.z;
        return dx * dx + dz * dz;
      };
      // Olhando reto pra baixo (bird's eye, stop do orbit em phi≈0): forward XZ some,
      // "atrás" fica indefinido → cull radial usa a menor distância (mais agressiva),
      // pra continuar sumindo prédios mesmo com a câmera toda pra baixo.
      const fallbackSq = Math.min(renderDistanceSq, backDistanceSq);
      // Limite direcional: prédio atrás da câmera (dot < 0) usa backDistance.
      const limitSqFor = (p: THREE.Vector3) => {
        if (!hasDirection) return fallbackSq;
        const behind = (p.x - cameraPos.x) * fx + (p.z - cameraPos.z) * fz < 0;
        return behind ? backDistanceSq : renderDistanceSq;
      };
      const applyCull = (donId: number, group: THREE.Object3D) => {
        const t = donationTransforms.get(donId);
        if (!t) return; // sem transform = sync* já escondeu o group
        const d = distSqTo(t.position);
        group.visible = d <= ACCESSORY_DETAIL_DISTANCE_SQ && d <= limitSqFor(t.position);
      };
      for (const [donId, entry] of rooftopMeshes) applyCull(donId, entry.group);
      for (const [donId, entry] of signMeshes) applyCull(donId, entry.group);
      for (const [donId, entry] of edgeLightMeshes) applyCull(donId, entry.group);
      for (const [donId, entry] of hologramMeshes) applyCull(donId, entry.group);
      parapets.updateVisibility((position) => {
        const distanceSq = distSqTo(position);
        return distanceSq <= ACCESSORY_DETAIL_DISTANCE_SQ && distanceSq <= limitSqFor(position);
      });

      // Pool de luz do LED: os mais próximos da câmera assumem as luzes; o resto
      // fica com intensidade 0 (mesma contagem de luzes → sem recompilar shader).
      // A luz vai no CENTRO do edifício: sem sombras, ela vaza pros vizinhos, e a
      // própria fachada não acende porque a normal aponta pro lado oposto.
      // Acesas sempre nos primeiros índices: o shader para na 1ª apagada (createScenePreparer).
      if (spillLights.length > 0) {
        spillCandidates.length = 0;
        for (const [donId, entry] of edgeLightMeshes) {
          if (!entry.group.visible) continue;
          const t = donationTransforms.get(donId);
          if (!t) continue;
          spillCandidates.push({ donationId: donId, distSq: distSqTo(t.position), position: t.position });
        }
        spillCandidates.sort((a, b) => a.distSq - b.distSq);
        for (let i = 0; i < spillLights.length; i++) {
          const candidate = spillCandidates[i];
          spillLights[i].intensity = candidate
            ? EDGE_LIGHT_SPILL_INTENSITY * (focusedDonationId === null || candidate.donationId === focusedDonationId ? 1 : 0.15)
            : 0;
          if (candidate) spillLights[i].position.copy(candidate.position);
        }
      }

      let culled = 0;

      // Prédios customizados: Mesh próprio, basta visible.
      for (const [donId, entry] of customShapeMeshes) {
        const t = donationTransforms.get(donId);
        if (!t) continue;
        entry.mesh.visible = distSqTo(t.position) <= limitSqFor(t.position);
        if (!entry.mesh.visible) culled++;
      }

      // Prédios instanciados: o buffer é compactado e `mesh.count` passa a conter
      // somente os visíveis. Assim o cull reduz fragmentos E vertex shaders.
      // Arrays lógicos continuam estáveis para picking/metadados.
      let changed = false;
      // Displacement move vértices no shader além do AABB lógico; nesse modo mantém só distância.
      const instanceFrustum = currentTextureSettings.displacementScale > 0 || currentTextureSettings.top.displacementScale > 0
        ? undefined : frustum;
      // As mesmas quadras do picking descartam regiões inteiras, sem criar draw calls.
      for (const block of pickBlocks) {
        pickBox.min.set(block.minX, 0, block.minZ);
        pickBox.max.set(block.maxX, block.maxY, block.maxZ);
        const blockVisible = !instanceFrustum || instanceFrustum.intersectsBox(pickBox);
        if (!blockVisible) {
          culled += block.end - block.start;
          if (!block.viewCulled) {
            for (let i = block.start; i < block.end; i++) {
              if (!instanceHidden[i]) changed = true;
              instanceHidden[i] = 1;
            }
          }
          block.viewCulled = true;
          continue;
        }
        block.viewCulled = false;
        for (let i = block.start; i < block.end; i++) {
          const dx = instPosX[i] - cameraPos.x;
          const dz = instPosZ[i] - cameraPos.z;
          const d = dx * dx + dz * dz;
          const limit = hasDirection
            ? (dx * fx + dz * fz < 0 ? backDistanceSq : renderDistanceSq)
            : fallbackSq;
          let visible = blockVisible && d <= limit;
          if (visible && instanceFrustum) {
            pickBox.min.set(instPosX[i] - instHalfX[i], instPosY[i] - instHalfY[i], instPosZ[i] - instHalfZ[i]);
            pickBox.max.set(instPosX[i] + instHalfX[i], instPosY[i] + instHalfY[i], instPosZ[i] + instHalfZ[i]);
            visible = instanceFrustum.intersectsBox(pickBox);
          }
          const hidden = visible ? 0 : 1;
          if (hidden) culled++;
          if (instanceHidden[i] === hidden) continue;
          instanceHidden[i] = hidden;
          changed = true;
        }
      }
      if (changed) compactVisibleInstances();
      return culled;
    },
    dispose() {
      disposed = true;
      entranceAnim = null;
      scene.remove(dustPoints);
      dustGeometry.dispose();
      dustMaterial.dispose();
      dustTexture.dispose();
      donationById.clear();
      restoreFocusLayers();
      restoreAccessoryFocus();
      removeFocusHighlight();
      parapets.dispose();
      // Limpar acessórios de topo
      for (const [, entry] of rooftopMeshes) {
        scene.remove(entry.group);
        disposeRooftopMesh(entry.group);
      }
      rooftopMeshes.clear();
      disposeRooftopSharedResources();
      // Limpar letreiros
      for (const [, entry] of signMeshes) {
        scene.remove(entry.group);
        disposeSignMesh(entry.group);
      }
      signMeshes.clear();
      // Limpar LEDs de arestas
      for (const [, entry] of edgeLightMeshes) {
        scene.remove(entry.group);
        disposeEdgeLightMesh(entry.group);
      }
      edgeLightMeshes.clear();
      edgeLightsHiddenForCapture.length = 0;
      releaseUnusedSpillPool();
      disposeEdgeLightSharedResources();
      // Limpar hologramas
      for (const [, entry] of hologramMeshes) {
        scene.remove(entry.group);
        disposeHologramMesh(entry);
      }
      hologramMeshes.clear();
      // Limpar prédios com formato customizado
      for (const [, entry] of customShapeMeshes) {
        disposeCustomShapeEntry(entry);
      }
      customShapeMeshes.clear();
      disposeBuildingShapeSharedResources();
      focusFacadeMaterial.dispose();
      focusTopMaterial.dispose();
      for (const group of facadeGroups) {
        scene.remove(group.mesh);
        group.mesh.dispose();
        group.material.dispose(); // grupo 0 = facadeMaterial
      }
      facadeGroups.length = 0;
      buildingGeometry.dispose();
      topMaterial.dispose();
      // Nenhuma textura é descartada aqui: fachada E topo vêm do cache compartilhado
      // do loader, reusado entre recriações do manager.
      for (const m of [asphaltMesh, dashMesh]) {
        if (!m) continue;
        scene.remove(m);
        m.dispose();
      }
      asphaltMesh = null;
      dashMesh = null;
      roadSegmentGeometry.dispose();
      asphaltMaterial.dispose();
      dashMaterial.dispose();
      // Limpar calçadas
      if (sidewalkMesh) {
        scene.remove(sidewalkMesh);
        sidewalkMesh.dispose();
        sidewalkMesh = null;
      }
      sidewalkGeometry.dispose();
      sidewalkTopMaterial.dispose();
      sidewalkSideMaterial.dispose();
      // Limpar lotes vazios
      if (lotMesh) {
        scene.remove(lotMesh);
        lotMesh.dispose();
        lotMesh = null;
      }
      lotGeometry.dispose();
      lotMaterial.dispose();
      // Limpar postes de luz
      for (const m of [lampPoleMesh, lampHeadMesh, lampPoolMesh]) {
        if (!m) continue;
        scene.remove(m);
        m.dispose();
      }
      lampPoleMesh = null;
      lampHeadMesh = null;
      lampPoolMesh = null;
      lampPoleGeometry.dispose();
      lampHeadGeometry.dispose();
      lampPoolGeometry.dispose();
      lampPoleMaterial.dispose();
      lampHeadMaterial.dispose();
      lampPoolMaterial.dispose();
    },
  };
}
