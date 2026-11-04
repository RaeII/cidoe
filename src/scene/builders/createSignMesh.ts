import * as THREE from "three";
import type { BuildingShape } from "../types";
import { getChryslerFootprintScaleAtHeightRatio } from "./createChryslerBuildingMesh";
import { getEmpireFootprintScaleAtHeightRatio } from "./createEmpireBuildingMesh";
import { getHearstFaceSpanRatio } from "./createHearstBuildingMesh";
import { OCTAGON_FLAT_SIDE_RATIO } from "./createOctagonalBuildingMesh";
import {
  ONE_TRADE_SIGN_Y_OFFSET_RATIO,
  getOneTradeFootprintScaleAtHeightRatio,
} from "./createOneTradeBuildingMesh";
import { getResidentialRoofOffset } from "./createResidentialBuildingMesh";
import { getApartmentRoofOffset } from "./createApartmentBuildingMesh";
import { GOURMET_TOWER_SCALE, getGourmetRoofOffset } from "./createGourmetBuildingMesh";
import { getLoftRoofOffset } from "./createLoftBuildingMesh";
import { getSetbackFootprintScaleAtHeightRatio } from "./createSetbackBuildingMesh";
import {
  TAIPEI_SIGN_Y_OFFSET_RATIO,
  getTaipeiFootprintScaleAtHeightRatio,
} from "./createTaipeiBuildingMesh";
import { getTaperedFootprintScaleAtHeightRatio } from "./createTaperedBuildingMesh";
import { TWIST_TOTAL_ANGLE } from "./createTwistedBuildingMesh";
import { getYachthouseTowerFootprints } from "./createYachthouseBuildingMesh";

// Margem lateral dentro da placa (fração da largura do canvas)
const PADDING = 0.12;
// Altura do canvas em pixels (fixo — largura escala com o edifício)
const CANVAS_HEIGHT = 128;
// Proporção altura da placa / largura do edifício
const SIGN_HEIGHT_RATIO = 0.22;
// Mantém a textura à frente do backing para evitar z-fighting ao mover a câmera.
const SIGN_FACE_GAP = 0.002;
// Hastes visuais que conectam o letreiro afastado ao prédio torcido.
const TWISTED_SUPPORT_THICKNESS = 0.035;
const TWISTED_SUPPORT_FACE_OVERLAP = 0.006;
const TWISTED_SUPPORT_BACKING_OVERLAP = 0.016;

/**
 * Cria um letreiro 3D estilo corporativo para a fachada de um edifício.
 *
 * O texto é renderizado via CanvasTexture em um plano fino com material emissivo
 * (simulando letreiro LED). Pode aparecer em 1 a 4 fachadas.
 *
 * @param text       Texto do letreiro (marca/empresa)
 * @param buildingW  Largura do edifício (scale.x da instância)
 * @param buildingD  Profundidade do edifício (scale.z da instância)
 * @param buildingH  Altura do edifício (scale.y da instância)
 * @param sides      Quantidade de lados (1–4). 1=frente, 2=frente+trás, 3=+lateral dir, 4=todos
 * @returns Group posicionado para ser adicionado na posição do centro do edifício,
 *          ou null se o texto for vazio.
 */
export function createSignMesh(
  text: string,
  buildingW: number,
  buildingD: number,
  buildingH: number,
  sides: number,
  shape: BuildingShape = "default",
): THREE.Group | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const group = new THREE.Group();
  if (shape === "yachthouse") {
    // Repete nas duas torres, logo abaixo do coroamento recuado.
    for (const { x, tiers: [body] } of getYachthouseTowerFootprints(buildingW, buildingD, buildingH)) {
      const sign = createSignMesh(trimmed, body.width, body.depth, body.topY, sides);
      if (sign) {
        sign.position.set(x, (body.topY - buildingH) / 2, 0);
        group.add(sign);
      }
    }
    group.userData.signDisposables = group.children.flatMap((child) => child.userData.signDisposables ?? []);
    return group;
  }
  const clampedSides = Math.max(1, Math.min(4, Math.round(sides)));
  const isEmpire = shape === "empire" && buildingH > 0;
  const isTaipei = shape === "taipei" && buildingH > 0;
  const isOneTrade = shape === "one-trade" && buildingH > 0;
  const isResidential = shape === "residential" && buildingH > 0;
  const isApartment = shape === "apartment" && buildingH > 0;
  const isGourmet = shape === "gourmet" && buildingH > 0;
  const isLoft = shape === "loft" && buildingH > 0;

  // Altura do letreiro consistente em todos os lados
  const signH = Math.max(buildingW, buildingD) * SIGN_HEIGHT_RATIO;

  // Empire, Taipei e One Trade tem mastros estreitos no topo; o letreiro fica no corpo principal.
  // Residencial: letreiro apoiado na laje de cobertura, à frente do guarda-corpo.
  // Apartment, Varanda Gourmet e Loftifício: apoiado no topo da platibanda.
  const yOffset = isResidential
    ? getResidentialRoofOffset(buildingH) + signH / 2
    : isApartment
      ? getApartmentRoofOffset(buildingH) + signH / 2
      : isGourmet
        ? getGourmetRoofOffset(buildingH) + signH / 2
        : isLoft
          ? getLoftRoofOffset(buildingH) + signH / 2
          : buildingH * (
          isEmpire
            ? 0.1
            : isTaipei
              ? TAIPEI_SIGN_Y_OFFSET_RATIO
              : isOneTrade
                ? ONE_TRADE_SIGN_Y_OFFSET_RATIO
                : 0.45
        );

  // Para edifícios torcidos, calcula o ângulo da torção exatamente na altura do
  // letreiro. A geometria torcida (createTwistedBuildingMesh) usa
  // `angle = (y_unit + 0.5) * TWIST_TOTAL_ANGLE` com y_unit em [-0.5, 0.5];
  // o letreiro está em y_unit = yOffset / buildingH.
  const isTwisted = shape === "twisted" && buildingH > 0;
  const isOctagonal = shape === "octagonal";
  const isSetback = shape === "setback" && buildingH > 0;
  const isTapered = shape === "tapered" && buildingH > 0;
  const isChrysler = shape === "chrysler" && buildingH > 0;
  const isHearst = shape === "hearst" && buildingH > 0;
  const heightRatio = yOffset / buildingH + 0.5;
  const setbackScale = isSetback
    ? getSetbackFootprintScaleAtHeightRatio(heightRatio)
    : 1;
  const taperedScale = isTapered
    ? getTaperedFootprintScaleAtHeightRatio(heightRatio)
    : 1;
  const chryslerScale = isChrysler
    ? getChryslerFootprintScaleAtHeightRatio(heightRatio)
    : 1;
  const taipeiScale = isTaipei
    ? getTaipeiFootprintScaleAtHeightRatio(heightRatio)
    : 1;
  const oneTradeScale = isOneTrade
    ? getOneTradeFootprintScaleAtHeightRatio(heightRatio)
    : 1;
  const hearstXSpanRatio = isHearst
    ? getHearstFaceSpanRatio("x", heightRatio)
    : 1;
  const hearstZSpanRatio = isHearst
    ? getHearstFaceSpanRatio("z", heightRatio)
    : 1;
  const empireScale = isEmpire
    ? getEmpireFootprintScaleAtHeightRatio(heightRatio)
    : { x: 1, z: 1 };
  const twistAngle = isTwisted
    ? (yOffset / buildingH + 0.5) * TWIST_TOTAL_ANGLE
    : 0;
  const cosT = Math.cos(twistAngle);
  const sinT = Math.sin(twistAngle);

  // Definição dos 4 lados: frente (+Z), trás (−Z), direita (+X), esquerda (−X)
  // rotY deve rotacionar a normal do plano (+Z) para apontar PARA FORA do edifício.
  //   PlaneGeometry normal = +Z.
  //   Rotação +π/2 em Y: (0,0,1) → (+1,0,0) = face aponta +X (para fora da direita)  ✓
  //   Rotação −π/2 em Y: (0,0,1) → (−1,0,0) = face aponta −X (para fora da esquerda) ✓
  const sideConfigs: Array<{
    faceW: number;
    rotY: number;
    offsetX: number;
    offsetZ: number;
  }> = [
    // Frente (+Z): normal já aponta +Z. Largura world ao longo de X (axis-aligned)
    // ou (W·cos, D·sin) (twisted) — calculada abaixo.
    { faceW: buildingW, rotY: 0, offsetX: 0, offsetZ: 1 },
    // Trás (−Z): rotação π → normal aponta −Z
    { faceW: buildingW, rotY: Math.PI, offsetX: 0, offsetZ: -1 },
    // Direita (+X): rotação +π/2 → normal aponta +X
    { faceW: buildingD, rotY: Math.PI / 2, offsetX: 1, offsetZ: 0 },
    // Esquerda (−X): rotação −π/2 → normal aponta −X
    { faceW: buildingD, rotY: -Math.PI / 2, offsetX: -1, offsetZ: 0 },
  ];

  // Painéis (canvas + textura + materiais + geometrias) cacheados por largura:
  // faces opostas têm placa idêntica — reusa em vez de rasterizar canvas e subir
  // textura duplicada pra GPU (antes: até 4 CanvasTextures iguais por letreiro).
  type SignPanel = ReturnType<typeof createSignPanel>;
  const panelCache = new Map<string, SignPanel>();
  const disposables: SignPanel[] = [];
  const strutGeos: THREE.BoxGeometry[] = [];

  for (let i = 0; i < clampedSides; i++) {
    const cfg = sideConfigs[i];

    // Largura world da face. No edifício torcido, a face que era +Z se estende
    // ao longo do vetor (cos, 0, sin) em unit-space; após escala não-uniforme
    // (W em x, D em z), o comprimento real é sqrt((W·cos)² + (D·sin)²). Para as
    // laterais, o eixo da face é (−sin, 0, cos), trocando os papéis.
    let faceWorldW: number;
    if (isTwisted) {
      const isFrontBack = cfg.offsetZ !== 0;
      const aw = isFrontBack ? buildingW * cosT : buildingW * sinT;
      const ad = isFrontBack ? buildingD * sinT : buildingD * cosT;
      faceWorldW = Math.sqrt(aw * aw + ad * ad);
    } else if (isOctagonal) {
      faceWorldW = cfg.faceW * OCTAGON_FLAT_SIDE_RATIO;
    } else if (isSetback) {
      faceWorldW = cfg.faceW * setbackScale;
    } else if (isTapered) {
      faceWorldW = cfg.faceW * taperedScale;
    } else if (isChrysler) {
      faceWorldW = cfg.faceW * chryslerScale;
    } else if (isTaipei) {
      faceWorldW = cfg.faceW * taipeiScale;
    } else if (isOneTrade) {
      faceWorldW = cfg.faceW * oneTradeScale;
    } else if (isGourmet) {
      faceWorldW = cfg.faceW * GOURMET_TOWER_SCALE;
    } else if (isHearst) {
      faceWorldW = cfg.faceW * (cfg.offsetZ !== 0 ? hearstXSpanRatio : hearstZSpanRatio);
    } else if (isEmpire) {
      faceWorldW = cfg.faceW * (cfg.offsetZ !== 0 ? empireScale.x : empireScale.z);
    } else {
      faceWorldW = cfg.faceW;
    }
    const signW = faceWorldW * 0.92;

    const panelKey = signW.toFixed(3);
    let panel = panelCache.get(panelKey);
    if (!panel) {
      panel = createSignPanel(trimmed, signW, signH);
      panelCache.set(panelKey, panel);
      disposables.push(panel);
    }
    const { signMaterial, backingMaterial, planeGeo, backingGeo } = panel;

    const signPlane = new THREE.Mesh(planeGeo, signMaterial);
    const backing = new THREE.Mesh(backingGeo, backingMaterial);

    // Posição/rotação do painel.
    //
    // No caminho axis-aligned, basta usar a face e empurrar a placa para fora
    // pela normal cardinal.
    //
    // No torcido, dois cuidados:
    //
    // 1. **Normal verdadeira da face em world-space**. Com escala não-uniforme
    //    (W ≠ D), a normal NÃO é o vetor unit-space twisted normalizado — é a
    //    *inversa transposta*: para uma matriz de escala diag(W, 1, D), a
    //    inversa transposta é diag(1/W, 1, 1/D), então a normal world é
    //    (n_unit.x/W, n_unit.z/D) re-normalizada. Usar o vetor de posição
    //    como direção de empurrão (o que a versão anterior fazia) deixa o
    //    plano levemente desalinhado da face — uma ponta sai, a outra entra.
    //
    // 2. **Margem maior**. Mesmo com a normal correta no centro do letreiro,
    //    o plano é flat e a fachada é curva: ao longo da altura do letreiro
    //    (~signH), a fachada gira mais alguns graus, e os cantos superior/
    //    inferior do plano ainda podem cortar a face. Aumentamos o offset de
    //    0.02 → 0.10 só para shape="twisted", deixando a placa nitidamente à
    //    frente — equivale a "um pouco para frente apenas nesse modelo".
    let px: number;
    let pz: number;
    let backX: number;
    let backZ: number;
    let planeRotY: number;
    let twistedSupport:
      | {
          faceX: number;
          faceZ: number;
          normalX: number;
          normalZ: number;
          backPush: number;
        }
      | null = null;
    if (isTwisted) {
      // Vetor unit-space twisted da normal cardinal (offsetX, 0, offsetZ).
      const unitNx = cfg.offsetX * cosT - cfg.offsetZ * sinT;
      const unitNz = cfg.offsetX * sinT + cfg.offsetZ * cosT;
      // Attach point: 0,5 unit ao longo da normal, depois escalado a world.
      const faceX = unitNx * 0.5 * buildingW;
      const faceZ = unitNz * 0.5 * buildingD;
      // Normal world via inversa transposta da escala não-uniforme.
      const wnxRaw = unitNx / buildingW;
      const wnzRaw = unitNz / buildingD;
      const wnLen = Math.sqrt(wnxRaw * wnxRaw + wnzRaw * wnzRaw) || 1;
      const wnx = wnxRaw / wnLen;
      const wnz = wnzRaw / wnLen;

      const PUSH = 0.1;
      const BACK_PUSH = 0.085;
      px = faceX + wnx * PUSH;
      pz = faceZ + wnz * PUSH;
      backX = faceX + wnx * BACK_PUSH;
      backZ = faceZ + wnz * BACK_PUSH;

      // Rotação Y do plano: Three.js gira (0,0,1) → (sinθ, 0, cosθ). Igualando
      // ao vetor (wnx, 0, wnz) → θ = atan2(wnx, wnz). Isso alinha o plano
      // exatamente com a tangente da face na altura do letreiro, eliminando o
      // viés de ~4–8° produzido pelo `cfg.rotY − twistAngle` ingênuo.
      planeRotY = Math.atan2(wnx, wnz);
      twistedSupport = {
        faceX,
        faceZ,
        normalX: wnx,
        normalZ: wnz,
        backPush: BACK_PUSH,
      };
    } else {
      const footprintW = isEmpire
        ? buildingW * empireScale.x
        : buildingW * (
            isSetback
              ? setbackScale
              : isTapered
                ? taperedScale
              : isChrysler
                ? chryslerScale
                : isTaipei
                  ? taipeiScale
                  : isOneTrade
                    ? oneTradeScale
                  : isGourmet
                    ? GOURMET_TOWER_SCALE
                  : 1
          );
      const footprintD = isEmpire
        ? buildingD * empireScale.z
        : buildingD * (
            isSetback
              ? setbackScale
              : isTapered
                ? taperedScale
              : isChrysler
                ? chryslerScale
                : isTaipei
                  ? taipeiScale
                  : isOneTrade
                    ? oneTradeScale
                  : isGourmet
                    ? GOURMET_TOWER_SCALE
                  : 1
          );
      const normalOffset = cfg.offsetZ !== 0 ? footprintD / 2 : footprintW / 2;
      const dist = normalOffset + 0.02;
      px = cfg.offsetX * dist;
      pz = cfg.offsetZ * dist;
      const backDist = normalOffset + 0.005;
      backX = cfg.offsetX * backDist;
      backZ = cfg.offsetZ * backDist;
      planeRotY = cfg.rotY;
    }

    signPlane.position.set(px, yOffset, pz);
    signPlane.rotation.y = planeRotY;
    signPlane.translateZ(SIGN_FACE_GAP);

    backing.position.set(backX, yOffset, backZ);
    backing.rotation.y = planeRotY;

    group.add(backing);
    if (twistedSupport) {
      addTwistedSignSupports(group, backingMaterial, strutGeos, {
        ...twistedSupport,
        yOffset,
        signW,
        signH,
        rotY: planeRotY,
      });
    }
    group.add(signPlane);
  }

  group.userData.signDisposables = disposables;
  group.userData.signStrutGeos = strutGeos;

  return group;
}

/** Cria o canvas, textura, materiais e geometrias para um painel de letreiro. */
function createSignPanel(
  text: string,
  signW: number,
  signH: number,
): {
  texture: THREE.CanvasTexture;
  signMaterial: THREE.MeshStandardMaterial;
  backingMaterial: THREE.MeshStandardMaterial;
  planeGeo: THREE.PlaneGeometry;
  backingGeo: THREE.BoxGeometry;
} {
  const aspect = signW / signH;
  const canvasW = Math.round(CANVAS_HEIGHT * aspect);
  const canvasH = CANVAS_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // Fundo: painel escuro com borda sutil
  ctx.fillStyle = "rgba(8, 10, 16, 0.88)";
  roundRect(ctx, 0, 0, canvasW, canvasH, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, canvasW - 2, canvasH - 2, 7);
  ctx.stroke();

  // Texto — ajustar tamanho para caber
  const maxTextW = canvasW * (1 - PADDING * 2);
  const fontFor = (size: number) =>
    `600 ${size}px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  let fontSize = Math.floor(canvasH * 0.52);
  ctx.font = fontFor(fontSize);
  ctx.textBaseline = "middle";

  // Largura do texto é linear no tamanho da fonte: um ajuste proporcional em vez de
  // descer de 1 em 1 px (cada passo = parse de fonte + measureText na main thread).
  const fullWidth = ctx.measureText(text).width;
  if (fullWidth > maxTextW) {
    fontSize = Math.max(10, Math.floor((fontSize * maxTextW) / fullWidth));
    ctx.font = fontFor(fontSize);
  }

  const textWidth = ctx.measureText(text).width;
  const textX = (canvasW - textWidth) / 2;
  const textY = canvasH / 2;

  // Glow LED
  ctx.shadowColor = "rgba(200, 220, 255, 0.6)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(220, 230, 255, 0.95)";
  ctx.fillText(text, textX, textY);

  // Texto nítido por cima
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e8ecf4";
  ctx.fillText(text, textX, textY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const signMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.4,
    roughness: 0.35,
    metalness: 0.6,
    transparent: true,
  });

  const backingMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.7,
    metalness: 0.5,
  });

  const planeGeo = new THREE.PlaneGeometry(signW, signH);
  const backingGeo = new THREE.BoxGeometry(signW + 0.04, signH + 0.04, 0.03);

  return { texture, signMaterial, backingMaterial, planeGeo, backingGeo };
}

/** Descarta geometrias, texturas e materiais de um sign group. */
export function disposeSignMesh(group: THREE.Group): void {
  const disposables = group.userData.signDisposables;
  if (Array.isArray(disposables)) {
    for (const d of disposables) {
      d.texture.dispose();
      d.signMaterial.dispose();
      d.backingMaterial.dispose();
      d.planeGeo.dispose();
      d.backingGeo.dispose();
    }
  }
  const strutGeos = group.userData.signStrutGeos;
  if (Array.isArray(strutGeos)) {
    for (const geo of strutGeos) geo.dispose();
  }
}

function addTwistedSignSupports(
  group: THREE.Group,
  material: THREE.MeshStandardMaterial,
  strutGeos: THREE.BoxGeometry[],
  params: {
    faceX: number;
    faceZ: number;
    normalX: number;
    normalZ: number;
    yOffset: number;
    signW: number;
    signH: number;
    rotY: number;
    backPush: number;
  },
): void {
  const supportLength =
    params.backPush + TWISTED_SUPPORT_FACE_OVERLAP + TWISTED_SUPPORT_BACKING_OVERLAP;
  const supportGeo = new THREE.BoxGeometry(
    TWISTED_SUPPORT_THICKNESS,
    TWISTED_SUPPORT_THICKNESS,
    supportLength,
  );
  strutGeos.push(supportGeo);

  const normalOffset =
    (params.backPush + TWISTED_SUPPORT_BACKING_OVERLAP - TWISTED_SUPPORT_FACE_OVERLAP) / 2;
  const tangentX = Math.cos(params.rotY);
  const tangentZ = -Math.sin(params.rotY);
  const cornerX = Math.max(0, params.signW / 2 - TWISTED_SUPPORT_THICKNESS);
  const cornerY = Math.max(0, params.signH / 2 - TWISTED_SUPPORT_THICKNESS);

  const corners: Array<[number, number]> = [
    [-cornerX, -cornerY],
    [cornerX, -cornerY],
    [-cornerX, cornerY],
    [cornerX, cornerY],
  ];

  for (const [xOffset, yOffset] of corners) {
    const support = new THREE.Mesh(supportGeo, material);
    support.position.set(
      params.faceX + params.normalX * normalOffset + tangentX * xOffset,
      params.yOffset + yOffset,
      params.faceZ + params.normalZ * normalOffset + tangentZ * xOffset,
    );
    support.rotation.y = params.rotY;
    group.add(support);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
