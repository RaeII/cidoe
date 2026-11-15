// npm run build && npm run check:seo — sem servidor, navegador ou rede.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
async function load(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    packages: "external", jsx: "automatic", write: false,
    external: ["./components/CitySceneEditor", "./pages/admin/*"],
    define: { "import.meta.env.PROD": "false", "import.meta.env.VITE_API_URL": '"/api"' },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    require, module, module.exports,
  );
  return module.exports;
}
const { SEO_PAGES, SITE_URL, getPageSeo, renderSeoHead, renderPublicPage } = await load("src/seo/render.tsx");
const { IS_PRELAUNCH } = await load("src/lib/legal.ts");
const meta = (html, attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]+)"`))?.[1];
const schema = (html) => JSON.parse(html.match(/<script id="page-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

for (const path of Object.keys(SEO_PAGES)) {
  const html = await read(path === "/" ? "dist/index.html" : `dist${path}/index.html`);
  const head = html.split("</head>")[0];
  const seo = getPageSeo(path);
  assert.equal((head.match(/<title>/g) ?? []).length, 1);
  assert.equal(head.match(/<title>([^<]+)<\/title>/)[1], seo.title);
  assert.equal((head.match(/rel="canonical"/g) ?? []).length, 1);
  assert.ok(head.includes(`rel="canonical" href="${SITE_URL}${path}"`));
  assert.equal(meta(head, "name", "description"), seo.description);
  assert.equal(meta(head, "name", "robots"), seo.robots);
  assert.equal(meta(head, "property", "og:url"), seo.canonical);
  assert.equal(meta(head, "property", "og:title"), seo.title);
  assert.equal(meta(head, "name", "twitter:title"), seo.title);
  assert.equal(meta(head, "property", "og:description"), seo.description);
  assert.equal(meta(head, "name", "twitter:description"), seo.description);
  assert.equal(meta(head, "property", "og:image"), meta(head, "name", "twitter:image"));
  assert.doesNotMatch(head, /pré[- ]lançamento|\bbeta\b|simulad|em breve|name="keywords"/i);
  assert.doesNotMatch(html, /<!--seo-head-->|\/src\/main|cidoa/i);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path}: um título principal`);
  assert.ok(html.includes(renderPublicPage(path)), `${path}: mesmo componente e texto do React`);
  assert.ok(html.includes('href="/sobre"'));
  assert.ok(html.includes('href="/termos"'));
  assert.ok(html.includes('href="/privacidade"'));
  const menu = html.match(/<nav aria-label="Páginas do Cidoe"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  if (path === "/") {
    assert.ok(menu, "Menu público disponível sem JavaScript na seção HTML abaixo da cena");
    assert.ok(html.indexOf('id="donation-info"') < html.indexOf('aria-label="Páginas do Cidoe"'));
    const links = [...menu.matchAll(/<a\b([^>]+)>([^<]+)<\/a>/g)];
    assert.equal(links.length, 3);
    assert.deepEqual(links.map(([, attrs]) => attrs.match(/href="([^"]+)"/)[1]), ["/sobre", "/termos", "/privacidade"]);
    for (const [, attrs] of links) assert.match(attrs, /min-h-11 touch-manipulation/);
    assert.doesNotMatch(menu, /data-slot="button"|raised|pixel|bg-/);
  } else assert.equal(menu, undefined, "Menu apenas na seção HTML abaixo da cena");
  assert.match(html, /<script type="module"[^>]*src="\/assets\//);
  assert.doesNotMatch(html, /rel="modulepreload"[^>]*CitySceneEditor/);
  const nodes = schema(html)["@graph"];
  assert.equal(nodes.find((node) => node["@type"] === "WebSite").name, "Cidoe");
  assert.equal(nodes.find((node) => node["@id"] === `${seo.url}#webpage`).description, seo.description);
  assert.doesNotMatch(JSON.stringify(nodes), /AggregateRating|FAQPage|Nonprofit501c3|SearchAction/);
}
const about = await read("dist/sobre/index.html");
const author = schema(about)["@graph"].find((node) => node["@type"] === "Person");
assert.equal(author.name, "Israel Zeferino");
assert.deepEqual(author.sameAs, [
  "https://www.linkedin.com/in/dev-israel-zeferino/",
  "https://www.instagram.com/rael.zeferino/",
]);
const social = about.match(/<nav aria-label="Redes sociais de Israel Zeferino"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(social);
for (const url of author.sameAs) {
  assert.ok(social.includes(`href="${url}"`));
}
assert.equal((social.match(/target="_blank" rel="me noopener noreferrer"/g) ?? []).length, 2);
assert.equal((social.match(/<svg[^>]+aria-hidden="true"/g) ?? []).length, 2);
assert.ok(about.includes('id="israel-zeferino"'));
if (IS_PRELAUNCH) {
  assert.match(about, /Não há pagamentos reais/);
  assert.doesNotMatch(about, /As doações são feitas por Pix|Como doar para uma ONG pelo Cidoe/, "Beta sem instruções de pagamento real");
  assert.match(about, /Administrar/, "Beta preserva personalização sem conta");
}
else {
  assert.doesNotMatch(about, /Não há pagamentos reais/);
  assert.ok(about.includes('href="/termos#contribuicoes"'), "Sobre aponta para as condições do pagamento");
  assert.ok((await read("dist/termos/index.html")).includes('id="contribuicoes"'), "Destino das condições existe no HTML público");
}
assert.match(about, /mailto:contato@cidoe.com.br/);
const home = await read("dist/index.html");
assert.ok(home.includes('href="/video"'), "Página de vídeo descoberta por link no HTML da home");
assert.ok(home.indexOf('id="scene-loading"') < home.indexOf("<h1"), "Loading ocupa a primeira viewport; apresentação vem abaixo");
if (IS_PRELAUNCH) assert.match(home, /ONGs, edifícios e contribuições são fictícios/);
assert.match(home, /<img[^>]*src="\/logo.webp"[^>]*loading="lazy"/);
assert.match(home, /<img[^>]*src="\/cat_dog.jpeg"[^>]*loading="lazy"/);
assert.match(home, /<source srcSet="\/cat_dog.webp"/);
assert.doesNotMatch(home, /Switched to client rendering|data-msg=/, "Build pronto para hidratação, sem Suspense abortado");
assert.match(home, /<noscript><style>#scene-loading\{display:none\}/);
assert.match(home, /rel="icon" type="image\/png" sizes="96x96" href="\/favicon-96.png"/);
const { PNG } = require("pngjs");
const favicon = await readFile(new URL("../dist/favicon-96.png", import.meta.url));
assert.equal(PNG.sync.read(favicon).width, 96);
assert.equal(PNG.sync.read(favicon).height, 96);

const videoPage = await read("dist/video/index.html");
const players = [...videoPage.matchAll(/<video\b[^>]*>/g)];
assert.equal(players.length, 1, "Página dedicada tem um player no HTML inicial, sem clique ou login");
const player = players[0][0];
const videoSource = player.match(/\bsrc="([^"]+)"/)[1];
const videoPoster = player.match(/\bposter="([^"]+)"/)[1];
assert.equal(videoSource, "/video-cidoe.mp4");
assert.equal(videoPoster, "/video-cidoe-poster.jpg");
assert.match(player, /\bcontrols=""/);
assert.match(player, /width="1080" height="1920"/);
assert.doesNotMatch(player, /aria-hidden|\bhidden(?:=|\s|>)|\bautoplay\b|display:\s*none/i);
assert.doesNotMatch(videoPage, /id="scene-loading"|role="dialog"/, "Vídeo não depende da cena ou de modal");
if (IS_PRELAUNCH) assert.match(videoPage, /nenhum pagamento é realizado/);
const videoBytes = await readFile(new URL(`../dist${videoSource}`, import.meta.url));
assert.equal(videoBytes.subarray(4, 8).toString(), "ftyp", "Arquivo público é MP4");
assert.ok(videoBytes.equals(await readFile(new URL(`../public${videoSource}`, import.meta.url))), "MP4 preservado no build");
const posterBytes = await readFile(new URL(`../dist${videoPoster}`, import.meta.url));
assert.ok(posterBytes.equals(await readFile(new URL(`../public${videoPoster}`, import.meta.url))), "Miniatura preservada no build");
const posterImage = require("jpeg-js").decode(posterBytes, { useTArray: true });
assert.ok(posterImage.width >= 60 && posterImage.height >= 30, "JPEG opaco atende ao tamanho mínimo da miniatura");

for (const path of ["/admin.html", "/404.html"]) {
  const html = await read(`dist${path}`);
  assert.match(meta(html, "name", "robots"), /^noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.equal(schema(html), null);
}
for (const path of ["/dale", "/dale/login", "/dale/usuarios", "/nao-existe", "/dale-falso"]) {
  assert.match(getPageSeo(path).robots, /^noindex/);
  assert.equal(getPageSeo(path).canonical, null);
}
assert.equal(getPageSeo("/sobre/").canonical, `${SITE_URL}/sobre`);
assert.doesNotMatch(renderSeoHead('/"><script>alert(1)</script>'), /<script>alert/);

// Executa o efeito real ao navegar, incluindo remoção/recriação da canonical e do schema.
const elements = new Map();
for (const key of ["description", "robots", "twitter:title", "twitter:description"]) elements.set(`meta[name="${key}"]`, { content: "" });
for (const key of ["og:title", "og:description", "og:url"]) elements.set(`meta[property="${key}"]`, { content: "" });
for (const element of elements.values()) element.setAttribute = function (key, value) { this[key] = value; };
const json = { textContent: "null" };
const document = {
  title: "",
  head: {
    querySelector: (selector) => elements.get(selector) ?? null,
    appendChild: (element) => elements.set('link[rel="canonical"]', element),
  },
  createElement: () => ({ remove() { elements.delete('link[rel="canonical"]'); } }),
  getElementById: () => json,
};
let pathname = "/";
const result = await build({
  entryPoints: ["src/components/RouteMetadata.tsx"], bundle: true, format: "cjs",
  platform: "node", packages: "external", write: false,
});
const module = { exports: {} };
new Function("require", "module", "exports", "document", result.outputFiles[0].text)(
  (name) => name === "react" ? { useEffect: (run) => run() }
    : name === "react-router-dom" ? { useLocation: () => ({ pathname }) } : require(name),
  module, module.exports, document,
);
for (pathname of ["/", "/privacidade", "/sobre", "/video", "/dale/login", "/", "/nao-existe", "/termos", "/"]) {
  module.exports.RouteMetadata();
  const seo = getPageSeo(pathname);
  assert.equal(document.title, seo.title);
  assert.equal(elements.get('meta[name="robots"]').content, seo.robots);
  assert.equal(elements.get('meta[name="description"]').content, seo.description);
  assert.equal(elements.get('meta[property="og:url"]').content, seo.url);
  assert.equal(elements.get('link[rel="canonical"]')?.href ?? null, seo.canonical);
  assert.deepEqual(JSON.parse(json.textContent), seo.structuredData);
}

const sitemap = await read("public/sitemap.xml");
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), Object.keys(SEO_PAGES).map((path) => `${SITE_URL}${path}`));
assert.equal(await read("dist/sitemap.xml"), sitemap);
assert.doesNotMatch(sitemap, /lastmod|priority|changefreq|dale|<loc>[^<]*\?/);
assert.match(sitemap, /xmlns:video="http:\/\/www.google.com\/schemas\/sitemap-video\/1.1"/);
assert.equal((sitemap.match(/<video:video>/g) ?? []).length, 1);
const videoEntry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
  .find((entry) => entry[1].includes(`<loc>${SITE_URL}/video</loc>`))?.[1];
assert.ok(videoEntry, "Vídeo associado à página de exibição no sitemap");
for (const [tag, value] of [
  ["title", SEO_PAGES["/video"].title], ["description", SEO_PAGES["/video"].description],
  ["thumbnail_loc", `${SITE_URL}${videoPoster}`], ["content_loc", `${SITE_URL}${videoSource}`],
]) assert.ok(videoEntry.includes(`<video:${tag}>${value}</video:${tag}>`), `${tag}: metadados do vídeo consistentes`);
const robots = await read("public/robots.txt");
assert.equal(await read("dist/robots.txt"), robots);
for (const agent of ["*", "Googlebot", "Bingbot", "Google-Extended", "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User"]) {
  assert.ok(robots.includes(`User-agent: ${agent}\n`), `${agent}: acesso declarado`);
}
assert.ok(robots.lastIndexOf("User-agent:") < robots.indexOf("Allow:"), "Um único grupo: nenhum bot perde restrições");
assert.doesNotMatch(robots, /^Disallow: (?:\/\s*$|\/dale)/m, "Permite ler noindex do admin");
assert.match(robots, /^Disallow: \/api$/m);
assert.match(robots, /Sitemap: https:\/\/cidoe.com.br\/sitemap.xml/);
const nginx = await read("docker/nginx.conf");
assert.match(nginx, /error_page 404 \/404.html/);
assert.doesNotMatch(nginx, /try_files \$uri \$uri\/ \/index.html/);
assert.match(nginx, /add_header X-Robots-Tag \$seo_robots always/);
assert.match(nginx, /try_files \/admin.html =404/);
for (const path of ["sobre", "termos", "privacidade", "video"]) assert.ok(nginx.includes(`location = /${path} { try_files /${path}/index.html =404; }`));
console.log("SEO: HTML público, autoria, metadados, navegação, vídeo, miniatura, noindex, sitemap e bots OK. HTTP/Nginx não executados.");
await import("./check-public-startup.mjs");
