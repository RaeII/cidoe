/**
 * Checagem dos formatos de edifício (todo formato do catálogo produz mesh com
 * geometria real e os 2 slots de material) + do preview do admin (keys do
 * catálogo resolvem pro builder certo; enquadramento ignora volumétrico).
 * Roda sem navegador — só matemática de BufferGeometry, nada de WebGL.
 *
 * Uso: node scripts/check-building-shapes.mjs
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";

// Bundle em memória: não cria servidor, watcher ou porta de teste.
const bundle = await build({
  stdin: {
    contents: ["createBuildingShapeMesh", "createEdgeLightMesh", "createPreviewScene", "createParapetMesh",
      "createResidentialBuildingMesh", "createApartmentBuildingMesh", "createGourmetBuildingMesh", "createLoftBuildingMesh", "createYachthouseBuildingMesh", "createHologramMesh"]
      .map((name) => `export * from './src/scene/builders/${name}.ts';`).join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { BUILDING_SHAPES, createBuildingShapeMesh, createUnitBuildingGeometry, createPreviewScene,
  disposeBuildingShapeSharedResources, createEdgeLightMesh, resolveSubject, frameBox,
  createParapetGeometry, getParapetHeightScale, createBuildingParapets,
  setResidentialBuildingHeight, setResidentialStoneMaps, getResidentialFloorCount,
  setApartmentBuildingHeight, getApartmentFloorCount, getApartmentTierFootprints, getApartmentRoofOffset,
  setGourmetBuildingHeight, getGourmetFloorCount, getGourmetTierFootprints, getGourmetRoofOffset,
  setLoftBuildingHeight, getLoftFloorCount, getLoftTierFootprints, getLoftRoofOffset,
  setYachthouseBuildingHeight, getYachthouseFloorCount, getYachthouseTowerFootprints, getYachthouseRoofOffset,
  createHologramMesh, setHologramImage, disposeHologramMesh } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const box = new THREE.Box3();
for (const shape of BUILDING_SHAPES) {
  const facade = new THREE.MeshStandardMaterial();
  const top = new THREE.MeshStandardMaterial();
  const mesh = createBuildingShapeMesh(shape, facade, top, createUnitBuildingGeometry());
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const size = box.setFromObject(mesh).getSize(new THREE.Vector3());

  assert.ok(materials[0] === facade && materials[1] === top, `${shape}: slots de material trocados`);
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0, `${shape}: geometria degenerada (${size.toArray()})`);
  // Unitária: quem escala é a cena. Folga pra antena/coroamento passar do topo.
  assert.ok(size.y > 0.5 && size.y < 1.5, `${shape}: altura ${size.y} — geometria não é unitária`);
  if (shape === "yachthouse") {
    // Embasamento ocupa o lote em X; em Z fica 32% recuado (barra longa da referência).
    assert.ok(Math.abs(size.x - 1) < 1e-6 && Math.abs(size.y - 1) < 1e-6, "yachthouse: fora do lote");
    assert.ok(size.z > 0.6 && size.z < 0.75, `yachthouse: embasamento com profundidade ${size.z}`);
    assert.equal(materials.length, 5, "yachthouse: 5 slots (dourado, topo, vidro, esquadria, embasamento)");
    assert.equal(mesh.geometry.groups.length, 5, "yachthouse: 1 draw call por material");
    mesh.geometry.groups.forEach((group, i) => assert.equal(group.materialIndex, i, "yachthouse: grupo fora do slot"));
    for (const name of ["position", "normal", "aProjPosition", "aProjNormal"]) {
      assert.ok(mesh.geometry.getAttribute(name).array.every(Number.isFinite), `yachthouse: ${name} inválido`);
    }
    // Vão real entre torres; torres e embasamento respondem ao picking.
    mesh.updateMatrixWorld(true);
    const cast = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1)).intersectObject(mesh);
    assert.equal(cast(0, 0).length, 0, "yachthouse: vão central fechado");
    assert.ok(cast(-0.3, 0).length > 0 && cast(0.3, 0).length > 0, "yachthouse: torre ausente");
    assert.ok(cast(0.05, 0).length > 0, "yachthouse: vão entre torres passa de 5 m");
    assert.ok(cast(0, -0.45).length > 0, "yachthouse: embasamento ausente");
    // Rasgo envidraçado: vidro recuado 1,2 m no meio da face (0,179 = fundo do rasgo; ≥ 0,203 = face).
    const faceZ = (x) => cast(x, 0)[0]?.point.z;
    assert.ok(Math.abs(faceZ(0.26) - 0.179) < 1e-3 && faceZ(0.32) > 0.2, "yachthouse: rasgo vertical ausente");
    // Faixa de sacada: lateral dourada (slot 0), tampa escura — só o topo das
    // pilastras (escondido sob a faixa) fica no dourado olhando pra cima.
    const trim = mesh.geometry.groups[0];
    const pos = mesh.geometry.getAttribute("position");
    const tri = new THREE.Triangle();
    const normal = new THREE.Vector3();
    let flat = 0;
    let total = 0;
    for (let i = trim.start; i < trim.start + trim.count; i += 3) {
      tri.setFromAttributeAndIndices(pos, i, i + 1, i + 2);
      const area = tri.getArea();
      total += area;
      if (Math.abs(tri.getNormal(normal).y) > 0.5) flat += area;
    }
    assert.ok(flat / total < 0.01, `yachthouse: topo de faixa dourado (${(flat / total).toFixed(3)})`);
    // Pé-direito real: nº de andares segue a altura, geometria cacheada por andar.
    const preview = mesh.geometry;
    setYachthouseBuildingHeight(mesh, 16);
    const tall = mesh.geometry;
    assert.notEqual(tall, preview, "yachthouse: altura não trocou nº de andares");
    assert.ok(tall.getAttribute("position").count > preview.getAttribute("position").count, "yachthouse: prédio alto com menos andares");
    setYachthouseBuildingHeight(mesh, 16);
    assert.equal(mesh.geometry, tall, "yachthouse: cache por andar não reaproveitado");
    assert.equal(getYachthouseFloorCount(0.5), 1, "yachthouse: prédio mínimo sem andar");
    assert.equal(getYachthouseFloorCount(1000), 81, "yachthouse: teto de andares");
    // LED/letreiro dentro do prédio; acessório na cobertura, abaixo do mastro.
    const towers = getYachthouseTowerFootprints(1, 1, 16);
    assert.equal(towers.length, 2, "yachthouse: duas torres");
    const [body, crown] = towers[0].tiers;
    assert.ok(body.topY === crown.bottomY && crown.topY < 16 && crown.width < body.width, "yachthouse: tiers do LED");
    const roof = getYachthouseRoofOffset(16);
    assert.ok(roof > crown.topY - 8 && roof < 8, "yachthouse: acessório fora da cobertura");
    for (const material of materials.slice(2)) {
      assert.equal(typeof material.userData.authoredEnvMapIntensity, "number", "yachthouse: vidro fora da captura do envMap");
    }
    let disposed = false;
    tall.addEventListener("dispose", () => { disposed = true; });
    disposeBuildingShapeSharedResources();
    assert.ok(disposed, "yachthouse: dispose não libera geometria");
  }
  if (shape === "residential") {
    for (const axis of ["x", "y", "z"]) {
      // Laje frontal 8 mm aquém da aleta dos fundos (0,996): dentro do lote, sem sobra.
      assert.ok(size[axis] <= 1 + 1e-6 && size[axis] > 0.99, `residential: dimensão ${axis} fora do lote`);
    }
    assert.equal(materials.length, 6, "residential: 6 slots (pedra, topo, vidro, guarda-corpo, caixilho, terracota)");
    assert.equal(mesh.geometry.groups.length, 6, "residential: 1 draw call por material");
    mesh.geometry.groups.forEach((group, i) => assert.equal(group.materialIndex, i, "residential: grupo fora do slot"));
    // Pé-direito real: nº de andares segue a altura, geometria cacheada por andar.
    const preview = mesh.geometry;
    setResidentialBuildingHeight(mesh, 16);
    const tall = mesh.geometry;
    assert.notEqual(tall, preview, "residential: altura não trocou nº de andares");
    assert.ok(tall.index.count > preview.index.count, "residential: prédio alto com menos andares");
    setResidentialBuildingHeight(mesh, 16);
    assert.equal(mesh.geometry, tall, "residential: cache por andar não reaproveitado");
    assert.equal(getResidentialFloorCount(0.5), 1, "residential: prédio mínimo sem andar");
    assert.equal(getResidentialFloorCount(1000), 60, "residential: teto de andares");
    // Pedra liga/desliga a textura do topo; vidro do guarda-corpo translúcido sobrevive ao foco.
    const stoneMap = new THREE.Texture();
    setResidentialStoneMaps(facade, { color: stoneMap, normal: null, roughness: null });
    assert.equal(facade.map, stoneMap, "residential: pedra sem textura");
    setResidentialStoneMaps(facade, null);
    assert.equal(facade.map, null, "residential: textura desligada ficou na pedra");
    assert.ok(materials[3].transparent && materials[3].userData.baseOpacity < 1, "residential: guarda-corpo opaco");
    for (const material of materials.slice(2)) {
      assert.equal(typeof material.userData.authoredEnvMapIntensity, "number", "residential: vidro fora da captura do envMap");
    }
    let disposed = false;
    tall.addEventListener("dispose", () => { disposed = true; });
    disposeBuildingShapeSharedResources();
    assert.ok(disposed, "residential: dispose não libera geometria");
  }
  if (shape === "apartment") {
    for (const axis of ["x", "y", "z"]) {
      // Peitoril lateral 3 mm aquém do lote (0,997); pilastra encosta no lote em Z.
      assert.ok(size[axis] <= 1 + 1e-6 && size[axis] > 0.99, `apartment: dimensão ${axis} fora do lote`);
    }
    assert.equal(materials.length, 6, "apartment: 6 slots (reboco, topo, vidro, guarda-corpo, caixilho, acabamento)");
    assert.equal(mesh.geometry.groups.length, 6, "apartment: 1 draw call por material");
    mesh.geometry.groups.forEach((group, i) => assert.equal(group.materialIndex, i, "apartment: grupo fora do slot"));
    for (const name of ["position", "normal", "aProjPosition", "aProjNormal"]) {
      assert.ok(mesh.geometry.getAttribute(name).array.every(Number.isFinite), `apartment: ${name} inválido`);
    }
    // Rasgo das sacadas é vão real na frente e nos fundos; pilastra ao lado é cheia.
    mesh.updateMatrixWorld(true);
    const hitZ = (x, dir) => new THREE.Raycaster(new THREE.Vector3(x, 0, -2 * dir), new THREE.Vector3(0, 0, dir))
      .intersectObject(mesh)[0]?.point.z;
    for (const dir of [1, -1]) {
      assert.ok(Math.abs(hitZ(-0.145, dir) + dir * 0.36) < 0.01, "apartment: rasgo das sacadas fechado");
      assert.ok(Math.abs(hitZ(0.05, dir) + dir * 0.5) < 1e-3, "apartment: pilastra ausente");
    }
    // Pé-direito real: nº de andares segue a altura, geometria cacheada por andar.
    const preview = mesh.geometry;
    setApartmentBuildingHeight(mesh, 16);
    const tall = mesh.geometry;
    assert.notEqual(tall, preview, "apartment: altura não trocou nº de andares");
    assert.ok(tall.getAttribute("position").count > preview.getAttribute("position").count, "apartment: prédio alto com menos andares");
    setApartmentBuildingHeight(mesh, 16);
    assert.equal(mesh.geometry, tall, "apartment: cache por andar não reaproveitado");
    assert.equal(getApartmentFloorCount(0.5), 1, "apartment: prédio mínimo sem andar");
    assert.equal(getApartmentFloorCount(1000), 60, "apartment: teto de andares");
    // Letreiro na platibanda e LED no contorno ficam dentro da altura do prédio.
    const [body, tank] = getApartmentTierFootprints(1, 1, 16);
    assert.ok(body.topY < 16 && tank.topY === 16 && tank.width < 1, "apartment: tiers do LED");
    assert.ok(Math.abs(getApartmentRoofOffset(16) - (body.topY - 8)) < 1e-9, "apartment: letreiro fora da platibanda");
    assert.ok(materials[3].transparent && materials[3].userData.baseOpacity < 1, "apartment: guarda-corpo opaco");
    for (const material of materials.slice(2)) {
      assert.equal(typeof material.userData.authoredEnvMapIntensity, "number", "apartment: vidro fora da captura do envMap");
    }
    let disposed = false;
    tall.addEventListener("dispose", () => { disposed = true; });
    disposeBuildingShapeSharedResources();
    assert.ok(disposed, "apartment: dispose não libera geometria");
  }
  if (shape === "gourmet") {
    for (const axis of ["x", "y", "z"]) {
      // Embasamento 8 cm aquém do lote (0,992); portaria saliente ainda dentro.
      assert.ok(size[axis] <= 1 + 1e-6 && size[axis] > 0.99, `gourmet: dimensão ${axis} fora do lote`);
    }
    assert.equal(materials.length, 6, "gourmet: 6 slots (bege, topo, vidro, guarda-corpo, caixilho, creme)");
    assert.equal(mesh.geometry.groups.length, 6, "gourmet: 1 draw call por material");
    mesh.geometry.groups.forEach((group, i) => assert.equal(group.materialIndex, i, "gourmet: grupo fora do slot"));
    for (const name of ["position", "normal", "aProjPosition", "aProjNormal"]) {
      assert.ok(mesh.geometry.getAttribute(name).array.every(Number.isFinite), `gourmet: ${name} inválido`);
    }
    // Sacadas curvas saem além da face (0,43) no meio; pilastra creme do canto é rente.
    // Lateral: pilastra bege saliente (0,46), rasgo entre elas recuado.
    mesh.updateMatrixWorld(true);
    const hit = (origin, dir) => new THREE.Raycaster(origin, dir).intersectObject(mesh)[0]?.point;
    const front = (x, y) => hit(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1)).z;
    const side = (z) => hit(new THREE.Vector3(2, 0, z), new THREE.Vector3(-1, 0, 0)).x;
    const ys = Array.from({ length: 40 }, (_, i) => -0.3 + i * 0.015);
    assert.ok(Math.max(...ys.map((y) => front(0, y))) > 0.48, "gourmet: sacada curva ausente");
    assert.ok(ys.every((y) => Math.abs(front(0.355, y) - 0.43) < 3e-3), "gourmet: pilastra creme fora da face");
    assert.ok(side(-0.275) > 0.455 && side(-0.125) < 0.44, "gourmet: pilastra bege ou rasgo ausente");
    // Pé-direito real: nº de andares segue a altura, geometria cacheada por andar.
    const preview = mesh.geometry;
    setGourmetBuildingHeight(mesh, 16);
    const tall = mesh.geometry;
    assert.notEqual(tall, preview, "gourmet: altura não trocou nº de andares");
    assert.ok(tall.getAttribute("position").count > preview.getAttribute("position").count, "gourmet: prédio alto com menos andares");
    setGourmetBuildingHeight(mesh, 16);
    assert.equal(mesh.geometry, tall, "gourmet: cache por andar não reaproveitado");
    assert.equal(getGourmetFloorCount(0.5), 1, "gourmet: prédio mínimo sem andar");
    assert.equal(getGourmetFloorCount(1000), 60, "gourmet: teto de andares");
    // LED: embasamento no lote, torre recuada, caixa d'água no topo; letreiro na platibanda.
    const [plinth, tower, tank] = getGourmetTierFootprints(1, 1, 16);
    assert.ok(plinth.width === 1 && tower.width < 1 && tank.width < tower.width && tank.topY === 16, "gourmet: tiers do LED");
    assert.ok(Math.abs(getGourmetRoofOffset(16) - (tower.topY - 8)) < 1e-9, "gourmet: letreiro fora da platibanda");
    assert.ok(materials[3].transparent && materials[3].userData.baseOpacity < 1, "gourmet: guarda-corpo opaco");
    for (const material of materials.slice(2)) {
      assert.equal(typeof material.userData.authoredEnvMapIntensity, "number", "gourmet: vidro fora da captura do envMap");
    }
    let disposed = false;
    tall.addEventListener("dispose", () => { disposed = true; });
    disposeBuildingShapeSharedResources();
    assert.ok(disposed, "gourmet: dispose não libera geometria");
  }
  if (shape === "loft") {
    // Cornija/marquise ainda dentro do lote; caixa d'água encosta no topo.
    assert.ok(size.x <= 1 && size.x > 0.99 && size.z <= 1 && size.z > 0.99 && Math.abs(size.y - 1) < 1e-6, "loft: fora do lote");
    assert.equal(materials.length, 6, "loft: 6 slots (reboco, topo, vidro, alumínio, pastilha, portão)");
    assert.equal(mesh.geometry.groups.length, 6, "loft: 1 draw call por material");
    mesh.geometry.groups.forEach((group, i) => assert.equal(group.materialIndex, i, "loft: grupo fora do slot"));
    for (const name of ["position", "normal", "aProjPosition", "aProjNormal"]) {
      assert.ok(mesh.geometry.getAttribute(name).array.every(Number.isFinite), `loft: ${name} inválido`);
    }
    // Faixa verde 50 cm atrás das pilastras (0,495) em toda a torre; pilotis vaza de lado a lado.
    mesh.updateMatrixWorld(true);
    const cast = (origin, dir) => new THREE.Raycaster(origin, dir).intersectObject(mesh);
    const front = (x, y) => cast(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1))[0].point.z;
    const ys = Array.from({ length: 40 }, (_, i) => -0.3 + i * 0.015);
    assert.ok(ys.every((y) => Math.abs(front(0.17, y) - 0.47) < 1e-3), "loft: faixa verde fora do recuo");
    assert.ok(ys.every((y) => Math.abs(front(0.45, y) - 0.495) < 1e-3 && Math.abs(front(0.05, y) - 0.495) < 1e-3), "loft: pilastra ausente");
    assert.equal(cast(new THREE.Vector3(2, -0.42, 0.4), new THREE.Vector3(-1, 0, 0)).length, 0, "loft: pilotis fechado");
    assert.ok(cast(new THREE.Vector3(2, -0.48, 0.4), new THREE.Vector3(-1, 0, 0)).length > 0, "loft: térreo vazado");
    // Pé-direito real: nº de andares segue a altura, geometria cacheada por andar.
    const preview = mesh.geometry;
    setLoftBuildingHeight(mesh, 16);
    const tall = mesh.geometry;
    assert.notEqual(tall, preview, "loft: altura não trocou nº de andares");
    assert.ok(tall.getAttribute("position").count > preview.getAttribute("position").count, "loft: prédio alto com menos andares");
    setLoftBuildingHeight(mesh, 16);
    assert.equal(mesh.geometry, tall, "loft: cache por andar não reaproveitado");
    assert.equal(getLoftFloorCount(0.5), 1, "loft: prédio mínimo sem andar");
    assert.equal(getLoftFloorCount(1000), 60, "loft: teto de andares");
    // LED: corpo até a platibanda + caixa d'água no topo; letreiro na platibanda.
    const [body, tank] = getLoftTierFootprints(1, 1, 16);
    assert.ok(body.width === 1 && tank.width < 0.5 && tank.topY === 16, "loft: tiers do LED");
    assert.ok(Math.abs(getLoftRoofOffset(16) - (body.topY - 8)) < 1e-9, "loft: letreiro fora da platibanda");
    for (const material of materials.slice(2)) {
      assert.equal(typeof material.userData.authoredEnvMapIntensity, "number", "loft: material fora da captura do envMap");
    }
    let disposed = false;
    tall.addEventListener("dispose", () => { disposed = true; });
    disposeBuildingShapeSharedResources();
    assert.ok(disposed, "loft: dispose não libera geometria");
  }
  console.log(`ok ${shape} — ${size.toArray().map((n) => n.toFixed(2)).join(" × ")}`);
}

// --- Platibandas: vão livre, contorno real, escala, instancing e ciclo de vida ---
const flatRoofs = ["default", "twisted", "octagonal", "setback", "tapered", "hearst"];
const trimMaterial = new THREE.MeshStandardMaterial();
for (const shape of BUILDING_SHAPES) {
  for (let variant = 0; variant < 3; variant++) {
    const geometry = createParapetGeometry(shape, variant);
    if (!flatRoofs.includes(shape)) {
      assert.equal(geometry, null, `${shape}: coroamento existente deve ser preservado`);
      continue;
    }
    const mesh = new THREE.Mesh(geometry, trimMaterial);
    const trimBox = new THREE.Box3().setFromObject(mesh);
    assert.ok(Math.abs(trimBox.min.y) < 1e-6, `${shape}: platibanda flutuante`);
    assert.ok(trimBox.max.y > 0 && trimBox.max.y < 0.12, `${shape}: platibanda desproporcional`);
    for (const name of ["position", "normal", "color", "aProjPosition", "aProjNormal"]) {
      assert.ok(geometry.getAttribute(name).array.every(Number.isFinite), `${shape}: ${name} inválido`);
    }
    assert.deepEqual(geometry.getAttribute("aProjPosition").array, geometry.getAttribute("position").array);
    assert.deepEqual(geometry.getAttribute("aProjNormal").array, geometry.getAttribute("normal").array);
    const cast = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
    assert.equal(cast(0, 0).length, 0, `${shape}: centro da cobertura fechado`);
    const edgeX = trimBox.max.x / (variant === 2 ? 1.045 : variant === 1 ? 1.025 : 1.018);
    assert.ok(cast(edgeX * 0.97, 0).length > 0, `${shape}: borda ausente`);
    if (shape === "octagonal") assert.equal(cast(0.48, 0.48).length, 0, "octagonal: canto quadrado indevido");
    const expectedWidth = shape === "setback" ? 0.54 : shape === "tapered" ? 0.36 : 1;
    assert.ok(Math.abs(edgeX * 2 - expectedWidth) < 1e-6, `${shape}: contorno fora da fachada`);
    geometry.dispose();
  }
}
trimMaterial.dispose();
assert.equal(getParapetHeightScale(new THREE.Vector3(2, 30, 2)), 2, "acabamento esticado pela altura do prédio");
assert.ok(getParapetHeightScale(new THREE.Vector3(2, 0.5, 2)) * 0.115 < 0.06, "acabamento grande demais em prédio baixo");

const trimScene = new THREE.Scene();
const parapets = createBuildingParapets(trimScene);
// Textura chega depois da criação; normal/foco recebem os mesmos mapas, sem reflexo.
const roofMaterial = new THREE.MeshPhysicalMaterial({
  color: "#b9b6b1", map: new THREE.Texture(), normalMap: new THREE.Texture(),
  bumpMap: new THREE.Texture(), roughness: 0, metalness: 1, clearcoat: 1, envMapIntensity: 5,
});
roofMaterial.normalScale.set(3, 3);
roofMaterial.bumpScale = 0.2;
parapets.updateTexture(roofMaterial);
for (const material of parapets.materials) {
  assert.equal(material.map, roofMaterial.map);
  assert.equal(material.normalMap, roofMaterial.normalMap);
  assert.equal(material.bumpMap, roofMaterial.bumpMap);
  assert.deepEqual(material.normalScale.toArray(), [3, 3]);
  assert.equal(material.bumpScale, 0.2);
  assert.ok(Math.abs(material.color.r - roofMaterial.color.r * 0.8) < 1e-8);
  assert.equal(material.roughness, 1);
  for (const key of ["metalness", "clearcoat", "specularIntensity", "envMapIntensity"]) assert.equal(material[key], 0);
}
const roofMaps = [roofMaterial.map, roofMaterial.normalMap, roofMaterial.bumpMap];
roofMaterial.map = roofMaterial.normalMap = roofMaterial.bumpMap = null;
parapets.updateTexture(roofMaterial);
for (const material of parapets.materials) {
  assert.equal(material.map, null, "desativar texturas deixou mapa na platibanda");
  assert.equal(material.normalMap, null);
  assert.equal(material.bumpMap, null);
}
// Reativar antes do dispose verifica que recursos compartilhados continuam vivos.
[roofMaterial.map, roofMaterial.normalMap, roofMaterial.bumpMap] = roofMaps;
parapets.updateTexture(roofMaterial);
let roofTextureDisposed = false;
roofMaterial.map.addEventListener("dispose", () => { roofTextureDisposed = true; });
const trimBuildings = Array.from({ length: 120 }, (_, id) => ({
  id, shape: "default", position: new THREE.Vector3(id * 3, 5, 0), scale: new THREE.Vector3(2, 10, 2),
}));
parapets.rebuild(trimBuildings);
const batches = () => trimScene.children.filter((mesh) => mesh.isInstancedMesh);
const instanceCount = () => batches().reduce((count, mesh) => count + mesh.count, 0);
assert.equal(batches().length, 3, "cidade deve usar três modelos em três draw calls");
assert.equal(instanceCount(), 120);
const batchForId = (id) => {
  const matrix = new THREE.Matrix4();
  for (const mesh of batches()) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      if (matrix.elements[12] === id * 3) {
        assert.equal(matrix.elements[13], 10, "platibanda fora da cobertura");
        assert.equal(matrix.elements[5], 2, "altura do prédio deformou acabamento");
        return mesh.geometry;
      }
    }
  }
};
const originalVariant = batchForId(7);
parapets.setVerticalOffset(7, 5);
const trimMatrix = new THREE.Matrix4();
let liftedTrim = false;
for (const mesh of batches()) {
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, trimMatrix);
    assert.equal(trimMatrix.elements[13], trimMatrix.elements[12] === 21 ? 15 : 10,
      "entrada deve levantar só a platibanda do edifício novo");
    if (trimMatrix.elements[12] === 21) liftedTrim = true;
  }
}
assert(liftedTrim);
parapets.setVerticalOffset(7, 0);
assert.equal(batchForId(7), originalVariant, "pouso não restaurou a cobertura");
parapets.rebuild([...trimBuildings].reverse());
assert.equal(batchForId(7), originalVariant, "reordenar doações mudou modelo");
parapets.updateVisibility((position) => position.x < 30);
assert.equal(instanceCount(), 10, "culling não compactou platibandas");
parapets.setFocus(7);
assert.equal(instanceCount(), 9, "edifício focado duplicado no batch");
assert.ok(trimScene.children.some((mesh) => !mesh.isInstancedMesh && mesh.visible && mesh.position.x === 21));
parapets.setVerticalOffset(7, 5);
assert.equal(trimScene.children.find((mesh) => !mesh.isInstancedMesh && mesh.visible).position.y, 15);
parapets.setVerticalOffset(7, 0);
assert.equal(trimScene.children.find((mesh) => !mesh.isInstancedMesh && mesh.visible).position.y, 10);
parapets.updateVisibility(() => false);
assert.equal(instanceCount(), 0);
assert.ok(trimScene.children.filter((mesh) => !mesh.isInstancedMesh).every((mesh) => !mesh.visible));
parapets.rebuild([]);
assert.equal(batches().length, 0, "dataset vazio deixou acabamentos antigos");
let trimDisposed = false;
originalVariant.addEventListener("dispose", () => { trimDisposed = true; });
parapets.dispose();
assert.equal(roofTextureDisposed, false, "platibanda descartou textura compartilhada da laje");
for (const map of roofMaps) map.dispose();
roofMaterial.dispose();
assert.ok(trimDisposed, "dispose não liberou geometria da platibanda");
assert.equal(trimScene.children.length, 0);
console.log("ok platibandas — 3 modelos, 6 contornos, vão livre, escala, culling, foco e dispose");

// --- LED de arestas ---
// Regressão: buildInstancedGroup chamava a si mesma no lugar de `return group`,
// estourando a pilha em TODO LED. Cada formato tem que devolver os 3 InstancedMesh
// (core + halo + haloOuter) com pelo menos 1 segmento.
const LED_FOOTPRINT = { width: 1, depth: 1.4, height: 3 };
for (const shape of BUILDING_SHAPES) {
  const led = createEdgeLightMesh("led", LED_FOOTPRINT, shape);
  const instanced = led.children.filter((child) => child.isInstancedMesh);
  assert.equal(instanced.length, 3, `${shape}: LED devia ter 3 InstancedMesh`);
  assert.ok(
    instanced.every((mesh) => mesh.count > 0),
    `${shape}: LED sem segmentos`,
  );
}
assert.equal(createEdgeLightMesh("none", LED_FOOTPRINT), null, "`none` devia dar null");
console.log(`ok LED — ${BUILDING_SHAPES.length} formatos`);

// --- Âncoras do shader que tiram o especular da luz do LED ---
// Sem elas o patch de createDonationManager vira no-op SILENCIOSO em produção e a
// PointLight do LED volta a desenhar um ponto brilhante na fachada do vizinho.
assert.ok(
  THREE.ShaderLib.physical.fragmentShader.includes("#include <lights_physical_pars_fragment>"),
  "meshphysical não inclui mais lights_physical_pars_fragment",
);
assert.ok(
  THREE.ShaderChunk.lights_physical_pars_fragment.includes(
    "reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );",
  ),
  "âncora do directSpecular mudou — atualizar DIRECT_SPECULAR_ANCHOR em createDonationManager",
);
console.log("ok âncoras do shader — especular direto removível");

// --- Preview do admin ---

// Keys semeadas na migration 0008. `none` = ausência de acessório: sem preview.
const SUBJECTS = [
  ...BUILDING_SHAPES.map((key) => ["shape", key, true]),
  ["rooftop", "spotlights", true],
  ["rooftop", "helipad", true],
  ["rooftop", "garden", true],
  ["rooftop", "helicopter", true],
  ["rooftop", "none", false],
  ["edgeLight", "led", true],
  ["edgeLight", "none", false],
  ["shape", "inexistente", false],
  ["rooftop", "inexistente", false],
];

for (const [kind, key, expected] of SUBJECTS) {
  const resolved = resolveSubject({ kind, key });
  assert.equal(Boolean(resolved), expected, `${kind}:${key}: resolveSubject devia dar ${expected}`);
}
console.log(`ok resolveSubject — ${SUBJECTS.length} keys`);

// Feixe de holofote tem 10 unidades e não pode mandar no enquadramento.
const root = new THREE.Group();
root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
const beam = new THREE.Mesh(
  new THREE.BoxGeometry(1, 10, 1),
  new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
);
beam.position.y = 5;
root.add(beam);
const framed = frameBox(root).getSize(new THREE.Vector3());
assert.ok(framed.y <= 1.001, `enquadramento pegou o volumétrico (altura ${framed.y})`);
console.log("ok frameBox — volumétrico ignorado");

// O modal combina o edifício completo sem descartar os caches usados pela cidade.
const appearance = {
  color: "#dd3399", buildingShape: "default", rooftopType: "helicopter", edgeLightType: "led",
  signText: "", signSides: 1, textureKey: null, tilingScale: 1,
  textureTransform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
  hologramImage: null, hologramColor: "#73f2ff", hologramOpacity: 0.78,
};
const sharedMap = new THREE.Texture();
let sharedDisposed = false;
sharedMap.addEventListener("dispose", () => { sharedDisposed = true; });
for (const shape of BUILDING_SHAPES) {
  const view = createPreviewScene({ kind: "shape", shape }, {
    customization: { ...appearance, buildingShape: shape },
    facadeTextures: { color: sharedMap, normal: null, roughness: null, metalness: null, displacement: null },
  });
  const building = view.scene.getObjectByName("building");
  assert.ok(building, `${shape}: prévia sem edifício`);
  assert.ok(view.scene.getObjectByName("rooftop"), `${shape}: prévia sem topo`);
  assert.ok(view.scene.getObjectByName("edgeLight"), `${shape}: prévia sem LED`);
  assert.ok(view.frame(0.5) > view.frame(1), `${shape}: prévia corta em telas estreitas`);
  view.updateStyle({ ...appearance, color: "#123456" });
  assert.ok(building.material[0].color.equals(new THREE.Color("#123456")), `${shape}: cor não acompanha a edição`);
  let materialDisposed = false;
  building.material[0].addEventListener("dispose", () => { materialDisposed = true; });
  view.dispose();
  assert.equal(materialDisposed, true, `${shape}: material da prévia não descartado`);
  assert.equal(sharedDisposed, false, `${shape}: prévia descartou textura da cidade`);
}
sharedMap.dispose();
console.log("ok edifício completo — formatos, cor ao vivo, topo, LED, enquadramento e recursos compartilhados");

// Fechar o modal antes da imagem chegar não pode recriar uma textura descartada.
const originalImage = globalThis.Image;
let pendingImage;
globalThis.Image = class { constructor() { pendingImage = this; } naturalWidth = 100; naturalHeight = 100; };
try {
  const footprint = { width: 1, depth: 1, height: 3 };
  const hologram = createHologramMesh(footprint, { color: "#73f2ff", opacity: 0.78 });
  const loading = setHologramImage(hologram, "data:image/png;base64,preview", footprint);
  disposeHologramMesh(hologram);
  pendingImage.onload();
  await loading;
  assert.equal(hologram.texture, null, "Imagem atrasada recriou textura após fechamento");
} finally {
  if (originalImage === undefined) delete globalThis.Image;
  else globalThis.Image = originalImage;
}
console.log("ok holograma — carga atrasada não recria recursos depois do dispose");

disposeBuildingShapeSharedResources();
console.log(`\n${BUILDING_SHAPES.length} formatos OK`);
