// HTML público no build; não inicia servidor nem consulta dados de usuários/API.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const cache = resolve("node_modules/.tmp");
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(`${cache}/seo-`);
try {
  const bundle = await build({
    entryPoints: ["src/seo/render.tsx"], bundle: true, platform: "node",
    format: "esm", packages: "external", jsx: "automatic", write: false,
    define: { "import.meta.env.PROD": "false" },
  });
  const entry = resolve(temporary, "render.mjs");
  await writeFile(entry, bundle.outputFiles[0].text);
  const { SEO_PAGES, renderSeoHead, renderPublicPage } = await import(pathToFileURL(entry).href);
  const template = await readFile("dist/index.html", "utf8");
  const headPattern = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
  const bodyPattern = /<!--app:start-->([\s\S]*?)<!--app:end-->/;
  assert.match(template, headPattern, "Vite deve emitir os metadados");
  const loading = (await readFile("index.html", "utf8")).match(bodyPattern)?.[1];
  assert.ok(loading, "Template deve conter o loading da cena");

  for (const path of [...Object.keys(SEO_PAGES), "/404.html", "/admin.html"]) {
    let body = path === "/admin.html" ? "" : renderPublicPage(path);
    if (path === "/") body = `<div class="h-svh w-full overflow-y-auto bg-background">${loading}${body}</div>`;
    const html = template
      .replace(headPattern, () => renderSeoHead(path))
      .replace(bodyPattern, () => `<!--app:start-->${body}<!--app:end-->`);
    const output = path === "/" ? "dist/index.html"
      : path.endsWith(".html") ? `dist${path}` : `dist${path}/index.html`;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
  }
  console.log("SEO: home, sobre, termos, privacidade, 404 e entrada admin gerados sem servidor.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
