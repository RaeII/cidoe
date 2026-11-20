// Gera os WebP do evento de clubes em public/clubes/<slug>/ a partir das fontes PNG.
//
// Por quê: cada fonte é PNG 1254×1254 de ~1 MB. O telão amostra 64×64 LEDs e o seletor
// mostra miniatura — 256 px basta (mesma regra das imagens do telão em
// src/assets/club-images/), ~10 KB cada.
//
// Fonte: uma pasta por clube (nome da pasta = slug), em qualquer profundidade (pasta sem
// PNG é só agrupadora, ex. `1.clubes-part-2/`). Cada pasta tem exatamente 3 PNGs.
// Saída por clube:
//   1.webp      256×256 — escudo (regra: Escudo > Brasão > Emblema > Distintivo >
//               Medalhão no nome do arquivo; exceção em OVERRIDES)
//   2.webp      256×256 — as outras duas, em ordem alfabética pt-BR do nome
//   3.webp
//   thumb.webp  96×96 do 1 — miniatura do seletor de clube
//
// Uso: npm run clubs:webp                         (só o que mudou; fonte ../cidoa-back/clubes)
//      npm run clubs:webp -- /outra/fonte --force
// Desatualizado = saída mais velha que a fonte ou que este script.
// Requer `cwebp` (brew install webp). Outro caminho: CWEBP=/caminho/cwebp.
// Sai com erro se uma pasta não tiver 3 PNGs ou não houver escudo para escolher.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const SRC = resolve(REPO, args.find((a) => !a.startsWith("--")) ?? "../cidoa-back/clubes");
const OUT = join(REPO, "public/clubes");
const CWEBP = process.env.CWEBP ?? "cwebp";
const ENCODE = ["-q", "90", "-sharp_yuv", "-m", "6"];
// Mudou o script (OVERRIDES, ENCODE)? Tudo fica velho.
const SCRIPT_MTIME = statSync(fileURLToPath(import.meta.url)).mtimeMs;

// Escudo cujo nome não casa a regra. slug → nome do arquivo sem extensão.
const OVERRIDES = {
  caxias: "Engrenagem de Caxias com uvas pixeladas",
};
const CREST_RULES = [/escudo/, /brasao/, /emblema/, /distintivo/, /medalhao/];

const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const stem = (file) => basename(file, ".png").normalize("NFC");
const collator = new Intl.Collator("pt-BR");
const fail = (msg) => {
  console.error(`erro: ${msg}`);
  process.exit(1);
};

/** Pastas com PNG = clube; sem PNG = agrupadora, desce. */
function findClubs(dir, clubs = []) {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  const pngs = entries.filter((e) => e.isFile() && /\.png$/i.test(e.name)).map((e) => join(dir, e.name));
  if (pngs.length) clubs.push({ slug: basename(dir), pngs });
  else for (const e of entries) if (e.isDirectory()) findClubs(join(dir, e.name), clubs);
  return clubs;
}

function pickCrest(slug, pngs) {
  const override = OVERRIDES[slug];
  if (override) {
    const hit = pngs.find((p) => stem(p) === override.normalize("NFC"));
    if (!hit) fail(`${slug}: override "${override}" não encontrado`);
    return hit;
  }
  for (const rule of CREST_RULES) {
    const hit = pngs.find((p) => rule.test(fold(stem(p))));
    if (hit) return hit;
  }
  fail(`${slug}: nenhum escudo pelo nome; adicione em OVERRIDES`);
}

function encode(src, out, px) {
  if (!FORCE && existsSync(out) && statSync(out).mtimeMs >= Math.max(statSync(src).mtimeMs, SCRIPT_MTIME)) return false;
  const tmp = `${out}.tmp`;
  execFileSync(CWEBP, ["-quiet", "-mt", "-metadata", "none", ...ENCODE, "-resize", px, px, src, "-o", tmp]);
  renameSync(tmp, out);
  return true;
}

if (!existsSync(SRC)) fail(`fonte não existe: ${SRC}`);
const clubs = findClubs(SRC);
const seen = new Set();
for (const { slug, pngs } of clubs) {
  if (pngs.length !== 3) fail(`${slug}: ${pngs.length} PNGs, esperado 3`);
  if (seen.has(slug)) fail(`${slug}: slug repetido`);
  seen.add(slug);
}

let written = 0;
for (const { slug, pngs } of clubs.sort((a, b) => a.slug.localeCompare(b.slug))) {
  const crest = pickCrest(slug, pngs);
  const rest = pngs.filter((p) => p !== crest).sort((a, b) => collator.compare(stem(a), stem(b)));
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  const jobs = [
    [crest, "1.webp", "256"],
    [rest[0], "2.webp", "256"],
    [rest[1], "3.webp", "256"],
    [crest, "thumb.webp", "96"],
  ];
  let n = 0;
  for (const [src, name, px] of jobs) if (encode(src, join(dir, name), px)) n++;
  if (n) console.log(`${slug}: 1=${stem(crest)} | 2=${stem(rest[0])} | 3=${stem(rest[1])}`);
  written += n;
}
console.log(`\n${clubs.length} clube(s), ${written} arquivo(s) gravado(s).`);
