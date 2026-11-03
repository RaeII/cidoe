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

const html = await read("index.html");
const title = html.match(/<title>([^<]+)<\/title>/)[1];
const meta = (attribute, key) => html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]+)"`))?.[1];
const description = meta("name", "description");
assert.match(title, /^Cidoe.*Cidade 3D.*Pré-lançamento/);
assert.match(description, /proteção animal/);
assert.match(description, /contribuições simuladas/);
assert.equal(meta("property", "og:site_name"), "Cidoe");
assert.equal(meta("property", "og:title"), title);
assert.equal(meta("name", "twitter:title"), title);
assert.equal(meta("property", "og:description"), description);
assert.equal(meta("name", "twitter:description"), description);
assert.equal(meta("property", "og:image"), meta("name", "twitter:image"));
assert.match(html, /<link rel="canonical" href="https:\/\/cidoe\.com\.br\/"/);
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema["@type"], "WebSite");
assert.equal(schema.name, "Cidoe");
assert.equal(schema.url, "https://cidoe.com.br/");
assert.doesNotMatch(html, /cidoa/i);
const sitemap = await read("public/sitemap.xml");
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), [
  "https://cidoe.com.br/", "https://cidoe.com.br/termos", "https://cidoe.com.br/privacidade",
]);
assert.match(await read("public/robots.txt"), /Sitemap: https:\/\/cidoe\.com\.br\/sitemap\.xml/);

// Executa o efeito real dos documentos legais para conferir canonical e restauração ao voltar à home.
const legalSource = await read("src/pages/legal/LegalPage.tsx");
const ast = ts.createSourceFile("LegalPage.tsx", legalSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "LegalPage");
const effect = component.body.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect");
for (const pathname of ["/termos", "/privacidade"]) {
  const elements = new Map();
  const document = {
    title,
    head: { querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: "home",
        getAttribute() { return this.value; },
        setAttribute(_attribute, value) { this.value = value; },
      });
      return elements.get(selector);
    } },
  };
  let cleanup;
  const context = { document, title: "Documento legal", description: "Descrição do documento", pathname, useEffect(run) { cleanup = run(); } };
  vm.runInNewContext(ts.transpileModule(effect.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(document.title, "Documento legal · Cidoe");
  assert.equal(elements.get('link[rel="canonical"]').value, `https://cidoe.com.br${pathname}`);
  assert.equal(elements.get('meta[name="description"]').value, context.description);
  assert.equal(elements.get('meta[property="og:url"]').value, `https://cidoe.com.br${pathname}`);
  cleanup();
  assert.equal(document.title, title);
  assert.ok([...elements.values()].every((element) => element.value === "home"), "Voltar à home restaura seus metadados");
}

console.log("Cidoe: migração dos dados, quota, SEO, redes sociais, sitemap e metadados legais OK.");
