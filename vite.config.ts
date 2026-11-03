import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * O manifesto de texturas casa .webp, PNG/JPG **e** .ktx2 do mesmo mapa e usa um só:
 * .webp > PNG/JPG > .ktx2 (ver RANK em facadeTextureManifest.ts). O Rollup emite todo
 * arquivo que o glob referencia, então o perdedor iria pro dist como peso morto — nunca
 * baixado, mas ocupando o deploy. Aqui ele sai.
 *
 * A ordem espelha a do manifesto: invertida, apaga justamente o arquivo que o runtime
 * pede → 404 só em produção. O `.low.webp` tem outro nome-base, então nunca concorre.
 * Só olha src/assets/texture/ — fora dali um .png e um .webp de mesmo nome podem ser
 * intencionais.
 */
const TEXTURE_RANK: Record<string, number> = { webp: 3, png: 2, jpg: 2, jpeg: 2, ktx2: 1 };

function dropSupersededTextures(): Plugin {
  return {
    name: "drop-superseded-textures",
    generateBundle(_options, bundle) {
      // Um asset pode ter várias fontes: o Rollup funde arquivos de conteúdo idêntico
      // (Facade001 e Facade002 dividem mapas) num só, com todas em originalFileNames.
      const texturesOf = (asset: (typeof bundle)[string]) =>
        asset.type !== "asset" ? [] : asset.originalFileNames.flatMap((source) => {
          const match = /^(.*\/assets\/texture\/.*)\.([^./]+)$/.exec(source);
          const rank = match ? TEXTURE_RANK[match[2].toLowerCase()] : undefined;
          return match && rank ? [{ stem: match[1], rank }] : [];
        });
      const best = new Map<string, number>();
      for (const asset of Object.values(bundle)) {
        for (const { stem, rank } of texturesOf(asset)) {
          best.set(stem, Math.max(best.get(stem) ?? 0, rank));
        }
      }
      const dropped: string[] = [];
      for (const [key, asset] of Object.entries(bundle)) {
        const textures = texturesOf(asset);
        // Só sai se TODAS as fontes dele perderam — senão alguém ainda pede o arquivo.
        if (!textures.length || textures.some(({ stem, rank }) => rank >= best.get(stem)!)) continue;
        dropped.push(asset.fileName);
        delete bundle[key];
      }
      // Sem log, um drop indevido (algum módulo importando a fonte direto, não pelo
      // manifesto) sumiria em silêncio e viraria 404 só em produção.
      if (dropped.length) {
        this.info(`texturas superadas, fora do dist (${dropped.length}): ${dropped.join(", ")}`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dropSupersededTextures()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Back local (PORT=3000 no .env da API). Same-origin em dev = sem CORS.
      // Produção: reverse proxy (nginx) servindo /api same-origin, ou VITE_API_URL.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
