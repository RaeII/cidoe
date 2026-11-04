// node scripts/check-mobile-keyboard.mjs — sem servidor ou navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/hooks/useVisualViewport.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
function target(properties = {}) {
  const listeners = new Map();
  return Object.assign(properties, {
    listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) {
      assert.equal(listeners.get(name), callback);
      listeners.delete(name);
    },
  });
}
const viewport = target({ height: 800, offsetTop: 0, scale: 1 });
const properties = new Map();
const frames = new Map();
let frameId = 0, cleanup, scrolls = 0;
let reducedMotion = false;
class Element {
  editable = true;
  rect = { top: 500, bottom: 544 };
  matches() { return this.editable; }
  getBoundingClientRect() { return this.rect; }
  scrollIntoView(options) {
    assert.equal(options.block, "start", "Campo focado deve ir ao topo para deixar sugestões visíveis abaixo");
    assert.equal(options.behavior, reducedMotion ? "instant" : "smooth");
    scrolls++;
  }
}
const input = new Element();
const document = target({
  activeElement: input,
  documentElement: { style: {
    setProperty: (key, value) => properties.set(key, value),
    removeProperty: (key) => properties.delete(key),
  } },
});
const window = { visualViewport: viewport, innerHeight: 800, matchMedia: () => ({ matches: reducedMotion }) };
const context = {
  exports: {}, window, document, HTMLElement: Element,
  requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); },
  require(name) {
    assert.equal(name, "react");
    return { useEffect(effect) { cleanup = effect(); } };
  },
};
vm.runInNewContext(outputText, context);
const flush = () => { for (const callback of frames.values()) callback(); frames.clear(); };
const resize = () => { viewport.listeners.get("resize")({ type: "resize" }); flush(); };
context.exports.useVisualViewport();
assert.equal(properties.get("--viewport-height"), "800px");
viewport.height = 350;
resize();
assert.equal(properties.get("--viewport-height"), "350px");
assert.equal(properties.get("--viewport-bottom"), "450px");
assert.equal(scrolls, 1, "Teclado revela campo encoberto");
input.rect = { top: 180, bottom: 224 };
resize();
assert.equal(scrolls, 2, "Redimensionar com teclado mantém campo alinhado ao topo mesmo quando visível");
viewport.offsetTop = 100;
viewport.listeners.get("scroll")();
assert.equal(properties.get("--viewport-top"), "100px");
assert.equal(properties.get("--viewport-bottom"), "350px");
assert.equal(scrolls, 2, "Rolagem manual não disputa posição com o usuário");
input.rect = { top: 50, bottom: 94 };
document.listeners.get("focusin")({ type: "focusin", target: input });
flush();
assert.equal(scrolls, 3, "Troca de campo considera deslocamento do Safari");
input.rect = { top: viewport.offsetTop + viewport.height - 48, bottom: viewport.offsetTop + viewport.height - 4 };
document.listeners.get("focusin")({ type: "focusin", target: input });
flush();
assert.equal(scrolls, 4, "Campo colado ao teclado deve sair do limite mesmo estando dentro da viewport");
input.rect = { top: 180, bottom: 224 };
document.listeners.get("focusin")({ type: "focusin", target: input });
flush();
assert.equal(scrolls, 5, "Foco alinha ao topo mesmo quando campo já está visível");
document.listeners.get("click")({ type: "click", target: input });
flush();
assert.equal(scrolls, 6, "Clicar novamente no campo focado também alinha ao topo");
document.listeners.get("click")({ type: "click", target: {} });
flush();
assert.equal(scrolls, 6, "Clique fora do campo preserva a rolagem manual");
reducedMotion = true;
document.listeners.get("focusin")({ type: "focusin", target: input });
flush();
assert.equal(scrolls, 7, "Movimento reduzido preserva alinhamento sem animação");
reducedMotion = false;
input.editable = false;
resize();
assert.equal(scrolls, 7, "Foco fora de campo não rola página");
viewport.scale = 2;
viewport.height = 175;
resize();
assert.equal(properties.get("--viewport-height"), "350px", "Zoom não reorganiza layout");
viewport.scale = 1;
viewport.height = 800;
viewport.offsetTop = 0;
resize();
assert.equal(properties.get("--viewport-height"), "800px", "Fechar teclado restaura altura");
assert.equal(properties.get("--viewport-bottom"), "0px");
viewport.listeners.get("resize")({ type: "resize" });
assert.equal(frames.size, 1);
cleanup();
assert.equal(frames.size, 0);
assert.equal(viewport.listeners.size, 0);
assert.equal(document.listeners.size, 0);
assert.equal(properties.size, 0);
context.exports.useVisualViewport();
cleanup(); // Remontagem do StrictMode não acumula listeners.
window.visualViewport = null;
context.exports.useVisualViewport();
assert.equal(cleanup, undefined, "Sem VisualViewport preserva fallback CSS");

// Executa o efeito real: sugestões não podem rolar o modal e esconder o campo focado.
const contributionSource = await readFile(new URL("../src/components/html/donate/ContributeDialog.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ContributeDialog.tsx", contributionSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const combobox = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "OngCombobox");
const effect = combobox.body.statements.find((node) => ts.isExpressionStatement(node)
  && node.getText(ast).includes("listRef.current"));
const option = { offsetTop: 0, offsetHeight: 44 };
const list = { children: [option], scrollTop: 0, clientHeight: 140 };
const scope = {
  listRef: { current: list }, activeIndex: 0, expanded: true, normalizedQuery: "",
  useEffect: (callback) => callback(),
};
const effectCode = ts.transpileModule(effect.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const revealOption = () => vm.runInNewContext(effectCode, scope);
revealOption();
assert.equal(list.scrollTop, 0, "Abrir lista mantém campo e modal na posição atual");
option.offsetTop = 176;
revealOption();
assert.equal(list.scrollTop, 80, "Seta para baixo revela opção rolando apenas a lista");
option.offsetTop = 44;
revealOption();
assert.equal(list.scrollTop, 44, "Seta para cima mantém opção visível");
scope.expanded = false;
option.offsetTop = 0;
revealOption();
assert.equal(list.scrollTop, 44, "Lista fechada não provoca rolagem");
scope.expanded = true;
scope.listRef.current = null;
revealOption();
scope.listRef.current = list;
let previousDependencies;
scope.useEffect = (callback, dependencies) => {
  if (!previousDependencies || dependencies.some((value, index) => value !== previousDependencies[index])) callback();
  previousDependencies = [...dependencies];
};
revealOption();
list.scrollTop = 100;
revealOption();
assert.equal(list.scrollTop, 100, "Rolagem manual da lista não deve ser desfeita sem mudança de estado");
scope.normalizedQuery = "alianca";
revealOption();
assert.equal(list.scrollTop, 0, "Filtrar após rolar revela o primeiro resultado, mesmo com índice ativo igual");

// Cidade também mantém navegação por setas quando sugestões precisam de rolagem.
const citySource = await readFile(new URL("../src/components/ProfileDetailsFields.tsx", import.meta.url), "utf8");
const cityAst = ts.createSourceFile("ProfileDetailsFields.tsx", citySource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const cityCombobox = cityAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CityCombobox");
const cityEffect = cityCombobox.body.statements.find((node) => ts.isExpressionStatement(node)
  && node.getText(cityAst).includes("listRef.current"));
list.scrollIntoView = () => {};
list.scrollTop = 0;
option.offsetTop = 176;
vm.runInNewContext(ts.transpileModule(cityEffect.getText(cityAst), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, { listRef: { current: list }, active: 0, expanded: true, results: ["Cidade"], useEffect: (callback) => callback() });
assert.equal(list.scrollTop, 80, "Opção de cidade ativa continua acessível com lista limitada");

// Regressão da imagem: cabeçalho/rodapé não podem comprimir uma área interna de campos.
const dialog = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ContributeDialog");
let dialogClasses;
function findDialog(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "DialogContent") {
    dialogClasses = node.attributes.properties.find((attribute) => attribute.name?.getText(ast) === "className").initializer.text;
  }
  ts.forEachChild(node, findDialog);
}
findDialog(dialog);
assert.match(dialogClasses, /\bblock\b/);
assert.match(dialogClasses, /\boverflow-y-auto\b/);
assert.doesNotMatch(dialogClasses, /\bflex\b|\bgrid\b|\boverflow-hidden\b/, "Modal inteiro deve rolar em vez de comprimir o formulário");
const bodyClasses = ast.statements.filter(ts.isVariableStatement)
  .flatMap((node) => [...node.declarationList.declarations])
  .find((node) => node.name.getText(ast) === "scrollClass").initializer.text;
assert.doesNotMatch(bodyClasses, /overflow-|overscroll-/, "Corpo sem rolagem própria não pode bloquear gestos antes do modal");
console.log("Teclado mobile: viewport/foco, modal com rolagem integral, sugestões sem mover ancestrais, zoom e limpeza OK.");
