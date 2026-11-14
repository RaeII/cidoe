---
title: Relatório — Desempenho com 10 mil edifícios de formato
tags:
  - cidoe
  - desempenho
  - threejs
  - relatorio
aliases:
  - Relatório de desempenho dos edifícios
---

# Relatório — Desempenho com 10 mil edifícios de formato

> [!abstract] Escopo
> Só análise. Nenhum código alterado. Data: 2026-11-11. Three r183.
> Cenário do dono: lote de ~10 mil edifícios, ~5330 ocultos por distância, cena travando no Mac M4 24 GB.

## 1. Veredito

Hipótese "os 5 modelos novos causam a queda": **parcialmente certa. Agravam, não são a raiz.**

- Lote só com os 9 modelos antigos também desaba: **11,7 fps**.
- Lote só com os 5 novos: **7,4 fps**. Cada um custa 5–6 draw calls; antigo custa 2.
- Mesmo lote com edifício padrão (instanciado): **60 fps**, 101 draw calls.

Raiz, por ordem de peso medido:

1. **Captura do cube de reflexo a cada 4 frames com câmera em movimento** (padrão `followCamera: true`). Redesenha a cidade inteira, sem cull de distância. Pausa de 180–350 ms por captura. É o "travando".
2. **Um `Mesh` + materiais próprios por edifício de formato.** 10 mil edifícios = 10 mil meshes, 20–60 mil materiais, 7–17 mil draw calls por frame. CPU do three gasta ~44 ms/frame só em overhead por draw call.
3. **Sem LOD.** ~19–20 milhões de triângulos por frame. Edifício a 180 un., 80% dentro da névoa, desenhado com montante de 4 cm.

Gatilho da regressão: mudança em `handleBulkDonation` (`src/components/CitySceneEditor.tsx`, commit `8b74363`). Lote antes criava só edifício padrão (instanciado). Agora sorteia formato do catálogo → 14 de 15 opções saem do `InstancedMesh`.

## 2. Método

- Chrome headless, ANGLE Metal, Apple M4, contra `http://localhost:5173/` (cena real, dev server do dono).
- Janela 1728×1000, DPR 1. Um teste repetido em DPR 2 (3440×1826).
- Cena inicial: 105 doações reais. Lote: +10 000 via `addDonations` do handle do canvas, valores 10–1000, semente fixa, formato sorteado sem peso no conjunto indicado.
- Órbita contínua por arrasto real do mouse, 6 s. Aquecimento de 1,5 s descartado.
- Contagem: `drawElements/drawArrays(+Instanced)` interceptados no contexto WebGL2, separados por framebuffer (tela × offscreen = cube). Tempo JS = soma dos callbacks de `requestAnimationFrame` por frame.
- Perfil de CPU: `Profiler` do CDP, amostragem 200 µs.
- Geometria: builders reais rodados em Node (mesmo padrão de `scripts/check-building-draw-calls.mjs`).

Scripts da medição, versionados em `scripts/` para repetir:

| Script | Objetivo | Precisa |
|---|---|---|
| `scripts/measure-scene-performance.mjs` | Cena real em órbita: fps, JS por frame, draws e triângulos (tela × captura do cube), perfil de CPU. Tabelas 3.1 e 3.2 | Dev server + API + Chrome |
| `scripts/measure-building-geometry.mjs` | Custo por formato: grupos, materiais, triângulos, variantes e MB do cache por andar. Tabelas 3.3 e 3.4 | Nada (Node) |

```bash
node scripts/measure-building-geometry.mjs                         # 3.3 e 3.4
node scripts/measure-scene-performance.mjs 0 none                  # A
node scripts/measure-scene-performance.mjs 10000 none              # B
node scripts/measure-scene-performance.mjs 10000 default,twisted,octagonal,setback,tapered,chrysler,hearst,empire,taipei,one-trade   # C
node scripts/measure-scene-performance.mjs 10000 all               # D (caso do dono)
node scripts/measure-scene-performance.mjs 10000 yachthouse,residential,apartment,gourmet,loft   # E
REFLECTION='{"followCamera":false,"continuous":false}' PROFILE=1 node scripts/measure-scene-performance.mjs 10000 all   # D probe estático + 3.2
DPR=2 REFLECTION='{"followCamera":false,"continuous":false}' node scripts/measure-scene-performance.mjs 10000 all       # DPR 2
```

> [!note] Limites
> Headless não é o navegador do dono: sem extensões, sem painel admin aberto. Números absolutos variam; proporções valem. Estimativas (seção 7) não foram medidas — marcadas como tal.

## 3. Medições

### 3.1 Cena ao vivo, +10 000 edifícios, órbita

| Cenário | fps | JS/frame | Draws tela | Tris tela | Draws por captura | Tris por captura | JS frame de captura |
|---|---|---|---|---|---|---|---|
| A. Só 105 doações reais | 60 | 1,1 ms | 111 | 0,14 M | 271 | 0,3 M | 3,1 ms |
| B. Lote padrão (instanciado) | 60 | 1,5 ms | 101 | 0,27 M | 336 | 2,2 M | 4,1 ms |
| C. Lote 9 antigos + padrão | 11,7 | 35 ms | 7 188 | 20,4 M | 27 118 | 76,4 M | 179 ms |
| D. Lote 15 opções (caso do dono) | 9,6 | 47 ms | 10 322 | 19,3 M | 39 678 | 74,3 M | 245 ms |
| E. Lote só os 5 novos | 7,4 | 61 ms | 16 786 | 18,9 M | 64 705 | 68,0 M | 346 ms |
| D + probe estático (`followCamera: false`, `continuous: false`) | 21,5 | 43 ms | 10 169 | 19,0 M | 0 | 0 | — |
| D + probe estático, DPR 2 | 21,1 | 44,5 ms | 10 145 | 19,0 M | 0 | 0 | — |

Leitura:

- B → C: mesma quantidade de edifícios, 60 → 11,7 fps. Diferença única: formato ≠ padrão. Custo é a arquitetura "mesh por edifício", não um modelo específico.
- C → E: triângulos iguais (~19–20 M), draws 2,3×, fps cai 37%. Custo segue **draw calls**, não triângulos.
- D → D probe estático: 9,6 → 21,5 fps. Captura custa mais da metade do tempo.
- DPR 1 → DPR 2: fps igual. Gargalo é **CPU (JS)**, não pixel. Baixar resolução não resolve.
- JS ≈ 3,6–4,9 µs por draw call nos três cenários de formato (C: 35 ms ÷ 7 188; D: 43 ms ÷ 10 169; E: 61 ms ÷ 16 786). Custo quase linear em draw calls.

### 3.2 Perfil de CPU (cenário D, probe estático)

| % self | Função |
|---|---|
| 12,6 | `WebGLRenderer.renderBufferDirect` |
| 10,2 | `setProgram` |
| 6,3 | `refreshUniformsCommon` |
| 5,7 | `markUniformsLightsNeedsUpdate` |
| 5,5 | `projectObject` |
| 4,3 | `WebGLUniforms.upload` |
| 3,7 | `refreshMaterialUniforms` |
| 2,6 | `Matrix4.multiplyMatrices` |
| 2,5 | `sort` (lista de render) |
| 2,5 | `pickAt` (hover durante o arrasto) |
| 2,2 | `refreshFogUniforms` |
| 1,8 | `updateMatrixWorld` |
| 0,8 | `updateDistanceCulling` |

Tudo acima de `pickAt` = overhead do three por objeto/material. Material único por draw → three reenvia todos os uniforms a cada draw. Cull de distância do manager custa 0,8% — não é problema.

### 3.3 Geometria por modelo (builders reais)

| Modelo | Grupos = draws | Materiais | Transparente | Tris (h=3 / 10 / 18) |
|---|---|---|---|---|
| twisted | 2 | 2 | 0 | 196 |
| octagonal | 2 | 2 | 0 | 32 |
| setback | 2 | 2 | 0 | 44 |
| tapered | 2 | 2 | 0 | 228 |
| chrysler | 2 | 2 | 0 | 128 |
| hearst | 2 | 2 | 0 | 7 088 |
| empire | 8 | 8 | 0 | 28 456 |
| taipei | 2 | 2 | 0 | 17 976 |
| one-trade | 2 | 2 | 0 | 13 244 |
| **yachthouse** | **5** | 5 | 0 | 4 036 / 10 636 / 12 556 |
| **residential** | **6** | 6 | 1 | 1 872 / 4 644 / 7 944 |
| **apartment** | **6** | 6 | 1 | 2 312 / 8 840 / 15 912 |
| **gourmet** | **6** | 6 | 1 | 2 627 / 9 923 / 17 827 |
| **loft** | **6** | 6 | 0 | 1 376 / 4 448 / 8 032 |

Novos não são mais pesados em triângulo que Empire/Taipei/One Trade. São mais pesados em **draw call**: 5–6 por edifício.

### 3.4 Memória das geometrias por andar

Cada modelo novo guarda uma geometria inteira por número de andares (`geometryCache`).

| Modelo | Variantes (altura 1–16) | Buffers | Indexado | Vértices → soldados |
|---|---|---|---|---|
| yachthouse | 81 | 100,7 MB | não | 37 668 → 20 880 |
| residential | 47 | 21,8 MB | sim | 14 304 → 14 286 |
| apartment | 51 | 61,1 MB | não | 42 840 → 28 404 |
| gourmet | 51 | 68,7 MB | não | 48 009 → 25 755 |
| loft | 51 | 32,2 MB | não | 21 408 → 14 272 |
| **Total** | 281 | **284 MB** | | |

Com 10 mil alturas sorteadas, quase todas as variantes existem. 284 MB na RAM + cópia na GPU. `aProjPosition`/`aProjNormal` = clone literal de `position`/`normal` → 24 de 56 bytes por vértice (43%) são duplicata.

## 4. Causas, com evidência

### 4.1 Captura do cube segue a câmera

- `src/scene/config/reflectionConfig.ts:16` `followCamera: true`, `:29` `updateInterval: 4`, `:30` `continuous: true`. Comentário do arquivo: "alinhados ao probe da branch video-2" — padrão de gravação de vídeo, não de uso.
- `src/scene/runtime/createCitySceneRuntime.ts:718-775`: câmera andou → captura a cada 4 frames desenhados. 6 renders da cena + PMREM.
- `src/scene/managers/createDonationManager.ts:3104-3116` (`beginEnvCapture`): `compactVisibleInstances(true)` e `entry.mesh.visible = true` em todo custom shape. **Desfaz o cull de distância** durante a captura. Os ~5330 ocultos voltam.
- `src/scene/config/citySceneConfig.ts:25` `reflectionFar: 260` > `far: 190`. Captura enxerga mais longe que a tela.
- Resultado: captura = ~3,9× os draws da tela, 68–76 M de triângulos, 180–350 ms. Um a cada 4 frames.
- Contradição interna: comentário do runtime (`createCitySceneRuntime.ts:203-205` e `:299-305`) descreve probe **estático**, ancorado na cidade, recapturado só quando a cena muda — e explica por que isso dá reflexo melhor. O padrão do config desliga exatamente esse desenho.
- `beginEnvCapture`/`endEnvCapture` também percorrem todos os materiais (`getAllFacadeMaterials`, `getAllTopMaterials`, `getAuthoredEnvMaterials`) duas vezes por captura — dezenas de milhares de materiais.

### 4.2 Mesh e materiais por edifício

- `createDonationManager.ts:1643` (`needsCustomMesh`): formato ≠ `default` → sai do `InstancedMesh`.
- `createDonationManager.ts:2811-2826` (`syncCustomShapes`): por edifício, `facadeMaterial.clone()` + `topMaterial.clone()` + `applyTriplanarShader` ×2 + `new THREE.Mesh`.
- Os 5 builders novos criam mais 3–4 `MeshStandardMaterial` **por edifício** (ex.: `createResidentialBuildingMesh.ts:318-348`, `createSceneMaterial`). Vidro, guarda-corpo, caixilho e destaque são idênticos entre edifícios do mesmo modelo — não precisavam ser por edifício.
- Comentário em `createDonationManager.ts:1408-1409`: "Custom shapes (poucos)". Premissa do desenho: poucos edifícios de formato. Lote com 93% de formato quebra a premissa.
- `createBuildingShapeMesh.ts:171-193` (batching de grupos): só funde grupos que repetem material. Nos 5 novos cada slot tem material distinto → nada a fundir. `scripts/check-building-draw-calls.mjs` nem cobre os 5 novos.

### 4.3 Sem LOD no corpo do edifício

- Acessórios somem a 80 un. (`ACCESSORY_DETAIL_DISTANCE`, `createDonationManager.ts:135`). Corpo do edifício, com guarda-corpo, montante e caixilho de 4–12 cm em geometria real, fica até 190.
- Névoa `FogExp2` densidade 0,007: 39% a 100 un., 67% a 150, 83% a 190. Detalhe subpixel dentro da névoa: custo sem retorno visual, e serrilhado a mais para o MSAA.

### 4.4 Menores, medidos

- **Matriz recalculada todo frame.** Meshes de formato são estáticos mas ficam com `matrixAutoUpdate = true` (só o `InstancedMesh` desliga, `createDonationManager.ts:612`). `updateMatrixWorld` + `multiplyMatrices` ≈ 4,4%.
- **Hover durante o arrasto.** `mousemove` dispara `pickAt` + re-render do tooltip enquanto a câmera orbita ≈ 3%. Raycast em custom shape usa o raycaster comum do three (triângulo a triângulo), dimensionado para "poucos".
- **Guarda-corpo transparente** (residential, apartment, gourmet): `transparent: true`, `depthWrite: false`. Cada edifício entra também na lista transparente (ordenação back-to-front, blending sem early-z). Opacidade 0,32 em peça de 4 cm: invisível além de poucas dezenas de unidades.

## 5. Construção dos 5 modelos

Padrão comum (yachthouse, residential, apartment, gourmet, loft):

1. Laço por andar empilha `BoxGeometry`/`ExtrudeGeometry` em metros.
2. `mergeGeometries` por slot → 1 geometria com 5–6 grupos.
3. Cache por número de andares. `set*BuildingHeight` troca a geometria.

Certo: geometria compartilhada entre edifícios de mesma altura, pé-direito constante, um grupo por material.

Problemas:

- **Geometria do prédio inteiro por altura.** 281 variantes, 284 MB, build de 10–30 ms cada na primeira vez. Um andar-tipo é idêntico em todo andar de todo edifício — está sendo copiado milhares de vezes dentro de buffers diferentes.
- **5–6 materiais por edifício**, 3–4 deles novos a cada edifício.
- **4 de 5 sem índice** (`ExtrudeGeometry`). Soldar corta 33–46% dos vértices.
- **`aProjPosition`/`aProjNormal` duplicados.** Só o twisted precisa de valor diferente de `position`/`normal`.
- **Detalhe fino sem corte por distância.**

### 5.1 Jeito mais simples de fazer andares: kit modular instanciado

Recomendado para modelo com andar repetido.

- 3 módulos por modelo: **térreo**, **andar-tipo**, **cobertura**. Geometria pequena, fixa, construída uma vez. Sem cache por altura.
- 1 `InstancedMesh` por (modelo, módulo). Instância = (edifício, índice do andar). Matriz: posição do edifício + `y = térreo + f × pé-direito`, escala X/Z do lote.
- Draw calls: 5 modelos × 3 módulos × ≤6 slots ≈ **≤90, fixos**, com 100 ou 100 mil edifícios.
- Memória: KB em vez de 284 MB. Altura muda → muda contagem de instâncias, não geometria.
- Cull: mesma compactação que `compactVisibleInstances` já faz para o edifício padrão.

Pontos de atenção:

- Peças hoje contínuas na torre (núcleo, pano de vidro, montantes verticais em `towerY`) viram fatia por andar.
- Cor por edifício: `instanceColor` no slot da pedra — mesmo padrão do edifício padrão (topo já descarta `instanceColor`).
- Guarda-corpo transparente: `InstancedMesh` não ordena instâncias. Com `depthWrite: false` e vidro fino, aceitável; alternativa: opaco ou alpha hash.
- Foco/destaque: seguir o caminho do instanciado (`focusHighlightMesh`), não o de material por edifício.
- LED e letreiro usam `get*TierFootprints`/`get*RoofOffset` — são contas, não dependem da malha; continuam valendo.

Modelos antigos (sem andar): geometria já é única por modelo. Basta `InstancedMesh` por (modelo, grupo de textura) — generalização direta do caminho que o edifício padrão já usa.

### 5.2 Alternativas

- **Slots como atributo de vértice.** Cor/rugosidade/metal por vértice num material só. 6 draws → 2 (opaco + guarda-corpo) por edifício, sem instanciar. Exige ajuste no shader. Ganho parcial: E cairia de ~16,8 mil para ~5,6 mil draws (estimado).
- **`BatchedMesh` (three r183).** Várias geometrias num draw call, cull e ordenação por instância embutidos. Serviria para manter "geometria por altura". Um material por `BatchedMesh` → pede a fusão de slots acima. Compatibilidade com o shader triplanar (`onBeforeCompile`) precisa ser validada antes.
- **Fachada por textura** (como o edifício padrão): andar sai do tiling, zero geometria. `scripts/render-building.mjs` já renderiza 4 vistas — dá para assar um atlas e usar como LOD distante com a cara real do modelo.

## 6. Configurações padrão

| Config | Valor | Arquivo | Efeito | Avaliação |
|---|---|---|---|---|
| `followCamera` | `true` | `reflectionConfig.ts:16` | Cube recapturado a cada 4 frames em órbita | **Crítico.** Maior custo isolado |
| `continuous` | `true` | `reflectionConfig.ts:30` | Com `followCamera: false`, recaptura a cada intervalo em todo frame desenhado | **Crítico.** Desligar junto, senão trocar `followCamera` sozinho não resolve |
| `updateInterval` | `4` | `reflectionConfig.ts:29` | 1 captura a cada 4 frames | Alto. Só atenua se subir muito |
| `reflectionFar` | `260` | `citySceneConfig.ts:25` | Captura alcança além do `far` da tela (190) | Médio. Captura maior que a tela |
| `resolution` (cube) | `256` | `reflectionConfig.ts:10` | Tamanho das 6 faces | Baixo aqui: custo da captura é draw call, não pixel |
| `distance` (cull frontal) | `208,3` | `horizonConfig.ts:6` | Maior que `far: 190` → cull frontal nunca age antes do far | Médio. Reduzir para ~150 tira o anel 67–83% na névoa (~38% da área) |
| `far` / `renderDistance` | `190` | `citySceneConfig.ts:23` | Alcance da câmera | Coerente com a névoa só até ~150 |
| `sceneFogDensity` | `0,007` | `citySceneConfig.ts:31` | Névoa cobre 67% a 150 un. | OK. Esconde bem troca de LOD distante |
| `ACCESSORY_DETAIL_DISTANCE` | `80` | `createDonationManager.ts:135` | Acessório some a 80; corpo detalhado fica até 190 | Médio. LOD incoerente |
| `dprCap` | `2` | `citySceneConfig.ts:12` | Retina nativa, 4× pixels | Sem efeito no gargalo atual (DPR 1 = DPR 2 em fps) |
| `antialias` (MSAA) | ligado fora do modo leve | `createCitySceneRuntime.ts` | MSAA no canvas | Sem efeito medido agora. Vira relevante depois que CPU sair do caminho (19 M tris × MSAA) |
| `minRenderScale` / `maxRenderScale` | `1` / `1` | `citySceneConfig.ts:19` | Escala dinâmica desligada | Indiferente: gargalo é CPU, baixar resolução não ajudaria |
| `clearcoat` | `1.0` | `createDonationManager.ts:555,567` | 2º lobo especular + amostra extra do env por fragmento em toda fachada/topo | Baixo agora. Custo de fragmento, fora do gargalo |
| `randomPerBuilding` | `true` | `textureConfig.ts` | Textura sorteada por edifício | OK no instanciado (draws = nº de texturas). Em custom shape, mais um motivo de material próprio |
| `SLICE_MS` | `4` | `createCitySceneRuntime.ts:516` | Criação fatiada das malhas | OK. 10 mil malhas em ~13 s sem travar |

Comentário desatualizado: `horizonConfig.ts:7` diz "Igual à frontal por padrão" sobre `backDistance`, mas o valor é 46,2 contra 208,3. Sem impacto em desempenho.

## 7. Recomendações, por custo × ganho

Nada implementado. Ordem sugerida:

1. **Probe de reflexo estático por padrão** — `followCamera: false`, `continuous: false`. 2 linhas. **Medido: 9,6 → 21,5 fps** no cenário D, pausas de 180–350 ms somem. Troca visual: reflexo ancorado no centro da cidade em vez do ponto de vista — o próprio comentário do runtime defende esse modo como mais estável. Se o reflexo seguindo a câmera for requisito: capturar só quando a câmera parar (debounce já existe para `cubeDirty`).
2. **Captura respeitar o cull** — não reexibir custom shape distante em `beginEnvCapture`; `reflectionFar` ≤ alcance útil. Reduz o custo de cada captura que sobrar. Ganho não medido.
3. **LOD distante reaproveitando o instanciado** — além de ~60–80 un., edifício de formato vira caixa no `InstancedMesh` que já existe (cull e compactação prontos). Menor mudança estrutural. Estimativa: ~13% dos visíveis ficam como malha → ~10 mil draws caem para ~2 mil. Troca: silhueta de Empire/Taipei/One Trade muda na fronteira; raio maior para esses, ou a névoa cobre.
4. **Instanciar os formatos** — antigos: `InstancedMesh` por (modelo, textura). Novos: kit modular (5.1). Leva o custo ao patamar do cenário B (60 fps, ~100 draws, 1,5 ms de JS). Maior ganho, maior obra. Com 4 feito, 3 vira refinamento de triângulo.
5. **Higiene barata**, independente das anteriores:
   - `matrixAutoUpdate = false` nas malhas de formato (~4% do frame).
   - Não fazer hover pick durante arrasto (~3%).
   - Materiais autorais (vidro, caixilho, guarda-corpo, destaque) criados uma vez por modelo, não por edifício.
   - Remover `aProjPosition`/`aProjNormal` onde são cópia (−43% de buffer) e indexar/soldar (−33–46% de vértices).
   - `distance` padrão ≤ ~150.
   - Guarda-corpo e montantes fora além de ~80 un. (mesma régua dos acessórios).

Meta de validação para qualquer item: repetir o cenário D (`node scripts/measure-scene-performance.mjs 10000 all`) e comparar fps, draws de tela e draws por captura com a tabela 3.1.

## 8. O que não é a causa

- **Triângulos dos 5 novos.** Empire, Taipei e One Trade têm mais.
- **GPU / resolução / MSAA.** DPR 2 = DPR 1 em fps.
- **Cull de distância do manager.** 0,8% do frame. Os 5330 ocultos estão de fato fora do render principal — só voltam na captura do cube.
- **Compilação de shader.** Programas são poucos e compartilhados (`customProgramCacheKey`); custo é uniform por material, não programa.
- **Criação do lote.** Fatiada, ~13 s para 10 mil, sem tarefa longa.
- **Hardware.** M4 segura o cenário instanciado a 60 fps com folga (1,5 ms de JS).

## Relacionados

- [[scene-managers]] — `createDonationManager`, custom shapes, captura do env.
- [[scene-runtime]] — loop, probe de reflexo, cull.
- [[scene-config]] — `reflectionConfig`, `horizonConfig`, `citySceneConfig`.
- [[scene-builders]] — builders dos modelos.
- [[novo-edificio]] — fluxo de criação de modelo.
