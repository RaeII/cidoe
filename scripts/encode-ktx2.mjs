// Converte os mapas PBR de src/assets/texture/<pasta>/ para .ktx2 (Basis Universal).
//
// Por quê: PNG/JPG descomprimem para RGBA8 na GPU — um 1K vira 4 MB de VRAM
// (5.3 MB com mipmaps). KTX2 fica comprimido na GPU (BC7/ASTC/ETC2, ~1 byte/texel)
// e o download cai junto. O manifesto prefere .ktx2 quando existe e cai de volta
// no PNG/JPG quando não existe — rodar isto é opcional, nunca quebra o build.
//
// Uso: npm run textures:ktx2        (só converte o que mudou)
//      npm run textures:ktx2 -- --force
//
// Encoder: ktx2-encoder (WASM do basis_universal). Sem binário externo, sem brew.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeToKTX2 } from "ktx2-encoder";
import { read as readKTX2, KHR_DF_TRANSFER_SRGB } from "ktx-parse";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXTURE_DIR = join(ROOT, "src/assets/texture");
const FORCE = process.argv.includes("--force");

// Só os sufixos que o manifesto consome. _NormalDX e previews ficam de fora.
const MAP_SUFFIXES = ["Color", "NormalGL", "Roughness", "Metalness", "Displacement"];

// Codec por tipo de mapa.
//
// ETC1S  — LZ em cima do bloco: menor download E menor VRAM. Padrão.
// UASTC  — 8 bits/texel + zstd: ~4x o tamanho do ETC1S, mas preserva gradiente.
//          Usado só em normal map, onde bloco ETC1S vira faceta visível (a cena
//          roda normalScale alto, que amplifica qualquer artefato do normal).
//
// Botão de ajuste: se o download do normal pesar mais que a qualidade vale,
// troque `uastc: true` por `false` aqui — o resto do pipeline não muda.
const CODEC = {
  Color: { uastc: false, srgb: true, normal: false },
  NormalGL: { uastc: true, srgb: false, normal: true },
  Roughness: { uastc: false, srgb: false, normal: false },
  Metalness: { uastc: false, srgb: false, normal: false },
  Displacement: { uastc: false, srgb: false, normal: false },
};

// Pastas que nunca usam UASTC. O topo dos prédios (concreto) é visto de cima e de
// longe: o normal map em UASTC dava 1.3 MB — a maior textura do pacote inteiro —
// contra ~200 KB em ETC1S, sem diferença visível nessa distância.
const ETC1S_ONLY_FOLDERS = new Set(["Concrete024_1K-JPG"]);

/** Decodifica PNG/JPG para RGBA cru — o encoder WASM pede isso no Node. */
async function decodeImage(buffer) {
  // PNG assinatura: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(Buffer.from(buffer));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  const img = jpeg.decode(Buffer.from(buffer), { useTArray: true, formatAsRGBA: true });
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

function suffixOf(file) {
  const name = basename(file, extname(file));
  return MAP_SUFFIXES.find((s) => name.endsWith(`_${s}`)) ?? null;
}

/** true se o .ktx2 existe e é mais novo que a fonte. */
async function isUpToDate(src, out) {
  if (FORCE || !existsSync(out)) return false;
  const [a, b] = await Promise.all([stat(src), stat(out)]);
  return b.mtimeMs >= a.mtimeMs;
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/**
 * Relê o container recém-gerado e confere o que o runtime depende: cadeia de
 * mipmaps completa (senão o minFilter do three amostra errado e a fachada
 * cintila ao longe) e transfer function batendo com o tipo do mapa (sRGB só no
 * color; ligar em normal/roughness quebraria a iluminação). Falha o script —
 * uma textura com header errado só aparece como bug visual muito depois.
 */
function verify(bytes, label, codec) {
  const container = readKTX2(bytes);
  const { pixelWidth: w, pixelHeight: h, levels, dataFormatDescriptor } = container;
  const expectedLevels = Math.floor(Math.log2(Math.max(w, h))) + 1;
  if (levels.length !== expectedLevels) {
    throw new Error(`${label}: ${levels.length} mip levels, esperado ${expectedLevels} (${w}x${h})`);
  }
  const isSrgb = dataFormatDescriptor[0]?.transferFunction === KHR_DF_TRANSFER_SRGB;
  if (isSrgb !== codec.srgb) {
    throw new Error(`${label}: transferFunction sRGB=${isSrgb}, esperado ${codec.srgb}`);
  }
}

async function main() {
  const folders = (await readdir(TEXTURE_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let converted = 0;
  let skipped = 0;
  let srcTotal = 0;
  let outTotal = 0;

  for (const folder of folders) {
    const dir = join(TEXTURE_DIR, folder);
    for (const file of await readdir(dir)) {
      const ext = extname(file).toLowerCase();
      if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg") continue;
      const suffix = suffixOf(file);
      if (!suffix) continue;

      const src = join(dir, file);
      const out = join(dir, `${basename(file, extname(file))}.ktx2`);
      if (await isUpToDate(src, out)) {
        skipped++;
        continue;
      }

      const codec = ETC1S_ONLY_FOLDERS.has(folder)
        ? { ...CODEC[suffix], uastc: false }
        : CODEC[suffix];
      const input = new Uint8Array(await readFile(src));
      const ktx2 = await encodeToKTX2(input, {
        imageDecoder: decodeImage,
        isKTX2File: true,
        generateMipmap: true,
        // CompressedTexture do three tem flipY = false; TextureLoader (PNG/JPG)
        // tem flipY = true. Gravar já invertido faz as duas rotas renderizarem
        // igual — trocar de formato não pode mudar a imagem.
        isYFlip: true,
        isUASTC: codec.uastc,
        // UASTC cru é 8 bits/texel; zstd é o que torna o normal map viável.
        needSupercompression: codec.uastc,
        uastcLDRQualityLevel: 2,
        // ETC1S: 255 = topo da escala qualidade/tamanho. Rodamos isto offline,
        // uma vez por textura — não há motivo pra economizar tempo de encode.
        qualityLevel: 255,
        compressionLevel: 4,
        isNormalMap: codec.normal,
        isPerceptual: codec.srgb,
        isSetKTX2SRGBTransferFunc: codec.srgb,
      });

      verify(ktx2, `${folder}/${file}`, codec);
      await writeFile(out, ktx2);
      srcTotal += input.byteLength;
      outTotal += ktx2.byteLength;
      converted++;
      const delta = ((1 - ktx2.byteLength / input.byteLength) * 100).toFixed(0);
      console.log(
        `${folder}/${file}: ${kb(input.byteLength)} -> ${kb(ktx2.byteLength)} (${delta}%) ` +
          `[${codec.uastc ? "UASTC+zstd" : "ETC1S"}]`,
      );
    }
  }

  console.log(
    `\n${converted} convertido(s), ${skipped} já atualizado(s).` +
      (converted ? ` Total: ${kb(srcTotal)} -> ${kb(outTotal)}.` : ""),
  );
}

await main();
