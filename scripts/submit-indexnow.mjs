// Executar após publicar; --dry-run valida tudo sem rede. A chave IndexNow é pública.
// Opção recomendada do protocolo: arquivo `public/{chave}.txt` na raiz, com a própria chave.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

assert.ok(process.argv.slice(2).every((arg) => arg === "--dry-run"), "Uso: npm run seo:submit -- [--dry-run]");
const origin = "https://cidoe.com.br";
const publicDir = new URL("../public/", import.meta.url);
const keyFiles = (await readdir(publicDir)).filter((name) => /^[a-f0-9]{32}\.txt$/.test(name));
assert.equal(keyFiles.length, 1, "Esperado um único public/{chave}.txt");
const key = keyFiles[0].slice(0, -4);
assert.equal((await readFile(new URL(keyFiles[0], publicDir), "utf8")).trim(), key, "Arquivo deve conter a própria chave");
const sitemap = await readFile(new URL("sitemap.xml", publicDir), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(urlList.length > 0 && urlList.length <= 10_000, "Sitemap vazio ou acima do limite IndexNow");
for (const value of urlList) {
  const url = new URL(value);
  assert.equal(url.origin, origin, "Enviar somente URLs oficiais");
  assert.ok(!url.search && !url.hash, "Enviar somente URLs canônicas");
}
const payload = { host: new URL(origin).host, key, urlList };
if (process.argv.includes("--dry-run")) {
  console.log("IndexNow: validação local OK, nenhuma requisição enviada.\n" + urlList.join("\n"));
} else {
  const verification = await fetch(`${origin}/${key}.txt`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(verification.status, 200, "Publique a chave antes de enviar URLs");
  assert.equal((await verification.text()).trim(), key, "A chave publicada difere da versão local");
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
  });
  // 403 chave não encontrada; 422 URL fora do host; 429 envio frequente demais.
  assert.ok(response.status === 200 || response.status === 202, `IndexNow recusou o envio: HTTP ${response.status}`);
  console.log(`IndexNow: ${urlList.length} URLs enviadas (HTTP ${response.status}). Aceite não garante indexação.`);
}
