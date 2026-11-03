// node scripts/check-branding.mjs — sem servidor, navegador ou acesso à rede.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const source = await read("src/lib/projectStorage.ts");
const projectStorage = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: projectStorage });
const { readProjectStorage } = projectStorage;
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
for (const [area, value] of [
  ["analytics-consent", "denied"],
  ["intro-video-seen", "1"],
  ["ui-visibility", '{"cameraLog":false}'],
  ["prelaunch:v1:7:buildings", '[{"id":-1}]'],
  ["prelaunch:v1:7:profiles", "JSON inválido preservado"],
  ["prelaunch:v1:guest:scene:environment", '{"night":true}'],
]) {
  values.set(`cidoa:${area}`, value);
  assert.equal(readProjectStorage(storage, `cidoe:${area}`), value);
  assert.equal(values.get(`cidoe:${area}`), value, "Migra sem alterar o conteúdo");
  assert.equal(values.has(`cidoa:${area}`), false, "Remove chave antiga após salvar");
}
values.set("cidoa:analytics-consent", "granted");
assert.equal(readProjectStorage(storage, "cidoe:analytics-consent"), "denied", "Preferência atual prevalece sobre o aceite antigo");
assert.equal(readProjectStorage(storage, "cidoe:prelaunch:v1:8:buildings"), null, "Não mistura contas");
values.set("cidoa:prelaunch:v1:9:buildings", "cidade original");
const full = { ...storage, setItem() { throw new Error("Quota cheia"); } };
assert.equal(readProjectStorage(full, "cidoe:prelaunch:v1:9:buildings"), "cidade original", "Quota cheia permite ler dados antigos");
assert.equal(values.get("cidoa:prelaunch:v1:9:buildings"), "cidade original", "Falha não apaga a cidade");
assert.equal(values.has("cidoe:prelaunch:v1:9:buildings"), false);
assert.throws(() => readProjectStorage({ getItem() { throw new Error("Storage bloqueado"); } }, "cidoe:analytics-consent"), /Storage bloqueado/);

assert.match(await read("src/lib/legal.ts"), /LEGAL_EDITION = "launch"/);
assert.match(await read("prod/.env.example"), /FRONT_IMAGE=ghcr\.io\/raeii\/cidoe-front:main/);
// Metadados e HTML gerado são verificados pelo check-seo, junto com os componentes reais.
await import("./check-seo.mjs");
console.log("Cidoe main: migração dos dados, quota, edição de lançamento e SEO OK.");
