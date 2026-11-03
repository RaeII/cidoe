// node scripts/check-analytics.mjs — sem servidor, navegador ou requisições ao Google.
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundles = await Promise.all([true, false].map(async (production) => {
  const result = await build({
    entryPoints: ["src/lib/analytics.ts"], bundle: true, format: "cjs", write: false,
    define: { "import.meta.env.PROD": String(production) },
  });
  return result.outputFiles[0].text;
}));

function loadAnalytics({ consent, legacyConsent, production = true, blocked = false } = {}) {
  const values = new Map(consent ? [["cidoe:analytics-consent", consent]] : []);
  if (legacyConsent) values.set("cidoa:analytics-consent", legacyConsent);
  const scripts = [];
  const browser = new EventTarget();
  const storage = {
    getItem(key) {
      if (blocked) throw new Error("Storage bloqueado");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (blocked) throw new Error("Storage bloqueado");
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };
  const document = {
    createElement(tag) { assert.equal(tag, "script"); return {}; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const module = { exports: {} };
  new Function("module", "exports", "window", "document", "localStorage", "location", bundles[production ? 0 : 1])(
    module, module.exports, browser, document, storage, { href: "https://cidoe.com.br/?ref=AMIGO&utm_source=instagram" },
  );
  return { ...module.exports, browser, scripts, values };
}

for (const consent of [undefined, "denied", "invalid", "acknowledged"]) {
  const app = loadAnalytics({ consent });
  app.initializeAnalytics();
  assert.equal(app.scripts.length, 0, "Sem aceite válido não carrega a tag");
  assert.equal(app.browser.dataLayer, undefined, "Sem aceite não enfileira medição");
}

const app = loadAnalytics();
app.initializeAnalytics();
app.setAnalyticsConsent("denied");
assert.equal(app.scripts.length, 0, "Recusa não carrega a tag");
app.setAnalyticsConsent("granted");
assert.equal(app.values.get("cidoe:analytics-consent"), "granted");
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], false);
assert.deepEqual(app.scripts, [{ async: true, src: "https://www.googletagmanager.com/gtag/js?id=G-GEHP0ENSCR" }]);
const commands = app.browser.dataLayer.map((args) => Array.from(args));
assert.deepEqual(commands[0], ["consent", "default", {
  analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
}]);
assert.deepEqual(commands[1], ["consent", "update", { analytics_storage: "granted" }]);
assert.equal(commands[2][0], "js");
assert.ok(commands[2][1] instanceof Date);
assert.deepEqual(commands[3], ["config", "G-GEHP0ENSCR", {
  allow_google_signals: false, allow_ad_personalization_signals: false,
  page_location: "https://cidoe.com.br/?utm_source=instagram",
}]);
app.initializeAnalytics();
app.setAnalyticsConsent("granted");
assert.equal(app.scripts.length, 1, "Reinicializar não duplica a tag");
assert.equal(app.browser.dataLayer.filter((args) => args[0] === "config").length, 1, "Pageview inicial configurado só uma vez");
app.setAnalyticsConsent("denied");
assert.equal(app.values.get("cidoe:analytics-consent"), "denied");
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], true, "Revogação desativa a coleta antes do update");
assert.deepEqual(Array.from(app.browser.dataLayer.at(-1)), ["consent", "update", { analytics_storage: "denied" }]);
app.setAnalyticsConsent("granted");
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], false, "Novo aceite reativa a coleta");
assert.equal(app.scripts.length, 1);
app.values.set("cidoe:analytics-consent", "denied");
app.browser.dispatchEvent(Object.assign(new Event("storage"), { key: "cidoe:analytics-consent" }));
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], true, "Revogação em outra aba também interrompe a coleta");
app.setAnalyticsConsent("granted");
app.browser.dispatchEvent(Object.assign(new Event("storage"), { key: "cidoa:analytics-consent", newValue: "denied" }));
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], true, "Aba anterior ao deploy também pode revogar o aceite");
app.setAnalyticsConsent("granted");
app.browser.dispatchEvent(Object.assign(new Event("storage"), { key: "cidoa:analytics-consent", newValue: null }));
assert.equal(app.browser["ga-disable-G-GEHP0ENSCR"], false, "Remover a chave migrada não altera a escolha");

for (const legacyConsent of ["granted", "denied"]) {
  const migrated = loadAnalytics({ legacyConsent });
  migrated.initializeAnalytics();
  assert.equal(migrated.values.get("cidoe:analytics-consent"), legacyConsent);
  assert.equal(migrated.values.has("cidoa:analytics-consent"), false);
  assert.equal(migrated.scripts.length, legacyConsent === "granted" ? 1 : 0, "Migração preserva aceite e recusa");
}

const returning = loadAnalytics({ consent: "granted" });
returning.initializeAnalytics();
assert.equal(returning.scripts.length, 1, "Restaura aceite anterior");
const dev = loadAnalytics({ consent: "granted", production: false });
dev.initializeAnalytics();
dev.setAnalyticsConsent("granted");
assert.equal(dev.browser.dataLayer, undefined, "Desenvolvimento não enfileira medição");
assert.equal(dev.scripts.length, 0);
const blocked = loadAnalytics({ blocked: true });
blocked.initializeAnalytics();
assert.equal(blocked.scripts.length, 0, "Storage bloqueado não concede aceite");
blocked.setAnalyticsConsent("granted");
assert.equal(blocked.scripts.length, 1, "Aceite vale na visita com storage bloqueado");
blocked.setAnalyticsConsent("denied");
assert.equal(blocked.browser["ga-disable-G-GEHP0ENSCR"], true);

console.log("Analytics: consentimento, ordem dos comandos, tag única, persistência, revogação e desenvolvimento OK.");
