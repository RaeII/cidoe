// node scripts/check-donation-info.mjs — seção e navegação, sem servidor/navegador.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const bundle = await build({
  entryPoints: ["src/components/html/DonationInfoSection.tsx"],
  bundle: true, format: "cjs", platform: "node", packages: "external", jsx: "automatic", write: false,
});
const require = createRequire(import.meta.url);
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  (name) => name === "react" ? { ...React, useMemo: (calculate) => calculate() } : require(name),
  module, module.exports,
);
const { DonationInfoSection } = module.exports;
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node.props) ? [node.props] : []), ...find(node.props.children, predicate)];
}
const donations = [
  { id: 1, value: 0.1, cityId: 10, ongId: 20, ongIds: [20, 20] },
  { id: 2, value: 0.2, cityId: 10, ongId: 20, ongIds: [20, 30] },
];
let viewed, filter, retried = false;
const props = {
  donations, ongs: [{ id: 20, name: "Patas" }, { id: 30, name: "Abrigo" }],
  filter: {}, loadState: { status: "ready", count: 2 },
  onFilterChange: (next) => { filter = next; },
  onViewOng: (id) => { viewed = id; },
  onRetry: () => { retried = true; },
};
const tree = DonationInfoSection(props);
const profileImage = "data:image/jpeg;base64,aW1hZ2Vt";
const withImage = DonationInfoSection({ ...props, ongs: [{ id: 20, name: "Patas", profile_image: profileImage }] });
assert.equal(find(withImage, (item) => item.src === profileImage).length, 1, "Cartão usa a imagem cadastrada da ONG");
const beforeScene = DonationInfoSection({ ...props, mediaReady: false, ongs: [{ id: 20, name: "Patas", profile_image: profileImage }] });
const beforeSceneHtml = renderToStaticMarkup(beforeScene);
assert.match(beforeSceneHtml, /<h1[^>]*>Cidoe: uma cidade 3D pela proteção animal/);
assert.match(beforeSceneHtml, /href="\/sobre"/);
assert.doesNotMatch(beforeSceneHtml, /<img[^>]*src=/, "Conteúdo disponível antes do WebGL sem baixar imagens");
assert.equal(find(beforeScene, (item) => item.src === profileImage).length, 0, "Avatar também aguarda a cena");
const html = renderToStaticMarkup(tree);
assert.match(html, /src="\/cat_dog.jpeg"[^>]*width="1024" height="947"/);
assert.match(html, /<div class="pixel [^"]*aspect-square bg-muted"><picture><source srcSet="\/cat_dog.webp" type="image\/webp"\/>/, "Foto 1:1 na moldura do DS (5.3), WebP com JPG de reserva");
assert.match(html, /animate-fill/, "Espera em blocos enchendo (DS 5.7)");
assert.match(html, /bg-background pattern-paws/, "Fundo de patas do DS");
assert.match(html, /max-w-\[1240px\]/);
assert.match(html, /01<\/span><h2[^>]*>Impacto/, "Cabeçalho numerado do DS, abaixo do H1");
assert.ok(html.indexOf("<header") < html.indexOf("Total arrecadado"));
assert.ok(html.indexOf("Total arrecadado") < html.indexOf("<ul"));
assert.match(html, /<li class="pixel bevel-edge/, "ONG em cartão do DS (6.6)");
assert.doesNotMatch(html, /border-t|border-b|h-px|Páginas de contribuições|Edifício #/, "Sem hairline nem lista individual");
assert.match(html, /R\$.*0,30/, "Total em centavos, sem duplicar edifício multiongs");
assert.match(html, />2<\/p><p[^>]*>ONGs apoiadas</);
assert.match(html, /<strong>2<\/strong> edifícios/, "ONG repetida no registro não duplica contagem");
assert.match(html, />1 cidade</);
const actions = find(tree, (item) => item["aria-label"]?.startsWith("Ver edifícios de"));
assert.equal(actions.length, 2);
actions[0].onClick();
assert.equal(viewed, 20, "ONG com mais edifícios primeiro; callback usa id real");

const manyOngs = Array.from({ length: 12 }, (_, index) => ({ id: index + 20, name: "ONG " + index }));
const limited = DonationInfoSection({ ...props, ongs: manyOngs });
assert.equal(find(limited, (item) => item["aria-label"]?.startsWith("Ver edifícios de")).length, 6);
assert.match(renderToStaticMarkup(limited), /6 de 12 ONGs/);
assert.deepEqual(manyOngs.map((ong) => ong.id), Array.from({ length: 12 }, (_, index) => index + 20), "Ordenação não altera snapshot");
const selected = DonationInfoSection({ ...props, ongs: manyOngs, filter: { cityId: 10, ongId: 31 } });
const selectedActions = find(selected, (item) => item["aria-label"]?.startsWith("Ver edifícios de"));
assert.equal(selectedActions.length, 6);
assert.equal(selectedActions[0]["aria-label"], "Ver edifícios de ONG 11 na cidade", "ONG selecionada fora das primeiras seis permanece acessível");
assert.match(renderToStaticMarkup(selected), /pixel-ink-verde bg-secondary[^]*No filtro/, "Cartão da ONG filtrada marcado");
assert.match(renderToStaticMarkup(selected), /Total neste recorte/);
find(selected, (item) => item.children === "Limpar filtros")[0].onClick();
assert.deepEqual(filter, {});
assert.match(renderToStaticMarkup(DonationInfoSection({ ...props, ongs: [], donations: [] })), /Nenhuma ONG disponível/);
assert.match(renderToStaticMarkup(DonationInfoSection({ ...props, donations: [] })), /Nenhum edifício encontrado/);
assert.match(renderToStaticMarkup(DonationInfoSection({ ...props, loadState: { status: "loading" } })), /role="status"/);
const failed = DonationInfoSection({ ...props, loadState: { status: "error", message: "Falha" } });
assert.match(renderToStaticMarkup(failed), /role="alert"/);
find(failed, (item) => item.onClick === props.onRetry)[0].onClick();
assert.equal(retried, true);
const photo = await readFile(new URL("../public/cat_dog.jpeg", import.meta.url));
const photoBlob = createHash("sha1").update("blob " + photo.length + "\0").update(photo).digest("hex");
assert.equal(photoBlob, "5209301eacc8a04d45c3ff6d8346d278d51acca7", "Foto idêntica à video-2");

// Executa as funções e listeners reais, com scroll/DOM simulados.
const source = await readFile(new URL("../src/components/CitySceneEditor.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("CitySceneEditor.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const editor = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CitySceneEditor");
const scrollFunctions = editor.body.statements.filter((node) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((item) => ["scrollToInfo", "scrollToScene"].includes(item.name.getText(ast))));
const effect = editor.body.statements.find((node) => ts.isExpressionStatement(node)
  && node.getText(ast).includes('el.addEventListener("wheel"'));
class Element {
  parentElement = null;
  overflowY = "visible";
  scrollHeight = 0;
  clientHeight = 0;
}
const el = Object.assign(new Element(), { clientHeight: 800, scrollTop: 0 });
const listeners = new Map();
const scrolls = [];
el.scrollTo = (options) => scrolls.push(options);
el.addEventListener = (name, callback, options) => listeners.set(name, { callback, options });
el.removeEventListener = (name, callback) => {
  assert.equal(callback, listeners.get(name).callback);
  listeners.delete(name);
};
let inInfo = false, cleanup;
const context = {
  scrollRef: { current: el }, HTMLElement: Element,
  getComputedStyle: (node) => ({ overflowY: node.overflowY }),
  useCallback: (callback) => callback,
  useEffect: (callback) => { cleanup = callback(); },
  setInInfo: (value) => { inInfo = value; },
};
const run = (code) => vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
run(scrollFunctions.map((node) => node.getText(ast)).join("\n") + "\nObject.assign(globalThis, { scrollToInfo, scrollToScene });");
run(effect.getText(ast));
context.scrollToInfo();
assert.equal(scrolls.at(-1).top, 800);
assert.equal(scrolls.at(-1).behavior, "smooth");
context.scrollToScene();
assert.equal(scrolls.at(-1).top, 0);
assert.equal(scrolls.at(-1).behavior, "smooth");
assert.equal(listeners.get("wheel").options.passive, false);
function wheel(deltaY, target = el) {
  let prevented = false;
  const before = scrolls.length;
  listeners.get("wheel").callback({ deltaY, target, preventDefault() { prevented = true; } });
  return { prevented, scrolled: scrolls.length > before };
}
assert.deepEqual(wheel(100), { prevented: true, scrolled: false }, "Roda para baixo não sai da cena");
assert.deepEqual(wheel(-100), { prevented: false, scrolled: false });
el.scrollTop = 800;
assert.deepEqual(wheel(-100), { prevented: true, scrolled: true }, "Roda para cima no topo da seção retorna suavemente");
assert.equal(scrolls.at(-1).behavior, "smooth");
el.scrollTop = 1000;
assert.deepEqual(wheel(-100), { prevented: false, scrolled: false }, "Conteúdo da seção rola normalmente");
const panel = Object.assign(new Element(), { parentElement: el, overflowY: "auto", scrollHeight: 900, clientHeight: 300 });
const panelChild = Object.assign(new Element(), { parentElement: panel });
el.scrollTop = 800;
assert.deepEqual(wheel(-100, panelChild), { prevented: false, scrolled: false }, "Painéis internos não perdem sua rolagem");
el.scrollTop = 401;
listeners.get("scroll").callback();
assert.equal(inInfo, true, "Retorno aparece após metade da viewport");
el.scrollTop = 400;
listeners.get("scroll").callback();
assert.equal(inInfo, false);

let section;
function findSection(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "DonationInfoSection") section = node;
  ts.forEachChild(node, findSection);
}
findSection(editor);
const attributes = section.attributes.properties;
const viewOng = attributes.find((item) => item.name?.getText(ast) === "onViewOng").initializer.expression;
context.filter = { cityId: 10 };
context.setFilter = (value) => { filter = value; };
run("(" + viewOng.getText(ast) + ")(30)");
assert.equal(filter.cityId, 10);
assert.equal(filter.ongId, 30, "Ver na cidade aplica ONG mantendo localização");
assert.equal(scrolls.at(-1).top, 0);
assert.equal(scrolls.at(-1).behavior, "smooth");
cleanup();
assert.equal(listeners.size, 0, "Unmount remove listeners");
console.log("Seção: composição do DS, foto original, 6 ONGs em cartões, totais, filtros e navegação suave OK.");
