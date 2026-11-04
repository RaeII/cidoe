/**
 * Render headless de um formato de edifício com a luz da cidade, pra avaliar o
 * visual sem subir o app nem criar doação. Sai 1 PNG com 4 vistas — 3/4 frente,
 * 3/4 fundos, topo, base — e a referência ao lado, se passada. Bundle e HTML
 * ficam numa pasta temporária apagada no fim: só o PNG sobra.
 *
 * Uso: node scripts/render-building.mjs <formato> [opções]
 *   --height <n>                   altura na cena, 0,5–16 (padrão 4)
 *   --ref <imagem>                 referência ao lado das vistas
 *   --color <hex>                  cor da customização (aplicada como no manager)
 *   --slot <i>=<hex>[,metal[,rough]]  sobrescreve o material do slot i (calibrar autoral; repetível)
 *   --out <png>                    saída (padrão: <tmp>/cidoe-render/<formato>.png, sobrescreve)
 * Navegador: env CHROME, senão Chrome/Brave/Chromium nos caminhos padrão.
 *
 * Fiel à cena: mesmo HDRI (IBL + céu), luz ambiente padrão, ACES 1,45, lote 2×2.
 * Fora: texturas PBR, parapeito, acessórios e envMap dinâmico — conferir no app.
 * Erro na página sai escrito no próprio PNG.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TILE = { w: 480, h: 640 };
const VIEW_COUNT = 4;
const BROWSERS = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

// Roda no navegador. Importa os builders reais do projeto (bundle do esbuild).
const PAGE = `
import * as THREE from "three";
import { BUILDING_SHAPES, createBuildingShapeMesh, createUnitBuildingGeometry } from "./src/scene/builders/createBuildingShapeMesh.ts";
import { setEmpireBuildingMeshColor } from "./src/scene/builders/createEmpireBuildingMesh.ts";
import { setResidentialBuildingHeight } from "./src/scene/builders/createResidentialBuildingMesh.ts";
import { setApartmentBuildingHeight } from "./src/scene/builders/createApartmentBuildingMesh.ts";
import { setGourmetBuildingHeight } from "./src/scene/builders/createGourmetBuildingMesh.ts";
import { setLoftBuildingHeight } from "./src/scene/builders/createLoftBuildingMesh.ts";
import { setYachthouseBuildingHeight } from "./src/scene/builders/createYachthouseBuildingMesh.ts";
import { getLightMetrics } from "./src/scene/utils/lighting.ts";
import { DEFAULT_LIGHT_SETTINGS } from "./src/scene/config/lightConfig.ts";
import { DEFAULT_BUILDING_SETTINGS } from "./src/scene/config/buildingConfig.ts";
import { DEFAULT_GROUND_SETTINGS } from "./src/scene/config/groundConfig.ts";

// Formatos com nº de andares pela altura: mesmo setter que o manager chama no sync.
const HEIGHT_SETTERS = {
  residential: setResidentialBuildingHeight,
  apartment: setApartmentBuildingHeight,
  gourmet: setGourmetBuildingHeight,
  loft: setLoftBuildingHeight,
  yachthouse: setYachthouseBuildingHeight,
};
const LOT = 2; // DONATION_LAYOUT.buildingWidth/Depth do manager
// Azimute a partir de +Z (frente), elevação da câmera e faixa da altura enquadrada.
const VIEWS = [
  { az: 35, el: 15, from: 0, to: 1 },
  { az: 215, el: 15, from: 0, to: 1 },
  { az: 35, el: 30, from: 0.72, to: 1 },
  { az: 35, el: 22, from: 0, to: 0.28 },
];
const FOV = 30;
const hex = (value) => (value.startsWith("#") ? value : "#" + value);

function render({ shape, height, color, slots, tile }) {
  if (!BUILDING_SHAPES.includes(shape)) {
    throw new Error("formato desconhecido: " + shape + "\\nconhecidos: " + BUILDING_SHAPES.join(", "));
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(tile.w * VIEWS.length, tile.h);
  renderer.setScissorTest(true);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45; // = createCitySceneRuntime
  document.getElementById("views").appendChild(renderer.domElement);

  // Mesmos arquivos de loadEnvironment: céu visível + fonte do PMREM.
  const equirect = (id) => {
    const texture = new THREE.Texture(document.getElementById(id));
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  const scene = new THREE.Scene();
  scene.background = equirect("sky");
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(equirect("env")).texture;
  scene.add(new THREE.AmbientLight(DEFAULT_LIGHT_SETTINGS.ambientColor, getLightMetrics(DEFAULT_LIGHT_SETTINGS).ambientTotal));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: DEFAULT_GROUND_SETTINGS.color, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Fachada/topo como os do manager (sem textura); autorais sobrescrevem no builder.
  const base = {
    roughness: DEFAULT_BUILDING_SETTINGS.roughness,
    metalness: DEFAULT_BUILDING_SETTINGS.metalness,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
  };
  const facade = new THREE.MeshPhysicalMaterial({ ...base, color: DEFAULT_BUILDING_SETTINGS.color });
  const top = new THREE.MeshPhysicalMaterial({ ...base, color: "#b9b6b1" }); // TOP_CEMENT_COLOR
  const mesh = createBuildingShapeMesh(shape, facade, top, createUnitBuildingGeometry());
  mesh.scale.set(LOT, height, LOT);
  HEIGHT_SETTERS[shape]?.(mesh, height);
  mesh.position.y = height / 2;
  scene.add(mesh);

  if (color) {
    if (shape === "empire") setEmpireBuildingMeshColor(mesh, hex(color));
    else facade.color.set(hex(color));
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const slot of slots) {
    const [index, spec = ""] = slot.split("=");
    const [value, metalness, roughness] = spec.split(",");
    const material = materials[Number(index)];
    if (!material || !value) throw new Error("--slot " + slot + ": formato tem " + materials.length + " slots");
    material.color.set(hex(value));
    if (metalness) material.metalness = Number(metalness);
    if (roughness) material.roughness = Number(roughness);
  }

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(FOV, tile.w / tile.h, 0.01, 1000);
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const tanH = tanV * camera.aspect;
  const center = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const corner = new THREE.Vector3();
  VIEWS.forEach((view, i) => {
    const part = box.clone();
    part.min.y = box.min.y + size.y * view.from;
    part.max.y = box.min.y + size.y * view.to;
    part.getCenter(center);
    const az = THREE.MathUtils.degToRad(view.az);
    const el = THREE.MathUtils.degToRad(view.el);
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(center).add(dir);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    // Distância mínima pra cada canto da caixa caber no quadro (esfera sobra em prédio esbelto).
    let distance = 0;
    for (let c = 0; c < 8; c++) {
      corner.set(c & 1 ? part.max.x : part.min.x, c & 2 ? part.max.y : part.min.y, c & 4 ? part.max.z : part.min.z).sub(center);
      const depth = corner.dot(dir);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanH, depth + Math.abs(corner.dot(up)) / tanV);
    }
    camera.position.copy(center).addScaledVector(dir, distance * 1.06);
    camera.lookAt(center);
    renderer.setViewport(i * tile.w, 0, tile.w, tile.h);
    renderer.setScissor(i * tile.w, 0, tile.w, tile.h);
    renderer.render(scene, camera);
  });
}

// Imagens no DOM seguram o load: céu e referência já decodificados aqui.
window.addEventListener("load", () => {
  try {
    render(window.RENDER);
  } catch (error) {
    const pre = document.createElement("pre");
    pre.style.cssText = "color:#c00;font:16px monospace;padding:16px;white-space:pre-wrap";
    pre.textContent = String(error?.stack ?? error);
    document.body.replaceChildren(pre);
  }
});
`;

const { values, positionals: [shape] } = parseArgs({
  allowPositionals: true,
  options: {
    height: { type: "string", default: "4" },
    ref: { type: "string" },
    color: { type: "string" },
    slot: { type: "string", multiple: true, default: [] },
    out: { type: "string" },
  },
});
if (!shape) {
  console.error("uso: node scripts/render-building.mjs <formato> [--height n] [--ref img] [--color hex] [--slot i=hex[,metal[,rough]]] [--out png]");
  process.exit(1);
}
const browser = BROWSERS.find((path) => path && existsSync(path));
if (!browser) {
  console.error("navegador não encontrado: defina CHROME=<caminho do Chrome/Brave/Chromium>");
  process.exit(1);
}
const height = Number(values.height);
if (!(height > 0)) {
  console.error(`--height inválido: ${values.height}`);
  process.exit(1);
}
const ref = values.ref && resolve(values.ref);
if (ref && !existsSync(ref)) {
  console.error(`--ref não existe: ${ref}`);
  process.exit(1);
}
const out = resolve(values.out ?? join(tmpdir(), "cidoe-render", `${shape}.png`));

const work = mkdtempSync(join(tmpdir(), "cidoe-render-build-"));
try {
  await build({
    stdin: { contents: PAGE, resolveDir: ROOT, loader: "js" },
    bundle: true, format: "iife", platform: "browser", target: "es2022",
    outfile: join(work, "page.js"), logLevel: "warning",
  });
  const asset = (name) => pathToFileURL(join(ROOT, "src/assets/environment", name)).href;
  const config = { shape, height, color: values.color, slots: values.slot, tile: TILE };
  writeFileSync(join(work, "index.html"), `<!doctype html>
<body style="margin:0;display:flex;background:#fff">
<img id="env" src="${asset("DaySkyHDRI040B_4K_TONEMAPPED.pmrem.webp")}" hidden>
<img id="sky" src="${asset("DaySkyHDRI040B_4K_TONEMAPPED.low.webp")}" hidden>
<div id="views"></div>
${ref ? `<img src="${pathToFileURL(ref).href}" style="width:${TILE.h}px;height:${TILE.h}px;object-fit:contain">` : ""}
<script>window.RENDER = ${JSON.stringify(config)};</script>
<script src="page.js"></script>
</body>`);

  mkdirSync(dirname(out), { recursive: true });
  rmSync(out, { force: true });
  // SwiftShader: mesmo resultado com ou sem GPU; file:// liberado pro WebGL ler as imagens.
  const result = spawnSync(browser, [
    "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--hide-scrollbars", "--allow-file-access-from-files",
    `--window-size=${TILE.w * VIEW_COUNT + (ref ? TILE.h : 0)},${TILE.h}`,
    `--screenshot=${out}`, pathToFileURL(join(work, "index.html")).href,
  ], { encoding: "utf8", timeout: 120_000 });
  // exitCode, não exit(): o finally ainda apaga a pasta temporária.
  if (existsSync(out)) console.log(out);
  else {
    console.error(result.error?.message ?? result.stderr);
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
