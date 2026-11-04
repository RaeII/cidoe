// Executar após publicar; --dry-run valida tudo sem rede. A chave IndexNow é pública.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

assert.ok(process.argv.slice(2).every((arg) => arg === "--dry-run"), "Uso: npm run seo:submit -- [--dry-run]");
const origin = "https://cidoe.com.br";
const key = (await readFile(new URL("../public/indexnow-key.txt", import.meta.url), "utf8")).trim();
assert.match(key, /^[a-f0-9]{32}$/, "Chave pública IndexNow inválida");
const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(urlList.length > 0 && urlList.length <= 10_000, "Sitemap vazio ou acima do limite IndexNow");
for (const value of urlList) {
  const url = new URL(value);
  assert.equal(url.origin, origin, "Enviar somente URLs oficiais");
  assert.ok(!url.search && !url.hash, "Enviar somente URLs canônicas");
}
const payload = { host: new URL(origin).host, key, keyLocation: `${origin}/indexnow-key.txt`, urlList };
if (process.argv.includes("--dry-run")) {
  console.log("IndexNow: validação local OK, nenhuma requisição enviada.\n" + urlList.join("\n"));
} else {
  const verification = await fetch(payload.keyLocation, { signal: AbortSignal.timeout(15_000) });
  assert.equal(verification.status, 200, "Publique a chave antes de enviar URLs");
  assert.equal((await verification.text()).trim(), key, "A chave publicada difere da versão local");
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.status === 200 || response.status === 202, `IndexNow recusou o envio: HTTP ${response.status}`);
  console.log(`IndexNow: ${urlList.length} URLs enviadas (HTTP ${response.status}). Aceite não garante indexação.`);
}
