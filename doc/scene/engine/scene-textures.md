---
title: Texturas de Fachada (manifesto + loader + WebP)
tags:
  - scene
  - engine
  - textures
aliases:
  - scene-textures
  - facade-textures
  - ktx2
  - webp
---

# Texturas de Fachada — manifesto + loader + WebP

Pasta `src/scene/textures/`. Textura de fachada vem do **catálogo do backend** (só o endereço/pasta), assets ficam no front (`src/assets/texture/`). Loading é **lazy + assíncrono + cache**. Formato servido é **WebP** gerado da fonte PNG/JPG (`npm run textures:webp`): 1K no desktop, **512 px no `IS_LOW_TIER`** (celular/máquina modesta). Fonte PNG/JPG = fallback pra mapa sem `.webp`; `.ktx2` (Basis) = último fallback. Foco: desempenho de carregamento sem perder qualidade de imagem.

> [!info] Plano A
> Backend guarda só o `value` (nome da pasta). Bytes ficam no front, hasheados pelo Vite = cache imutável de graça no host (Cloudflare Pages/Vercel). Zero infra, zero custo. Ver [[customization-api]] e [[personalizacoes]].

## Números

Home (`/`), Playwright + Chrome, cidade de pré-lançamento. Texturas de fachada + topo + HDRI:

| | Antes (PNG/JPG fonte, HDRI JPG 4K) | Depois (WebP) |
|---|---|---|
| Desktop | 33 arquivos, **17,3 MB** | 32 arquivos, **2,5 MB** (1K + HDRI 4K) |
| Celular (`IS_LOW_TIER`) | os mesmos 17,3 MB | **0,75 MB** (512 px + HDRI 2K) |
| `dist/` (todas as imagens) | 36 MB | 9,5 MB (inclui as duas variantes e miniaturas) |
| VRAM por mapa | RGBA8 1K ≈ 5,3 MB c/ mip | igual no desktop; 512 = **¼** no celular |

WebP corta download, **não** VRAM: PNG, JPG e WebP descomprimem igual pra RGBA8. Só o `.low.webp` (metade da resolução) corta VRAM e tempo de upload.

> [!note] NormalGL da fachada sob demanda
> Com `normalScale = 0` (padrão da fachada) o manager pede o set com `{ normal: false }`: o NormalGL não baixa (~630 KB desktop, ~175 KB celular, mais upload e VRAM). Painel sobe a escala → `loadFacadeTextureSet` completa os mapas necessários dos materiais em uso e o manager reaplica. Topo (Concrete024, escala 20) segue com normal.

## `facadeTextureManifest.ts` (sem THREE)

Descobre as pastas de textura via `import.meta.glob` — **sem import de THREE**, então a página admin consome sem puxar three pro bundle.

- Glob casa **só sufixos usados**: `*_{Color,NormalGL,Roughness,Metalness,Displacement}.{png,jpg,jpeg,ktx2,webp}`. Assim Vite não emite pro dist o que ninguém carrega (`_NormalDX`, preview `.png`). Usa NormalGL (OpenGL), não DX.
- Segundo glob: `*_{…}.low.webp` (512 px). Só entra no mapa quando `IS_LOW_TIER` (`src/scene/utils/deviceTier.ts`) — o manifesto já devolve a URL certa, runtime não sabe de tier.
- `eager` + `?url&no-inline` = só as **URLs** (strings hasheadas), não os bytes. Bytes só baixam quando o loader busca a URL. `no-inline`: sem ele o Vite embutia todo WebP < 4 KB como data URI no chunk JS (29 arquivos, ~49 KB de base64 baixados por todo mundo, inclusive mapas que a cena nem usa).
- **Prioridade por `RANK`** quando o mesmo mapa existe em mais de uma forma: `.low.webp` (só low tier) > `.webp` > PNG/JPG > `.ktx2`. Basis perde da fonte porque o artefato dele aparece no normal map (reflexo cintilante na fachada).
- Parse agrupa por pasta; pasta sem `_Color` é descartada.

Exporta:

| Símbolo | O que é |
|---|---|
| `FACADE_TEXTURE_FOLDERS` | Pastas no repo (fonte da verdade do que existe). `{ folder, label }`. |
| `resolveFacadeFolder(value)` | Normaliza `value` do catálogo (`"texture/Foo"` ou `"Foo"`) → nome da pasta. |
| `getFacadeMapUrls(value)` | URLs dos mapas da pasta, ou `null` se não existe / sem color map. |

## `facadeTextureLoader.ts` (THREE + KTX2 + cache)

```ts
initFacadeTextureLoader(renderer): void
peekFacadeTextureSet(value): FacadeTextureSet | null
loadFacadeTextureSet(value, anisotropy, options?: FacadeLoadOptions): Promise<FacadeTextureSet | null>
type FacadeLoadOptions = { normal?: boolean; roughness?: boolean; metalness?: boolean; displacement?: boolean; bump?: boolean }
```

- **Mapas sob demanda:** opções `false` pulam mapas opcionais; pedidos posteriores completam o mesmo set. Cor tem uma Promise por pasta; opcionais têm uma por pasta/mapa. `bump: true` pede displacement somente quando o normal não é usado ou falhou. Topo pula metalness; roughness/normal da pedra residencial continuam obrigatórios independentemente dos sliders do topo.

- **PNG/JPG/WebP via `loadImageTexture`** (`src/scene/textures/loadImageTexture.ts`, também usado pelo HDRI): `ImageBitmapLoader` com `imageOrientation: "flipY"` + `texture.flipY = false` (ImageBitmap ignora `flipY` no upload, o flip vem do `createImageBitmap`). Decode sai da main thread — com `TextureLoader` o decode do `HTMLImageElement` caía dentro do `texSubImage2D` (~230 ms no profile). Mesma regra do `GLTFLoader` do three: Safari < 17 / Firefox < 98 / sem `createImageBitmap` → `TextureLoader`. `bitmap.close()` no `dispose` da textura. Screenshot antes/depois: pixel idêntico (nada espelhado).
- **`initFacadeTextureLoader(renderer)`** — chamado 1× pelo manager. Monta o `KTX2Loader` com `setTranscoderPath(BASE_URL + "basis/")` e `detectSupport(renderer)` (a GPU decide BC7 / ASTC / ETC2). Idempotente.
- **Assíncrono**: `KTX2Loader.load()` não devolve textura na hora (transcode roda em worker). Então o set inteiro é `Promise`. Material sobe sem mapas e recebe os mapas quando chegam — a cena aparece antes das texturas em vez de travar.
- **`peekFacadeTextureSet`** — set já no cache, potencialmente parcial, sem tocar a rede. Chamadores também pedem os mapas necessários ao loader. Evita 1 frame cinza quando o manager é recriado ou quando o usuário volta pra uma textura já vista.
- **Cache por pasta, vida do app**: cada textura carrega 1×, compartilhada entre todos os prédios/materiais. Chamadas concorrentes compartilham a mesma Promise. Trocar textura e voltar reusa — **zero re-download, zero re-upload GPU**.
- Resolve `null` se a pasta sumiu (catálogo aponta pra asset removido) ou se o color map falhou → chamador cai no fallback. Mapas secundários que falham viram `null` no set (não derrubam a textura inteira).

```ts
type FacadeTextureSet = {
  color: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  metalness: THREE.Texture | null;
  displacement: THREE.Texture | null;
};
```

> [!note] ponytail
> Cache global sem LRU/eviction — curated set pequeno. Adicionar eviction só se o número de texturas crescer muito.

## Pipeline WebP

```bash
npm run textures:webp            # só o que mudou
npm run textures:webp -- --force # tudo de novo
```

`scripts/encode-webp.mjs`. Usa `cwebp` (`brew install webp`; outro caminho via `CWEBP=`) e `sips` (macOS) pra ler a resolução. Pra cada fonte `src/assets/texture/*/*_{Color,NormalGL,Roughness,Metalness,Displacement}.{png,jpg}` grava ao lado:

- `<mapa>.webp` — mesma resolução (desktop). Descartado se sair maior que a fonte (fica a fonte).
- `<mapa>.low.webp` — metade da resolução (`IS_LOW_TIER`).

Mesmo script gera o HDRI — ver [[scene-builders#loadEnvironment.ts]].

Codificação por mapa (sempre tenta lossless também e fica com o menor — máscara chapada sai exata e menor):

| Mapa | cwebp | Por quê |
|---|---|---|
| `Color` | `-q 82 -sharp_yuv` | sharp_yuv segura a borda colorida do caixilho no 4:2:0 |
| `NormalGL` | `-near_lossless 0` | **nunca lossy**: lossy WebP é sempre 4:2:0 e a direção do normal mora em R/G (crominância). Teste A/B: relevo do concreto do topo (`normalScale` 20) ficava liso mesmo em q100; near-lossless volta ao original |
| `Roughness` / `Metalness` | `-q 80` | dado em cinza, tolerante |
| `Displacement` | `-q 88` | vira `bumpMap` (derivada), realça bloco de compressão |

Comparação visual: mesma build servida com os bytes da fonte (rota interceptada no Playwright) × WebP. Desktop: fachada e céu indistinguíveis; topo de concreto igual com near-lossless. Celular 512: grão do concreto e borda da janela levemente mais suaves só no zoom máximo, em pixel físico (DPR 3).

## Pipeline KTX2 (fallback, fora do caminho padrão)

```bash
npm run textures:ktx2            # só o que mudou
npm run textures:ktx2 -- --force # tudo de novo
```

`scripts/encode-ktx2.mjs`. Encoder é `ktx2-encoder` (WASM do basis_universal) — **sem binário externo**, sem `brew install ktx`. Decoders `pngjs` / `jpeg-js`. Escreve `<mapa>.ktx2` ao lado da fonte, incremental por mtime.

Codec por tipo de mapa:

| Mapa | Codec | Por quê |
|---|---|---|
| `Color` | ETC1S + sRGB | menor download **e** menor VRAM |
| `NormalGL` | UASTC + zstd | bloco ETC1S vira faceta visível; a cena roda `normalScale` alto, que amplifica artefato de normal |
| `Roughness` / `Metalness` / `Displacement` | ETC1S linear | dado, não cor |

Ajustes disponíveis no script:

- `CODEC` — tabela por sufixo. Trocar `uastc: true` → `false` no normal se o download pesar mais que a qualidade vale.
- `ETC1S_ONLY_FOLDERS` — pastas que nunca usam UASTC. `Concrete024_1K-JPG` (topo dos prédios) está nela: visto de cima e de longe, o normal em UASTC dava 1.3 MB — a maior textura do pacote — contra 261 KB em ETC1S.

Detalhes que o pipeline garante:

- **`isYFlip: true`** — `CompressedTexture` do three tem `flipY = false`, `TextureLoader` (PNG/JPG) tem `flipY = true`. Gravar já invertido faz as duas rotas renderizarem igual: trocar de formato não muda a imagem.
- **Verificação por arquivo** — relê o container com `ktx-parse` e falha o script se a cadeia de mipmaps estiver incompleta (minFilter amostraria errado, fachada cintilaria ao longe) ou se a transfer function sRGB não bater com o tipo do mapa.

O transcoder mora em `public/basis/` (`basis_transcoder.js` + `.wasm`, cópia de `three/examples/jsm/libs/basis/`). Baixado 1× por cliente, só quando um `.ktx2` é pedido.

> [!warning] Plugin `drop-superseded-textures` (vite.config.ts, `dropSupersededTextures`)
> O glob casa `.webp`, fonte **e** `.ktx2`, então o Rollup emitiria todos pro dist — os perdedores como peso morto (nunca baixados). O plugin agrupa os assets de `src/assets/texture/` por nome-base (via `originalFileNames`) e remove os de rank menor (`webp 3 > png/jpg 2 > ktx2 1`), e **loga** o que removeu. `.low.webp` tem outro nome-base, nunca concorre. Asset fundido pelo Rollup (conteúdo idêntico, ex. Facade001/Facade002) só sai se **todas** as fontes dele perderam. A ordem **tem que espelhar o `RANK` do manifesto**: invertida, apaga justamente o arquivo que o runtime pede → 404 só em produção. Mexeu na prioridade do manifesto, mexa aqui junto.

## Fiação na cena

### Global (cena inteira)

- [[scene-types#TextureSettings|TextureSettings.textureKey]] = `value` do catálogo da textura ativa. Default = `"texture/Facade006_1K-mirrored-PNG"` (= seed).
- [[scene-managers|createDonationManager]]: `peek` no construtor (cache quente = nasce texturizado), senão pede assíncrono. Em `updateTextureSettings`, pasta diferente → `requestGlobalFacadeSet` recarrega, reatribui `facadeSet` e reaplica em todos os materiais de fachada. Um **token** descarta a resolução de uma seleção já superada (clique rápido no seletor).
- Topo (concreto `Concrete024`) **não** entra no catálogo, mas passa pelo mesmo loader — ganha lazy e cache compartilhado de graça. Antes eram 4 imports estáticos (~4 MB baixados sempre).
- Mapas sem contribuição não entram no programa do material: normal/roughness/emissive/displacement são `null` quando sua intensidade/escala é zero. `material.needsUpdate` só é acionado quando a presença de um mapa muda; arrastar intensidade/tiling atualiza uniforms sem recompilar o shader.
- **Nada é descartado no `dispose`**: fachada e topo vêm do cache compartilhado, reusado entre recriações do manager.
- Seletor global: [[html-components#TextureControls.tsx|TextureControls]] lista `catalog.textures` ativas; clicar seta `textureKey`.

### Por edifício

[[scene-types#BuildingCustomization|BuildingCustomization.textureKey]] (`string | null`, `null` = herda a global).

Textura por edifício **não** custa mesh dedicado: cada textura em uso tem o próprio `InstancedMesh` (**grupo de fachada**, ver [[scene-managers#Grupos de fachada]]). Draw calls = nº de texturas, não de prédios.

- Grupo 0 = textura global da cena (`facadeMaterial`). Prédio sem textura própria e sem sorteio fica nele.
- Demais grupos = pool do catálogo (`setFacadeTexturePool`), um material clonado por pasta.
- Textura própria com grupo → o prédio só muda de `InstancedMesh`. Só cai em `customShapeMeshes` a pasta **sem** grupo (fora do pool) — `hasUngroupedFacadeTexture`.
- O set do clone vive num `WeakMap<Material, FacadeTextureSet>` — **não** em `userData`, porque `Material.copy` serializa `userData` com JSON e estouraria com `THREE.Texture` dentro.
- `applyFacadeFolder` (usado por `applyBuildingFacadeTexture` e pelos grupos) é **idempotente**: compara com a pasta já aplicada e sai cedo, então `syncCustomShapes` pode chamar em todo rebuild sem custo. Também guarda contra corrida: se a seleção mudar enquanto baixa, o resultado velho é descartado.
- Trocar a textura **global** refaz os grupos (a pasta global é sempre o grupo 0) + `rebuildInstances()`.
- UI: [[html-components#BuildingManageDialog.tsx|BuildingManageDialog]], aba **Aparência → Fachada** (opção "Padrão" = `null`).

### Sorteio por edifício

`TextureSettings.randomPerBuilding` (padrão **ligado**, aba **texturas**): prédio **sem** textura escolhida sorteia uma entre **todas as texturas ativas do catálogo**, em vez da cidade inteira usar `textureKey`. Serve pra ver a cidade de teste com variedade real ([[edificios-teste]]).

- Pool = `value` das texturas do catálogo, plumbado do editor até o manager: `facadeTexturePool` → [[three-components|CitySceneCanvas]] → [[scene-hooks|useCityScene]] → `runtime.setFacadeTexturePool` → `donationManager.setFacadeTexturePool`. Toggle desligado = lista vazia = textura global em tudo.
- Cidade inicial (`seeded`): usa só as 6 fachadas de `SEED_FACADE_TEXTURES` (001, 005, 018A, 020A, 006 espelhada, 002), na mesma ordem em local e produção. Catálogo do ambiente não entra nesse sorteio. **Facade007, Facade014, Facade016 e Facade019A** continuam fora. Cidades públicas seguem catálogo completo. Check: `node scripts/check-prelaunch.mjs`.
- Sorteio é **determinístico pelo id da doação** (`pickIndex`, ver [[scene-utils#random.ts]]): o mesmo prédio cai sempre na mesma textura — reload, troca de filtro e recriação do runtime não embaralham a cidade.
- Pasta cadastrada no catálogo mas ausente de `src/assets/texture/` é ignorada (o prédio fica na textura global, nunca sem textura).
- Customização do usuário **ganha** do sorteio.

## Admin: cadastradas × não-cadastradas

[[personalizacoes]] compara `FACADE_TEXTURE_FOLDERS` (repo) com as opções do catálogo:

- **Cadastradas** = viram opção do catálogo → usuário seleciona.
- **Não-cadastradas** = pasta no repo sem opção → botão **Cadastrar** cria a opção (`value` = pasta, key = slug). Depois de cadastrada, admin controla (toggle/editar/excluir).

Textura nova no repo = dropar a pasta em `src/assets/texture/`, rodar `npm run textures:webp` → aparece como não-cadastrada, sem editar código. Sem rodar o script a pasta funciona igual (cai na fonte PNG/JPG), só mais pesada.

### Preservação de qualidade

`normalMap` tem precedência sobre `bumpMap` no shader instalado: ao usar normal, o material não associa o bump redundante. Displacement de vértices continua quando sua escala é positiva; fachada com normal desligado mantém seu bump. Trocas de configuração carregam os mapas que passam a contribuir. Formato WebP, resolução, anisotropia e mipmaps das fachadas não mudam. O cache continua compartilhado entre cidade e prévia; não há descarte de texturas em uso por outro contexto.
