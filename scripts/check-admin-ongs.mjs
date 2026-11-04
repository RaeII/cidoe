// Formulário real, com hooks e API simulados; sem servidor, navegador ou banco.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import ts from "typescript";

const source = await readFile("src/pages/admin/Ongs.tsx", "utf8");
const ast = ts.createSourceFile("Ongs.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && ["OngEditor", "errorMessage"].includes(node.name?.text));
const controls = new Set();
function collect(node) {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && /^[A-Z]/.test(node.tagName.getText(ast))) controls.add(node.tagName.getText(ast));
  ts.forEachChild(node, collect);
}
functions.forEach(collect);
const code = ts.transpileModule(functions.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node.props) ? [node.props] : []), ...find(node.props.children, predicate)];
}
const preventDefault = { preventDefault() {} };
const image = "data:image/jpeg;base64,aW1hZ2Vt";
const ong = { id: 4, name: "Abrigo", profile_image: image, is_active: false };

function mount(initial, overrides = {}) {
  const state = [], calls = [];
  let cursor = 0, saved = 0, closed = 0;
  class ApiError extends Error {}
  const scope = {
    ...Object.fromEntries([...controls].map((name) => [name, name])),
    require: createRequire(import.meta.url), exports: {}, ApiError,
    useState: (initialValue) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initialValue;
      return [state[index], (value) => { state[index] = value; }];
    },
    createOng: async (input) => { calls.push(["create", input]); },
    updateOng: async (id, input) => { calls.push(["update", id, input]); },
    resizeImage: async () => image,
    ...overrides,
  };
  vm.createContext(scope);
  vm.runInContext(code, scope);
  return {
    calls,
    get saved() { return saved; }, get closed() { return closed; },
    render() {
      cursor = 0;
      return scope.OngEditor({ ong: initial, onSaved: () => saved++, onClose: () => closed++ });
    },
  };
}

const edit = mount(ong);
let tree = edit.render();
find(tree, (props) => props.id === "ong-name")[0].onChange({ target: { value: " Novo nome " } });
tree = edit.render();
await find(tree, (props) => props.onSubmit)[0].onSubmit(preventDefault);
assert.equal(JSON.stringify(edit.calls), JSON.stringify([["update", 4, { name: "Novo nome", profile_image: image, is_active: false }]]), "Renomear preserva imagem e status");
assert.equal(edit.saved, 1);

const remove = mount(ong);
find(remove.render(), (props) => props.children === "Remover imagem")[0].onClick();
await find(remove.render(), (props) => props.onSubmit)[0].onSubmit(preventDefault);
assert.equal(remove.calls[0][2].profile_image, null, "Remoção explícita enviada ao backend");

const create = mount(null);
find(create.render(), (props) => props.id === "ong-name")[0].onChange({ target: { value: "Nova ONG" } });
await find(create.render(), (props) => props.onSubmit)[0].onSubmit(preventDefault);
assert.equal(create.calls[0][0], "create");
assert.equal(create.calls[0][1].is_active, true);

const failed = mount(ong, { updateOng: async () => { throw new Error("offline"); } });
await find(failed.render(), (props) => props.onSubmit)[0].onSubmit(preventDefault);
assert.equal(failed.saved, 0, "Erro de gravação mantém formulário aberto");
assert.equal(find(failed.render(), (props) => props.role === "alert").length, 1);

let finishImage;
const pending = new Promise((resolve) => { finishImage = resolve; });
const upload = mount(ong, { resizeImage: () => pending });
find(upload.render(), (props) => props.id === "ong-image")[0].onChange({ target: { files: [{}], value: "foto.png" } });
tree = upload.render();
assert.equal(find(tree, (props) => props.type === "submit")[0].disabled, true);
tree.props.onOpenChange(false);
assert.equal(upload.closed, 0, "Processamento de imagem bloqueia fechamento e gravação");
finishImage("data:image/jpeg;base64,bm92YQ==");
await pending;
await new Promise(setImmediate);
await find(upload.render(), (props) => props.onSubmit)[0].onSubmit(preventDefault);
assert.equal(upload.calls[0][2].profile_image, "data:image/jpeg;base64,bm92YQ==");

console.log("ONGs: criar, editar, preservar/remover foto e status, erro de gravação e upload pendente OK.");
