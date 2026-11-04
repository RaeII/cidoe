// node scripts/check-consent.mjs — sem servidor ou navegador.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
async function loadComponent(path, storage, browser = new EventTarget()) {
  const bundle = await build({
    entryPoints: [path], bundle: true, format: "cjs", platform: "node",
    packages: "external", jsx: "automatic", write: false,
    define: { "import.meta.env.PROD": "false" },
  });
  const module = { exports: {} };
  let state;
  new Function("require", "module", "exports", "localStorage", "window", bundle.outputFiles[0].text)(
    (name) => name === "react" ? {
      ...React,
      useEffect(effect) { effect(); },
      useState(initial) {
        if (state === undefined) state = typeof initial === "function" ? initial() : initial;
        return [state, (next) => { state = next; }];
      },
    } : require(name),
    module, module.exports, storage, browser,
  );
  return module.exports;
}

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
values.set("cidoa:cookie-notice", "acknowledged");
const browser = new EventTarget();
const { CookieNotice } = await loadComponent("src/components/CookieNotice.tsx", storage, browser);
const notice = CookieNotice();
const html = renderToStaticMarkup(notice);
assert.match(html, /aria-label="Cookies"/);
assert.match(html, /href="\/privacidade#cookies" target="_blank"/);
assert.doesNotMatch(html, /role="dialog"|aria-modal/, "Aviso não bloqueia a navegação");
assert.match(html, /Usamos cookies essenciais para o site funcionar/);
assert.match(html, /Google Analytics/);
assert.equal((html.match(/<button\b/g) ?? []).length, 2, "Aviso permite recusar ou aceitar");
assert.match(html, />Recusar<.*>Aceitar</);
const confirm = (tree) => tree.props.children[1].props.children[1].props.onClick();
confirm(notice);
assert.equal(values.get("cidoe:analytics-consent"), "granted", "Confirmação salva aceite explícito");
assert.equal(CookieNotice(), null, "Fecha na visita atual");
browser.dispatchEvent(new Event("cidoe:cookie-preferences"));
assert.notEqual(CookieNotice(), null, "Preferências permitem rever a escolha");
confirm(CookieNotice());
assert.equal(values.get("cidoe:analytics-consent"), "granted", "Aceite explícito salvo");
const returning = await loadComponent("src/components/CookieNotice.tsx", storage);
assert.equal(returning.CookieNotice(), null, "Não repete após recarregar");
values.set("cidoe:analytics-consent", "invalid");
const invalid = await loadComponent("src/components/CookieNotice.tsx", storage);
assert.notEqual(invalid.CookieNotice(), null, "Valor desconhecido não conta como confirmação");

const blockedStorage = {
  getItem() { throw new Error("Storage bloqueado"); },
  setItem() { throw new Error("Storage bloqueado"); },
};
const blocked = await loadComponent("src/components/CookieNotice.tsx", blockedStorage);
confirm(blocked.CookieNotice());
assert.equal(blocked.CookieNotice(), null, "Storage bloqueado não impede fechar");

const { TermsConsent } = await loadComponent("src/components/TermsConsent.tsx");
let accepted = false;
const consent = TermsConsent({ id: "terms", checked: false, onChange: (value) => { accepted = value; } });
const consentHtml = renderToStaticMarkup(consent);
assert.match(consentHtml, /type="checkbox" required=""/);
assert.doesNotMatch(consentHtml, /checked=""/);
assert.match(consentHtml, /Tenho 18 anos ou mais/);
assert.match(consentHtml, /href="\/termos" target="_blank"/);
assert.match(consentHtml, /href="\/privacidade" target="_blank"/);
consent.props.children[0].props.onChange({ target: { checked: true } });
assert.equal(accepted, true, "Aceite exige ação explícita");

console.log("Consentimentos: caixa do cadastro, links, aviso não bloqueante, persistência e storage bloqueado OK.");
