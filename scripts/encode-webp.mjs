// Gera .webp ao lado das texturas de fachada e do HDRI — o que a cena baixa de fato.
//
// Por quê: as fontes PNG/JPG vieram do pacote PBR quase sem compressão (normal 1K de
// 2 MB, HDRI 4K de 3 MB). WebP corta ~90% sem diferença visível na cena. Na GPU não
// muda nada: PNG, JPG e WebP descomprimem igual para RGBA8.
//
// Para cada fonte:
//   <nome>.webp        mesma resolução — desktop
//   <nome>.low.webp    metade da resolução — IS_LOW_TIER (celular/máquina modesta):
//                      1/4 do download, da VRAM e do tempo de upload
//   <nome>.pmrem.webp  só HDRI: 1024×512, fonte do PMREM (scene.environment). O PMREM
//                      faz cubo de largura/4 — 4K daria alvo de ~96 MiB pra sair 256/face.
//
// O manifesto (src/scene/textures/facadeTextureManifest.ts) prefere o .webp ao PNG/JPG
// e o plugin `dropSupersededTextures` (vite.config.ts) tira a fonte superada do dist.
// O HDRI é importado direto em src/scene/builders/loadEnvironment.ts.
//
// Uso: npm run textures:webp            (só o que mudou)
//      npm run textures:webp -- --force
// Requer `cwebp` (brew install webp). Outro caminho: CWEBP=/caminho/cwebp.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/assets/", import.meta.url));
const CWEBP = process.env.CWEBP ?? "cwebp";
const FORCE = process.argv.includes("--force");

// Codificação por tipo de mapa. Também tenta lossless e fica com o menor: máscara
// chapada (metalness, normal sintético) sai menor e exata em lossless.
// - Color: sharp_yuv preserva a borda colorida do caixilho no 4:2:0.
// - NormalGL: near-lossless, NUNCA lossy. Lossy WebP é sempre 4:2:0 e a direção do
//   normal mora em R/G (crominância): o relevo do concreto do topo (normalScale 20)
//   ficava visivelmente liso mesmo em q100. Near-lossless mantém a resolução de cor.
// - Displacement: vira bumpMap (derivada da altura), que realça bloco de compressão.
const ENCODE = {
  Color: ["-q", "82", "-sharp_yuv"],
  NormalGL: ["-near_lossless", "0"],
  Roughness: ["-q", "80"],
  Metalness: ["-q", "80"],
  Displacement: ["-q", "88"],
  Sky: ["-q", "88", "-sharp_yuv"], // gradiente do céu = banding se o q cair
};
const MAP_RE = /^(.*_(Color|NormalGL|Roughness|Metalness|Displacement))\.(png|jpe?g)$/i;
const SKY_RE = /^(.*)\.(png|jpe?g)$/i;

const kb = (n) => `${Math.round(n / 1024)} KB`;
const size = (path) => statSync(path).size;

function cwebp(args, src, out) {
  execFileSync(CWEBP, ["-quiet", "-mt", "-metadata", "none", ...args, src, "-o", out]);
}

/** Codifica com `args` e em lossless, grava o menor em `out`. */
function encodeSmallest(src, out, args, resize) {
  const tunedTmp = `${out}.tuned.tmp`;
  const losslessTmp = `${out}.lossless.tmp`;
  cwebp(["-m", "6", ...args, ...resize], src, tunedTmp);
  cwebp(["-lossless", "-z", "6", ...resize], src, losslessTmp);
  const [keep, drop] = size(losslessTmp) <= size(tunedTmp)
    ? [losslessTmp, tunedTmp]
    : [tunedTmp, losslessTmp];
  rmSync(drop);
  renameSync(keep, out);
}

const upToDate = (src, out) => !FORCE && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

function dims(src) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { encoding: "utf8" });
  const [w, h] = [...out.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1]));
  return { w, h };
}

const jobs = [];
const textureDir = join(ROOT, "texture");
for (const folder of readdirSync(textureDir)) {
  const dir = join(textureDir, folder);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    const m = MAP_RE.exec(file);
    if (m) jobs.push({ src: join(dir, file), stem: join(dir, m[1]), args: ENCODE[m[2]], pmrem: false });
  }
}
const envDir = join(ROOT, "environment");
for (const file of readdirSync(envDir)) {
  const m = SKY_RE.exec(file);
  if (m) jobs.push({ src: join(envDir, file), stem: join(envDir, m[1]), args: ENCODE.Sky, pmrem: true });
}

let srcTotal = 0;
let outTotal = 0;
let converted = 0;
for (const { src, stem, args, pmrem } of jobs) {
  const full = `${stem}.webp`;
  const low = `${stem}.low.webp`;
  // O .low é sempre gravado (metade da resolução sempre ganha), então é ele que marca
  // "já convertido" — o .webp cheio pode ter sido descartado de propósito (abaixo).
  if (upToDate(src, low)) continue;

  const { w, h } = dims(src);
  encodeSmallest(src, low, args, ["-resize", String(w >> 1), String(h >> 1)]);
  if (pmrem) encodeSmallest(src, `${stem}.pmrem.webp`, args, ["-resize", "1024", "512"]);
  encodeSmallest(src, full, args, []);
  // WebP maior que a fonte (PNG chapado já minúsculo): fica a fonte, que o manifesto
  // usa quando não existe .webp.
  if (size(full) >= size(src)) rmSync(full);

  const fullSize = existsSync(full) ? size(full) : size(src);
  srcTotal += size(src);
  outTotal += fullSize;
  converted++;
  console.log(
    `${src.slice(ROOT.length)}: ${kb(size(src))} -> ${existsSync(full) ? kb(fullSize) : "fonte mantida"}` +
      ` | low ${kb(size(low))}`,
  );
}
console.log(
  `\n${converted} convertido(s), ${jobs.length - converted} já atualizado(s).` +
    (converted ? ` Resolução cheia: ${kb(srcTotal)} -> ${kb(outTotal)}.` : ""),
);
