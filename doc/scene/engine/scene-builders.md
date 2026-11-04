---
title: Scene Builders
tags:
  - cidoe
  - builders
  - threejs
  - factory
aliases:
  - Builders
  - Construtores de Cena
---

# Scene Builders

Factory functions que criam partes isoladas da cena 3D em `src/scene/builders/`.

## Objetivo da Pasta

Builders criam peças específicas da cena. O [[scene-runtime|runtime]] não precisa saber todos os detalhes de criação — cada builder monta, atualiza e destrói sua peça.

**Padrão de retorno:** cada builder retorna um objeto com métodos `update`, `dispose` e métodos específicos como `setPosition`.

> [!important] Dispose obrigatório
> Todo builder deve expor `dispose()` e limpar geometria, material e recursos Three.js para evitar memory leaks.

## Arquivos

### `createGroundPlane.ts`

Chão local PBR, sempre em `y=-0.05`, abaixo do relevo (`-0.04`). Um mesh/material; duas geometrias reutilizadas: `PlaneGeometry(1, 1)` e `CircleGeometry(0.5, 256)`. Sem camada cinza adicional.

- `update`: cor/acabamento via [[scene-utils#materials.ts|getGroundMaterialValues]].
- `updateHorizon`: guarda `groundEdgeMode` e `groundDistance` de [[scene-types#HorizonSettings]].
- `updateCamera`: escolhe geometria, escala e posição por frame; acompanha câmera e resize/zoom.
- `dispose`: remove mesh, libera ambas as geometrias e material.

| Modo | Borda e distância |
|---|---|
| `straight` (padrão) | Retângulo orientado pelo azimute da câmera. Única borda exposta perpendicular à direção horizontal, a `groundDistance` à frente; linha horizontal na órbita sem roll. |
| `circular` | Disco centrado na câmera, raio `groundDistance`; sem quinas, silhueta curva. |
| `square` | Quadrado original centrado na câmera, meio lado `groundDistance`; quinas possíveis. |

> [!important] Correção do frustum
> `camera.far` mede profundidade, não raio. `groundDistance > far` sozinho **não** garante borda invisível num quadrado: cantos da imagem alcançam mais longe. Modo reto usa `camera.getViewSize(far)` e `radius = hypot(far, largura/2, altura/2) * 1.01`. Laterais ficam a `±radius`; traseira a `-radius`; frente a `groundDistance`. Assim laterais/quinas ficam fora do frustum, inclusive em ultrawide. Direção vertical usa azimute de fallback `-Z`.

Borda frontal e corte do far plane projetam retas na órbita. Modo reto continua funcionando com distância curta; névoa opcional suaviza transição. Montanhas têm malha/cull próprios; formato do chão não altera sua silhueta. Relevo pode cobrir o corte do chão.

> [!warning] Precisão
> Coordenadas locais e extensão calculada pelo frustum; sem plano de um milhão de unidades. `scripts/check-horizon.mjs` verifica raios na imagem, projeção da borda, modos, descarte e precisão Float32. Sem servidor/navegador/GPU; não substitui avaliação visual.

**Pesquisa das variantes:**
- [PerspectiveCamera.getViewSize](https://threejs.org/docs/pages/PerspectiveCamera.html): dimensões visíveis na profundidade escolhida; base do cálculo de cobertura.
- [CircleGeometry](https://threejs.org/docs/pages/CircleGeometry.html): disco por segmentos; remove quinas, mantém curva.
- [Fog no Three.js](https://threejs.org/manual/en/fog.html): suaviza objetos distantes. Fusão uniforme requer cor compatível com fundo; HDRI variável não garante sumiço completo da borda. Reaproveitar controles existentes de névoa.

---

### `createTerrain.ts`

Cria o relevo procedural (colinas verdes) ao redor da cidade — partes sem edifício. Port completo do protótipo `terrain.md`. Fixo na origem, **não** segue a câmera. Cobre o [[scene-builders#createGroundPlane.ts|plano cinza]] (chão infinito) enquanto existe; além da sua borda, o plano preenche o vazio.

**Responsabilidades:**
- Gerar heightfield via pipeline completa do `terrain.md`: `mulberry32` (semente das falhas), `valueNoise`/`fbm` com `persistence`/`lacunarity` como **params** (não mais constantes), **ridge noise**, **falhas tectônicas** (linhas via degrau `tanh`), **edge falloff** (`smoothstep` rebaixa borda externa por `edge`), **terraços** e `smoothHeightField` (N passes = `smooth`)
- Resolução (`segments`) e largura (`size`) **dinâmicas**: trocar `segments` realoca buffers de posição/cor + índice da malha; `update()` regenera o heightfield com os settings atuais
- **Acima do plano cinza, sem cruzar:** zona plana ao nível `TERRAIN_GROUND_Y` (−0.04), ABAIXO das ruas (−0.015) e ACIMA do plano cinza (−0.05, chão infinito). O relevo nunca cruza o plano → **sem z-fighting**, e as ruas continuam visíveis
- **Encaixe suave na cidade (degradê):** a **amplitude** das colinas (`amp`) sobe de 0 (borda da cidade) a 1 (longe) — as colinas nascem do plano, não batem numa parede. `band = max(TERRAIN_TRANSITION, height*3)` (degradê mais longo pra relevo mais alto), `ramp = smootherstep(dw, inner, inner+band)` (quintic, derivada zero nas pontas), `amp = ramp²` (toe extra-suave). Altura final = `TERRAIN_GROUND_Y + relevo*amp`
- **Contorno irregular (sem anel circular):** `dw` é a distância radial **perturbada** por ruído de mundo por vértice (`edgeWarp` ∈ [-1,1], fbm 4 octaves, lobo ~110u). Assimétrico: recua bastante pra fora (`outwardCap = band*0.5`, baías) e cutuca pouco pra dentro (`inwardCap = padding*0.6`, limite pra não invadir a cidade). Sem isso o contorno cidade→relevo é um círculo perfeito (padrão artificial)
- **Cor por vértice:** base = cinza do chão da cidade (`baseColor`, sincronizada com [[scene-types#GroundSettings]] via `setGroundColor`) **perto** → `lowColor` (planícies verdes) **longe**, fade pela mesma distância ondulada `dw`; sobe pro `highColor` conforme o relevo cresce (`hv = relevo/range`)
- `wireframe` alterna `material.wireframe`
- `BufferGeometry` indexada com `vertexColors`; recomputa normais/bounding só quando posições mudam (recolor puro pula normais)

**Retorna:** `TerrainRig` com `mesh`, `update`, `setCityRadius`, `setGroundColor`, `dispose`.

> [!important] Relevo fixo, sem recorte pela câmera
> Sem shader de culling por distância: posição e malha só mudam por configuração do terreno ou tamanho da cidade. Runtime ajusta o `camera.far` para conter o bounding sphere completo do relevo visível (`distância ao centro + raio + 1`), respeitando `renderDistance` como mínimo. Corte antigo a 190u atravessava a malha de 700u e fazia colinas parecerem encolher durante órbita/pan. Sem relevo visível, far volta ao horizonte configurado. Probe continua com alcance próprio.

> [!important] Chão infinito abaixo do relevo = sem z-fighting
> Plano cinza **sempre visível** (`groundPlane.mesh.visible` nunca é forçado a `false` no render), em `y=−0.05`, ABAIXO do piso do relevo (`−0.04`). Onde há relevo, o terreno (opaco) cobre o plano; além da borda do relevo (mesh fixo, 700u na origem), o plano — que **segue a câmera** — preenche o vazio → cidade grande **não tem limite** ao mover a câmera. Fica sempre abaixo → **sem z-fighting** (antes ele ficava ACIMA do terreno e as duas superfícies cinza piscavam). Na captura do envMap relevo **e** plano cinza entram por padrão, logo aparecem no reflexo dos prédios; `includeGround` permite excluí-los (ver [[scene-runtime#Probe de reflexo (envMap dos prédios)]]).

> [!important] `update()` é debounced (60ms)
> Arrastar um slider dispara muitos `update()` por segundo. Regenerar o heightfield (até 256² vértices) a cada tick travaria a UI — por isso `update()` é **debounced em 60ms**.

**Constantes** (em [[scene-config#terrainConfig.ts|terrainConfig.ts]]): `TERRAIN_SEGMENT_OPTIONS` (`[64,96,128,192,256]`, opções do select de resolução), `TERRAIN_CITY_PADDING`, `TERRAIN_TRANSITION` (largura MÍNIMA do degradê, cresce com a altura), `TERRAIN_GROUND_Y` (−0.04, nível plano do relevo, logo acima do chão infinito). `size`/`segments` são campos de [[scene-types#TerrainSettings]].

> [!important] Participa do reflexo por padrão
> O [[scene-runtime|runtime]] mantém `terrainRig.mesh` e o plano cinza visíveis durante a captura do cube envMap. Assim, chão e relevo aparecem nas fachadas refletivas. Desmarcar `includeGround` oculta os dois só durante a captura; `includeCityFloor` controla asfalto, calçada e lotes separadamente.

> [!note] Colinas recuam quando a cidade cresce
> O runtime chama `setCityRadius(donationManager.getCityRadius())` a cada doação/mudança de quadra. Raio maior → zona plana maior → anel de colinas recua. `setCityRadius` só recalcula a malha quando o raio muda de fato (ganho de anel).

**Quando mexer aqui:**
- Ajustar a pipeline do ruído (fbm/ridge/falhas/terraços/suavização)
- Mudar como `segments`/`size` realocam a malha ou a largura da rampa de transição
- Trocar o esquema de cores (hoje base do chão → gradiente verde de 2 paradas)
- Ajustar o debounce de `update()`

---

### `createLightingRig.ts`

Cria e atualiza a luz da cena.

**Responsabilidades:**
- Criar `AmbientLight` (cor + intensidade via [[scene-utils#lighting.ts|getLightMetrics]])
- Atualizar cor e intensidade no `update(lightSettings)`
- Remover a luz no `dispose`

**Retorna:** objeto `LightingRig` com `ambient`, `update` e `dispose`.

> [!note] Só ambient + IBL
> Iluminação da cena = `AmbientLight` + `scene.environment` (PMREM do HDRI). **Não há DirectionalLight nem sombras** — campos `directional*`/`hemisphere*` de [[scene-types#LightSettings]] alimentam apenas as métricas exibidas no painel (`getLightMetrics`).

**Quando mexer aqui:**
- Adicionar novo tipo de luz (pré-requisito pra reintroduzir sombras)
- Alterar como a intensidade ambiente é calculada

---

### `loadEnvironment.ts`

Carrega e configura o ambiente HDRI/skybox. Callbacks: `onLoaded(envMap, bg)` no sucesso, `onFailed()` se o HDRI falhar (runtime marca o céu como resolvido → página de loading não trava).

**Responsabilidades:**
- Carregar HDRI em **dois arquivos WebP por tier**, gerados de `src/assets/environment/DaySkyHDRI040B_4K_TONEMAPPED.jpg` por `npm run textures:webp` (ver [[scene-textures#Pipeline WebP]]). JPG fonte fica no repo, fora do dist:
  - céu visível: `….webp` 4K (118 KB) no desktop, `….low.webp` 2K (40 KB) no `IS_LOW_TIER`
  - fonte do PMREM: `….pmrem.webp` 1024×512 (14 KB), os dois tiers
- Decode via `loadImageTexture` (ImageBitmap fora da main thread, fallback `TextureLoader`) — ver [[scene-textures]]
- Cachear imagens no Cache API do browser via `resolveEnvUrl` → 2ª visita lê do cache local, sem rede
- Criar esfera invertida como background (permite offset UV uniforme em todas as direções)
- Gerar `PMREMGenerator` para `scene.environment` (iluminação PBR dos prédios) a partir da fonte 1K; `compileEquirectangularShader()` roda na criação, em paralelo ao download. Fonte 1K é descartada logo após o PMREM
- Modo noite: tingir o céu (`material.color = NIGHT_PRESET.skyTint`) e mostrar o campo de estrelas
- Expor `updateSettings` para rotacionar/deslocar o skybox
- Expor `updatePosition` para seguir a câmera
- Expor `setStarsVisible` para tirar as estrelas da captura do cube de reflexo
- Limpar meshes, geometria, material e o `PMREMGenerator` pendente no `dispose`

**Retorna:** objeto `EnvironmentUpdater` com métodos `updateSettings`, `updatePosition`, `setStarsVisible` e `dispose`.

> [!note] Técnica da esfera invertida
> Usar `THREE.BackSide` em uma `SphereGeometry` grande permite deslocar o horizonte via `texture.offset.y` de forma uniforme em todas as direções — ao contrário de `scene.background` com equirectangular direta.

> [!note] Por que PMREM com fonte separada de 1K
> `PMREMGenerator` faz cubo de `largura/4`: HDRI 4K gerava alvo de ~96 MiB (pico ~192 MiB) e tarefa de ~87 ms, pra um IBL que a doc do three pede de 256/face (entrada 1024×512). Céu visível continua em resolução de tela. Teste A/B desktop: céu 4K WebP ≈ JPG; 2K visivelmente mais borrado na nuvem → desktop fica 4K. Celular (DPR alto, tela pequena) vai de 2K: ¼ da VRAM e do upload, nuvem um pouco mais suave só em pixel físico.

> [!tip] Cache persistente
> `resolveEnvUrl` abre cache `cidoe-env-v2`, grava blob na 1ª visita, devolve object URL nas seguintes (revogado após decode). Apaga os caches legados `cidoa-env-v1` e `cidoa-env-v2`; o cache com a marca atual é preenchido na próxima leitura, sem afetar cidades salvas. Fallback: URL original se Cache API ausente ou fetch falhar. Imagem fica em `src/assets` (não `public/`) — Vite content-hasheia o nome, ideal pra cache-bust HTTP. **Bump versão do cache se trocar a imagem.**

> [!note] Sem `texture.needsUpdate` no updateSettings
> `offset`/rotação são uniforms — `needsUpdate = true` re-enviava a textura 4K inteira à GPU a cada movimento de slider. Removido.

> [!tip] Noite sem segundo HDRI
> `settings.night` só troca `skyMaterial.color`: branco = HDRI intacto, `NIGHT_PRESET.skyTint` = mesmo mapa multiplicado por azul-noite (nuvem e estrutura continuam lá). Zero download extra. Resto da cena (luz, IBL, névoa) em [[scene-runtime#Modo noite]].

> [!note] Estrelas (`createStars`)
> `THREE.Points` com `NIGHT_PRESET.starCount` pontos no **hemisfério de cima**, raio 180 (dentro da esfera do céu, raio 200 → não é cortado pelo far plane antes dela). Posições vêm de `seeded` → mesmo céu toda sessão. Filho do `skyMesh`: herda rotação e o reposicionamento por frame de graça. `sizeAttenuation: false` = tamanho fixo em pixels, estrela não incha ao dar zoom. `visible` segue `night`; geometria e material morrem no `dispose`.
>
> Mesmo `sizeAttenuation: false` é o motivo de `setStarsVisible(false)` na captura do cube: tamanho fixo em px de uma face de 256px vira mancha na fachada refletida. Estrelas só aparecem no render principal — ver [[scene-runtime#Probe de reflexo (envMap dos prédios)]].

**Quando mexer aqui:**
- Trocar o arquivo HDRI (bump `ENV_CACHE_NAME` pra invalidar cache antigo)
- Alterar como o skybox responde ao offset de ambiente
- Mudar a geração do `scene.environment`
- Mexer nas estrelas (quantidade, tamanho, distribuição) → `NIGHT_PRESET` + `createStars`

---

### `createHologramMesh.ts`

Holograma cyberpunk acima do prédio: 1 plano + `ShaderMaterial` (uTime, aberração cromática, glitch). Suporta imagem estática e GIF animado (`ImageDecoder` → frames em canvas).

> [!note] Cap de resolução de GIF
> Canvas e bitmaps dos quadros limitados a **512px** no maior lado. Cada VideoFrame é reduzido com o mesmo canvas 2D usado na exibição e fechado imediatamente; não se retêm os originais grandes. `tickHologram` avança pelo tempo real, salta ciclos completos e desenha só o quadro final quando muda. Distância/frustum controlam os ticks; o retorno à visão recupera a fase. `LinearFilter` usa `generateMipmaps = false` nas texturas de hologramas, estáticas ou GIF. Descarte, erro e carga obsoleta fecham os recursos.

### `createParapetMesh.ts`

Acabamento automático das coberturas planas. `createParapetGeometry(shape, variant)` cria anéis vazados com parede interna/externa, friso e capeamento. Laje original permanece aparente no centro; acessórios continuam ancorados nela.

| Modelo | Acabamento |
|---|---|
| 0 | Platibanda simples, capeamento claro discreto |
| 1 | Parede mais alta, friso recuado escuro sob capeamento |
| 2 | Base saliente e cornija escalonada |

- Contornos: `default`, `twisted` (planta final quadrada a 90°), `octagonal`, `setback` (último patamar), `tapered` e `hearst`. Reutiliza medidas dos builders; formatos com coroamento próprio retornam `null`.
- Altura via `getParapetHeightScale`: menor dimensão horizontal, limitada por 90% da altura do corpo; geometria aplica perfil de 8–11,5% dessa escala. Torres altas não esticam acabamento; prédios baixos mantêm proporção.
- Mesmos mapas de cor, normal e bump da laje (`Concrete024_1K-JPG`), compartilhados sem download/cópia adicional. Projeção em coordenadas de mundo via `aProjPosition`/`aProjNormal`, com tiling do topo. `updateTexture(topMaterial)` sincroniza carregamento assíncrono e ativação/desativação dos mapas, inclusive no material de foco.
- `createParapetMaterial`: cor da laje multiplicada por `0.8` (20% mais escura em RGB linear); cores de vértice preservam contraste entre frisos/capeamento. Acabamento fosco: roughness `1`, metalness/clearcoat/specularIntensity/envMapIntensity `0`. Controles de reflexo da laje não reativam brilho. Sem displacement nas bordas finas.
- `createBuildingParapets(scene)`: agrupa por formato/modelo; **um `InstancedMesh` por combinação**, três draw calls para cidade de prédios padrão. Modelo sorteado pelo ID (`pickIndex`, salt `83`), estável ao reordenar doações.
- `rebuild`: recalcula posição/escala sobre laje, reaproveita geometria e libera buffers dos batches anteriores. `updateVisibility`: compacta apenas quando visibilidade muda.
- `setFocus`: acabamento do selecionado ganha mesh temporário opaco; outros acompanham opacidade `0.15`. Sem duplicar instância do selecionado.
- `setVerticalOffset(id, offset)`: acompanha levitação/queda da [[scene-managers#Entrada animada da video-1|gravação]]. Índice visível atualizado após culling/foco; muda só matriz da platibanda alvo, sem reconstruir batches. Offset zero restaura cobertura.
- `dispose`: remove meshes, libera buffers, geometrias e materiais. Recursos pertencem à instância, sem cache global entre cenas.
- [[scene-builders#createPreviewScene.ts|Preview do admin]] usa modelo simples nos formatos compatíveis, mesmo material fosco com cor 20% abaixo da laje de preview, e descarta geometria/material próprios.

`createBuildingParapets(scene, compositeFocus)` mantém máscaras 1/2 e materiais originais na composição; no fallback aplica a opacidade e só invalida quando muda transparência.

**Checagem:** `node scripts/check-building-shapes.mjs` cobre três modelos × seis contornos, centro vazado, escala, estabilidade por ID, batches, culling, foco e descarte. Sem servidor/navegador/WebGL.

### `createRooftopMesh.ts`

Factory para acessórios de topo dos edifícios. Chamado pelo [[scene-managers|DonationManager]] quando o usuário personaliza um edifício via [[html-components#BuildingManageDialog.tsx|BuildingManageDialog]].

**Opção disponível:**

| Tipo | Geometria | Materiais | Descrição |
|---|---|---|---|
| `spotlights` | `CylinderGeometry` × 3 + `CircleGeometry` × 1 compartilhadas pelo módulo | `SPOTLIGHT_HOUSING_MATERIAL` + `SPOTLIGHT_LENS_MATERIAL` + `SPOTLIGHT_BEAM_MATERIAL` compartilhados | 4 holofotes nos cantos (±0.35, ±0.35) — base (0.08r) + corpo cônico (0.04–0.07r, 0.12h) + lente emissiva amarela + feixe cônico (0.22r, 10.0h) com vertex alpha gradiente (opaco na fonte, desvanece no topo via curva quadrática). Não cria luzes reais por edifício. |
| `helipad` | `CylinderGeometry`, `TorusGeometry`, `RingGeometry`, `BoxGeometry` e pequenos cilindros compartilhados | Materiais de concreto escuro, aro metálico, pintura branca e lentes verdes emissivas | Heliponto proporcional ao topo do edifício, com base circular baixa, aro metálico, anel externo pintado, “H” central limpo, 12 luzes verdes de perímetro e escotilha técnica discreta. Não cria luzes reais por edifício. |
| `garden` | `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `PlaneGeometry` e instancing para vegetação | Materiais compartilhados de deck, solo, vegetação, água, madeira e luzes quentes | Jardim suspenso proporcional ao topo com deck, canteiros, piscina, banco, pérgola, arbustos, pequenas árvores e guarda-corpo. |
| `helicopter` | Casco custom único com grupos de material, `ExtrudeGeometry` para deriva, `SphereGeometry`, `BoxGeometry` e cilindros compartilhados | Pintura escura, barriga clara, vidro escuro reflexivo opaco, rotores, esquis e farol emissivo | Helicóptero leve pousado, com nariz afunilado e oito vidros integrados à malha (seis laterais e para-brisa dividido). Molduras fazem parte do casco, sem fuselagem duplicada nem painéis sobrepostos. Carenagem de motor ligada ao mastro, rotor principal de três pás radiais a 120°, cauda cônica, deriva inclinada, estabilizador horizontal, rotor traseiro de duas pás opostas e esquis com pontas elevadas. Sem discos de movimento em rotores parados. Escala uniforme de todo o conjunto calculada pelo footprint. |

**Recursos compartilhados (estáticos de módulo):**

| Material | Cor | Roughness | Metalness | Extra |
|---|---|---|---|---|
| `SPOTLIGHT_HOUSING_MATERIAL` | `#222222` | 0.4 | 0.6 | Corpo escuro do holofote |
| `SPOTLIGHT_LENS_MATERIAL` | `#ffffcc` | 0.1 | 0.0 | `emissive: #ffffaa`, `emissiveIntensity: 2.5` — lente amarela brilhante |
| `SPOTLIGHT_BEAM_MATERIAL` | `#ffffdd` | — | — | `emissive: #ffffaa`, `emissiveIntensity: 1.25`, `vertexColors: true`, `transparent`, `DoubleSide`, `depthWrite: false` — feixe com alpha gradiente via vertex colors (curva quadrática: fonte opaca → topo transparente) |
| `HELIPAD_DECK_MATERIAL` | `#2f3436` | 0.88 | 0.04 | Base circular escura e fosca |
| `HELIPAD_RIM_MATERIAL` | `#3f4548` | 0.62 | 0.42 | Aro metálico baixo |
| `HELIPAD_PAINT_MATERIAL` | `#e8edf1` | 0.78 | 0.0 | Pintura branca dos anéis e do “H” |
| `HELIPAD_GREEN_LENS_MATERIAL` | `#bfffee` | 0.18 | 0.0 | Lentes verdes emissivas de perímetro |
| `HELICOPTER_BODY_MATERIAL` | `#1f272c` | 0.44 | 0.46 | Fuselagem escura com acabamento metálico discreto |
| `HELICOPTER_WINDOW_MATERIAL` | `#294c60` | 0.12 | 0.3 | Faces de vidro no próprio casco, opacas e reflexivas (`envMapIntensity: 1.2`), sem sorting de transparência ou `polygonOffset` |
| `HELICOPTER_TRIM_MATERIAL` | `#c7d0d3` | 0.36 | 0.42 | Barriga integrada ao casco e estabilizador claro |
| `HELICOPTER_ROTOR_MATERIAL` | `#111416` | 0.38 | 0.72 | Pás e rotor traseiro escuros e metálicos |
| `HELICOPTER_SKID_MATERIAL` | `#4e565b` | 0.42 | 0.74 | Esquis, mastros e hub |

Validação do helicóptero: `node scripts/check-helicopter.mjs` verifica triângulos, visibilidade dos vidros por raycast, quantidade de pás, folgas dos rotores, encaixe do mastro e altura sobre a cobertura em três tamanhos, sem servidor ou navegador.

As geometrias de base, corpo, lente e feixe também são compartilhadas. `disposeRooftopMesh()` apenas libera as referências do grupo; o descarte de GPU dos recursos compartilhados acontece no dispose final.

**API:**
```typescript
createRooftopMesh(type: RooftopType, footprint?: { width: number; depth: number }): THREE.Group | null  // null se "none"
mergeRooftopParts(group: THREE.Group): void                // funde peças opacas por material (só na cidade)
disposeRooftopMesh(group: THREE.Group): void               // limpa referências do grupo + buffers de instância + geometrias fundidas
disposeRooftopSharedResources(): void                       // limpa geometrias e materiais compartilhados
```

> [!note] Otimizações de custo
> **Fusão por material** (`mergeRooftopParts`, chamado no `setRooftop` do manager): peças soltas opacas do mesmo material, atributos e índice viram uma malha com a matriz relativa ao grupo assada — transformação do próprio grupo (escala/giro do helicóptero) fica no grupo. Malhas: jardim 37 → 16, helicóptero 23 → 7, holofotes 16 → 6, heliponto 9 → 6. Fora: `InstancedMesh`, multi-material e transparente (fundido perderia a ordenação entre peças). Preview e `check-helicopter.mjs` usam o grupo sem fusão (buscam peça por nome). `check-helicopter.mjs` confere caixa precisa e triângulos iguais após a fusão.
> Helipad: deck/aro/anel com **32 segmentos** (era 96 — invisível nesse raio) e as 12 luzes de perímetro são **2 `InstancedMesh`** (base + lente), não 24 meshes. Água do jardim, casco e janelas do helicóptero usam `MeshStandardMaterial` — `MeshPhysicalMaterial` com `transmission > 0` disparava um render extra da cena inteira (transmission pass).

---

### `createSignMesh.ts`

Factory para letreiros de fachada nos edifícios. Renderiza texto via `CanvasTexture` em um plano fino com material emissivo (estilo LED corporativo). Chamado pelo [[scene-managers|DonationManager]] quando o usuário digita um texto no [[html-components#BuildingManageDialog.tsx|BuildingManageDialog]].

**Características visuais:**

| Elemento | Descrição |
|---|---|
| **Fundo** | Painel escuro `rgba(8,10,16,0.88)` com cantos arredondados (8px) e borda fina `rgba(255,255,255,0.08)` |
| **Texto** | Fonte `600` (semi-bold), família Inter/Segoe UI/Helvetica, cor `#e8ecf4` |
| **Glow LED** | `shadowBlur: 12`, cor `rgba(200,220,255,0.6)` — simula sinalização LED retroiluminada |
| **Material da placa** | `MeshStandardMaterial` com `emissiveIntensity: 0.4`, `roughness: 0.35`, `metalness: 0.6` |
| **Backing plate** | `BoxGeometry` metálico escuro `#1a1c22` (`roughness: 0.7`, `metalness: 0.5`) |
| **Separação do texto** | O plano da `CanvasTexture` fica `0.002` à frente do backing para evitar z-fighting e cintilação ao mover a câmera |
| **Posição Y** | `buildingH * 0.45` acima do centro = ~95% da altura do edifício (bem perto do topo) |

**Lados (parâmetro `sides` 1–4):**

| Valor | Fachadas | Rotação da normal do plano |
|---|---|---|
| 1 | Frente (+Z) | `rotY = 0` |
| 2 | +Trás (−Z) | `rotY = π` |
| 3 | +Direita (+X) | `rotY = +π/2` |
| 4 | +Esquerda (−X) | `rotY = −π/2` |

Painéis (canvas + textura + materiais + geometrias) são **cacheados por largura da face**: faces opostas têm placa idêntica e compartilham a mesma `CanvasTexture` — antes eram até 4 rasterizações/texturas duplicadas por letreiro. A largura do letreiro se adapta à largura da fachada correspondente (`buildingW` para frente/trás, `buildingD` para laterais). A altura é consistente em todos os lados: `max(buildingW, buildingD) * 0.22`.

> [!note] Ajuste automático de fonte
> O fontSize começa em 52% da altura do canvas; se o texto não cabe com 12% de padding lateral, um ajuste proporcional (`fontSize × larguraMáx / larguraMedida`, piso 10) — largura do texto é linear no tamanho. Antes descia de 1 em 1 px (parse de fonte + `measureText` por passo). Limite máximo: 30 caracteres (imposto pelo UI).

**API:**
```typescript
createSignMesh(text: string, buildingW: number, buildingD: number, buildingH: number, sides: number, shape?: BuildingShape): THREE.Group | null
disposeSignMesh(group: THREE.Group): void  // limpa texturas, materiais e geometrias (painéis únicos + struts)
```

> [!note] Acompanhamento de torção (`shape: "twisted"`)
> Na altura do letreiro (~95% do prédio) a fachada já rodou ~85,5° em relação à base — uma placa axis-aligned ficaria parcialmente dentro do edifício, daí o "letreiro cortado". Para `shape === "twisted"`, o builder calcula `angle = (yOffset / buildingH + 0.5) · TWIST_TOTAL_ANGLE` e:
> - rotaciona o ponto de attach em **unit-space** (`x' = x·cos − z·sin`, `z' = x·sin + z·cos`) antes de aplicar o `mesh.scale` — necessário porque a geometria torcida também é deformada antes do scale e width ≠ depth troca os eixos se invertido;
> - calcula a **normal verdadeira em world-space** via inversa transposta da escala não-uniforme: `(n_unit.x/W, n_unit.z/D)` re-normalizada. Usar o vetor de posição como direção (que parece a normal mas não é, sob escala não-uniforme) deixa o plano levemente desalinhado e uma das pontas do letreiro entra na fachada;
> - aplica `mesh.rotation.y = atan2(wnx, wnz)` para alinhar o plano à tangente da face na altura do letreiro;
> - empurra a placa por **0,10** (vs 0,02 no caminho default) ao longo da normal world — margem maior porque a fachada é curva e a placa é flat: ao longo de `signH` a fachada gira mais alguns graus e os cantos superior/inferior do plano ainda poderiam cortar a face com offset menor;
> - recalcula `signW` para a largura world real da face torcida — `sqrt((W·cos)² + (D·sin)²)` para frente/trás, `sqrt((W·sin)² + (D·cos)²)` para laterais — evitando que o letreiro extrapole os cantos da face quando a torção mistura os eixos.

> [!note] Reconstrução em rebuildInstances
> O `DonationManager` guarda `{group, text, sides}` por edifício e o `syncSigns` chama `setSign` em snapshot — assim, mudanças de altura (rebalanceamento de doações) ou shape (default ↔ twisted) regeneram os letreiros com os parâmetros atuais. Sem isso o letreiro ficaria com `yOffset`/`signH`/orientação obsoletos.

---

### `createEdgeLightMesh.ts`

Factory para o efeito de **LED nas arestas** do edifício — 4 arestas verticais nos cantos (chão → topo) + 4 arestas no topo formando um retângulo. Chamado pelo [[scene-managers|DonationManager]] quando o usuário escolhe a opção LED no [[html-components#BuildingManageDialog.tsx|BuildingManageDialog]].

**Estrutura (3 `InstancedMesh` por grupo):**

Os segmentos de aresta são coletados como `SegmentSpec` (posição + quaternion + comprimento) e desenhados por **3 `InstancedMesh`** — core, halo e haloOuter — com uma instância por segmento. Resultado: **3 draw calls por LED**, independente do número de segmentos (torre twisted: antes 156 meshes, agora 3 draws).

| Camada | Material | Função visual |
|---|---|---|
| **Core** | `MeshStandardMaterial` com `emissive` | Linha sólida emissiva — o "filamento" do LED |
| **Halo** | `MeshBasicMaterial`, `transparent`, `AdditiveBlending`, `vertexColors` (alpha gradiente), `depthWrite: false` | Brilho próximo |
| **Halo externo** | mesmo material, opacidade menor, escala 3.4× | Glow difuso simulando bloom sem pós-processamento |

Uma única geometria de halo (gradiente nas seções locais X/Z, eixo dominante Y) serve pra qualquer direção de aresta — a orientação vem do quaternion da instância. `depthWrite: false` evita que halos se cancelem entre si; `depthTest` permanece ativo para que o brilho seja oclusionado pelo edifício (não atravessa a fachada).

**Layout (relativo à base do edifício, local Y=0 = chão):**

| Posição | Quantidade | Eixo |
|---|---|---|
| Cantos `(±W/2, Y=0..H, ±D/2)` | 4 | Y (vertical) |
| Topo frente/trás `(0, H+0.05, ±D/2)` | 2 | X |
| Topo laterais `(±W/2, H+0.05, 0)` | 2 | Z |

O lift de `0.05` no topo evita z-fighting com `helipad` e holofotes existentes.

**Materiais clonados por edifício:** cada `Group` cria seus próprios `core`/`halo`/`haloOuter` materials (guardados em `userData.edgeLightMaterials`). Geometrias (`BoxGeometry` do core + halo com gradiente) são compartilhadas no módulo.

**Posicionamento no DonationManager:** o grupo é colocado em `(donationX, donationY − scale.y/2, donationZ)` — ou seja, na **base** do edifício, não no topo. Quando uma nova doação rebalanceia alturas, o `syncEdgeLights` reconstrói os grupos existentes (preservando type) com as novas dimensões.

> [!warning] Sem PointLight por aresta
> Fita = só material emissivo. Luz real por aresta seria O(N × 12), estoura uniform da GPU. Luz que atinge vizinho vem de **pool fixo** de `PointLight` no manager — 1 por edifício, não 1 por aresta. Ver [[scene-managers#LED de Arestas]].

**Constantes de derrame de luz** (consumidas pelo [[scene-managers|DonationManager]]):

| Constante | Default | O que controla |
|---|---|---|
| `EDGE_LIGHT_SPILL_INTENSITY` | `70` | Intensidade da `PointLight` (candela, `decay: 2`) |
| `EDGE_LIGHT_SPILL_RANGE` | `26` | Alcance da luz em unidades de cena |
| `EDGE_LIGHT_SPILL_POOL_SIZE` | `8` | Quantas luzes existem — LEDs além disso não acendem vizinho |

**API:**
```typescript
createEdgeLightMesh(type: EdgeLightType, footprint: { width: number; depth: number; height: number }, shape?: BuildingShape): THREE.Group | null
disposeEdgeLightMesh(group: THREE.Group): void                      // libera materiais clonados + buffers de instância
disposeEdgeLightSharedResources(): void                             // libera geometrias compartilhadas
```

> [!tip] Checagem headless
> `node scripts/check-building-shapes.mjs` valida que **todo** formato devolve grupo com 3 `InstancedMesh` e ≥1 segmento — regressão do bug em que `buildInstancedGroup` chamava a si mesma no `return` e estourava a pilha em todo LED. Checa também as **âncoras de shader** que o [[scene-managers|DonationManager]] usa pra tirar o especular direto: se o three renomear a linha do GGX, o patch viraria no-op silencioso e a luz do LED voltaria a virar ponto brilhante na fachada.

> [!note] Acompanhamento de torção (`shape: "twisted"`)
> Quando o edifício é torcido, o LED não pode ser uma única caixa axis-aligned — ela ficaria reta enquanto a fachada espirala. Para `shape === "twisted"`, cada aresta vertical é segmentada em `LED_TWIST_SEGMENTS = 12` pedaços curtos; cada segmento é orientado via quaternion (`setFromUnitVectors(Y, dir)`) para alinhar à tangente da curva torcida. O retângulo do topo também é rotacionado pelo `TWIST_TOTAL_ANGLE` total (importado de [[scene-builders#createTwistedBuildingMesh.ts|createTwistedBuildingMesh]]). Com instancing, mais segmentos custam só matrizes extras — draw calls continuam 3.

---

### `createBuildingShapeMesh.ts`

> [!tip] Formato novo ou edição de modelo
> Passo a passo, pontos de integração, render de avaliação (`scripts/render-building.mjs`) e limpeza: [[novo-edificio]].

Registro único formato → builder. Ponto de entrada de **todo** consumidor de formato: [[scene-managers|DonationManager]] na cena e [[three-components#CustomizationPreview.tsx|CustomizationPreview]] no admin.

**Responsabilidades:**
- `SHAPE_BUILDERS`: `Record<Exclude<BuildingShape, "default">, builder>` — `Record` exaustivo, formato novo em [[scene-types#BuildingShape]] sem builder **não compila**
- `createBuildingShapeMesh(shape, facadeMaterial, topMaterial, defaultGeometry)` — devolve o Mesh do formato; `default` usa a geometria caixa que o caller já tem em mãos
- Formatos com grupos repetidos: `mergeGroups` do Three.js gera índice agrupado por material; cache compartilhado por geometria. Atributos (posição, normal, UV/projeção) reutilizados, sem duplicar buffers de vértices. Dispose original libera versão agrupada.
- `setBuildingShapeMeshBatching(mesh, enabled)` — alterna geometria agrupada/original sem reconstruir buffers. [[scene-managers|Manager]] mantém agrupamento no contexto esmaecido do foco para evitar milhares de chamadas; o selecionado mantém a política autoral do builder.
- `groupBoxGeometryByTop()` — reordena o índice do `BoxGeometry` e consolida as seis faces em dois grupos reais (laterais/base + topo), reduzindo seis draw calls para dois quando há dois materiais
- `createUnitBuildingGeometry()` — caixa 1×1×1 já consolidada por `groupBoxGeometryByTop` (topo = material 1, resto = 0) + atributos `aProjPosition`/`aProjNormal` do shader triplanar. Instância nova por chamada, quem cria descarta
- `BUILDING_SHAPES` / `isBuildingShape(key)` — lista e guard pra key vinda do catálogo do banco ([[customization-api]]), que pode ter opção sem builder no front
- `disposeBuildingShapeSharedResources()` — descarta a geometria compartilhada dos 10 formatos customizados de uma vez

**Quando mexer aqui:**
- Adicionar formato novo (uma linha no mapa + uma no dispose)
- Mudar a geometria caixa do formato `default`

> [!note] Cor do Empire fica fora
> `createEmpireBuildingMesh` cria materiais extras (janela, metal, calcário claro/escuro), então cor customizada exige `setEmpireBuildingMeshColor`. Esse caso continua no caller — o mapa só constrói.

> [!important] Não chame o dispose no admin
> As geometrias são cache module-level compartilhado. `disposeBuildingShapeSharedResources()` é do teardown do manager; o preview do admin só descarta os **materiais** que criou.

**Checagem:** `node scripts/check-building-shapes.mjs` — monta os 14 formatos com bundle em memória (sem servidor, watcher, navegador ou WebGL) e afirma geometria não-degenerada, altura unitária e slots de material na ordem fachada/topo. Cobre também o preview do admin: `resolveSubject` pra toda key semeada e o `frameBox` ignorando volumétrico.

#### Agrupamento por material (mobile)

Análise de 22/10/2026: modelos detalhados geravam centenas/milhares de chamadas por prédio. Cada `geometry.groups` = um draw call, mesmo com material repetido. Agrupamento reduz chamadas sem remover triângulos, mudar materiais, shaders, texturas ou resolução.

| Formato | Grupos antes | Grupos depois (opaco) |
|---|---:|---:|
| Empire | 2293 | 8 |
| Taipei | 517 | 2 |
| One Trade | 299 | 2 |
| Twisted / Tapered | 6 | 2 |
| Hearst | 4 | 2 |
| Octagonal / Setback / Chrysler | 3 | 2 |

Caixa padrão e modelos residenciais já agrupados: intactos. Benefício na cena e nas prévias, mobile/desktop. Contagem por prédio e passe; não representa FPS medido nem redução percentual do quadro inteiro.

> [!important] Foco mantém o contexto agrupado
> Com HDR, contexto e selecionado mantêm materiais/grupos autorais em camadas distintas; a opacidade de 15% é aplicada ao conjunto no [[scene-runtime#createFocusRenderer.ts|renderizador de foco]]. Sem HDR, o fallback mantém contexto esmaecido agrupado e sem escrita de profundidade, em vez de devolver um Empire de 8 para 2.293 grupos. Nesse fallback, o blending interno passa a ser por material. O selecionado conserva materiais e vidros autorais; geometria, projeções e texturas não mudam. Ver [[scene-managers#Foco em Edifício (Destaque Visual)]].

**Verificação:** `node scripts/check-building-draw-calls.mjs` compara builders originais com entrada compartilhada: mesmos índices por material (inclusive winding), atributos, limites e seleção por raio. Verifica cache, alternância independente por mesh e dispose. `node scripts/check-building-textures.mjs` cobre foco/troca/restauração/descarte no manager real. Sem servidor/navegador/GPU; FPS e composição visual ainda precisam de medição no aparelho.

**Outros caminhos analisados:** [[scene-runtime#Desempenho (TBT e celular)|runtime]] já usa render sob demanda, compilação assíncrona e uploads em etapas; prédios padrão já usam instancing. Perfil visual mobile existente (DPR 1,5, texturas menores, sem captura dinâmica do cube) preservado. FPS acompanha o rAF, com inércia normalizada pelo tempo real. Cena atual não tem shadow maps. PBR/clearcoat/bump e transparência continuam custando GPU; alterações visuais nesses caminhos ficaram fora deste ajuste.

**Fontes consultadas:**
- [Three.js — BufferGeometry.groups](https://threejs.org/docs/pages/BufferGeometry.html#groups): um draw call por grupo.
- [Three.js — mergeGroups](https://threejs.org/docs/pages/module-BufferGeometryUtils.html#mergeGroups): utilitário oficial usado, conferido também no código da versão instalada (0.183.2).
- [MDN — Batch draw calls](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#batch_draw_calls): agrupar chamadas reduz overhead de WebGL.
- [Three.js — Rendering on Demand](https://threejs.org/manual/pages/rendering-on-demand.html): prática já presente no runtime.

> [!note] Guards irmãos nos acessórios
> `isRooftopType` ([[scene-builders#createRooftopMesh.ts|createRooftopMesh]]) e `isEdgeLightType` ([[scene-builders#createEdgeLightMesh.ts|createEdgeLightMesh]]) seguem o mesmo padrão: `key in FACTORIES`, pra validar key vinda do catálogo antes de chamar o builder.

---

### `createPreviewScene.ts`

Cena isolada com **uma** personalização para o admin ([[personalizacoes#Preview 3D: Formato, Topo e LED]]) ou edifício completo para [[three-components#BuildingPreview.tsx|BuildingPreview]]. Não é usada pela cena principal. Os componentes React criam o renderer e chamam daqui.

**Responsabilidades:**
- `resolveSubject({ kind, key })` — key crua do catálogo → builder, via `isBuildingShape`/`isRooftopType`/`isEdgeLightType`. `null` = sem builder no front ou `none` (ausência de acessório)
- Montar prédio-base + acessório: `rooftop` vai no topo (`+height/2`), `edgeLight` na base (`-height/2`)
- `VIEW` — altura do prédio-base e elevação da câmera por `kind`. O alvo tem que dominar o quadro: topo pede prédio baixo com câmera alta, formato pede prédio alto (geometria é 1×1×1 — sem esticar, Empire/Chrysler viram cubos)
- Luz própria (ambient + 2 direcionais, sem sombra) — admin não tem HDRI nem `scene.environment`
- Fundo escuro no LED e na aparência completa: halo é `AdditiveBlending` e some em fundo claro
- `frame(aspect)` / `place(distance)` — enquadramento por bounding sphere, separados pra resize não desfazer o giro do usuário
- `frameBox(root)` — bounding box que **ignora volumétrico** (transparente com `depthWrite: false`): o feixe do holofote tem 10 unidades e deixaria o prédio um ponto
- `BuildingPreviewAppearance` opcional em `createPreviewScene(resolved, appearance)`: aparência, mapas de fachada/topo e callback após carregar holograma. Combina formato, cor, textura, topo, LED, letreiro e holograma com os builders existentes. Yatchcasa (`yachthouse`) usa altura própria e recebe acessórios nas duas torres; residenciais usam a pedra do topo (Yatchcasa não: dourado é textureless).
- `hasAnimation()` informa se há holograma; `tick(elapsed, deltaMs)` anima o holograma; `updateStyle(customization)` atualiza cor, tint e opacidade sem reconstruir o modelo/decodificar GIF.
- Enquadramento ignora feixes de luz e inclui a área do holograma; `frame()` recalcula os limites após carregar a imagem.
- `dispose()` — materiais, caixa e clones de textura locais + acessórios/letreiro/holograma. Geometrias e mapas compartilhados com a cidade permanecem vivos.
- `disposeHologramMesh` incrementa `loadToken`: imagem que chega depois do fechamento não recria textura descartada.
- `node scripts/check-building-shapes.mjs` verifica os 14 formatos com acessórios, mudança de cor, proporções, descarte e a corrida de imagem atrasada do holograma.

**Quando mexer aqui:**
- Dar preview a outra categoria do catálogo (novo `kind` + entrada em `VIEW` + `PREVIEW_KIND` no admin)
- Ajustar enquadramento/altura de um tipo de preview

> [!important] Não descarte recurso compartilhado
> As geometrias de formato e acessório são cache module-level que a cena também usa. O preview descarta só o que **ele** criou — nunca `disposeBuildingShapeSharedResources()` e companhia.

---

### `createTwistedBuildingMesh.ts`

Cria um `THREE.Mesh` com geometria torcida (estilo **Cayan Tower**) para edifícios com `BuildingShape === "twisted"`.

**Responsabilidades:**
- Construir uma `BoxGeometry(1, 1, 1, 1, 24, 1)` e aplicar deformação no CPU: cada vértice `(x, y, z)` é rotacionado no plano XZ por ângulo `(y + 0.5) * (π/2)`, gerando 90° de twist do chão ao topo
- **Snapshot pré-twist** das posições e normais axis-aligned em atributos customizados `aProjPosition` e `aProjNormal` (consumidos pelo shader triplanar do [[scene-managers|DonationManager]] para evitar costura no meio do prédio)
- Recomputar normais via `geometry.computeVertexNormals()` (lighting usa as normais twisted; só a projeção da textura usa `aProjNormal`)
- Reaplicar mapeamento de `materialIndex` (topo → 1, demais → 0) idêntico à geometria base, para manter o split entre `facadeMaterial` e `topMaterial`
- Compartilhar a `BufferGeometry` entre todos os prédios torcidos (escala via `mesh.scale`)

> [!note] Por que `aProjPosition`/`aProjNormal`?
> O shader triplanar escolhe a projeção (XY/ZY/XZ) com base no eixo dominante da normal e usa a posição mundo para o UV. Com a normal twisted, a fronteira entre projeções é cruzada no meio da altura (≈45° de torção) — visível como uma costura. Usando os valores axis-aligned **pré-twist**, cada face mantém uma única projeção do chão ao topo e a textura "acompanha" a deformação da geometria sem corte. A geometria base (não torcida) também declara esses atributos como cópias diretas de `position`/`normal`, então o shader é unificado.

**Quando mexer aqui:**
- Ajustar o ângulo total de twist (atual: 90°)
- Aumentar/reduzir `TWIST_HEIGHT_SEGMENTS` (qualidade vs custo)
- Adicionar variantes de torção (sentido inverso, twist parcial, etc)

**API:**
```typescript
createTwistedBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeTwistedBuildingSharedResources(): void  // libera a BoxGeometry torcida compartilhada
```

> [!note] Materiais não são criados aqui
> O caller (DonationManager) clona `facadeMaterial`/`topMaterial` por edifício para suportar cor individual, e passa esses clones aqui. A geometria é compartilhada; os materiais não.

> [!important] Mesh único, não Instanced
> Twisted towers são desenhadas como `Mesh` separadas, fora do `InstancedMesh`. Para isso, o `DonationManager` mantém `customShapeMeshes: Map<donationId, {mesh, facadeMat, topMat, shape}>` e pula a alocação de slot no InstancedMesh para essas doações.

---

### `createOctagonalBuildingMesh.ts`

Cria um `THREE.Mesh` com planta octogonal regular para edifícios com `BuildingShape === "octagonal"`.

**Responsabilidades:**
- Construir manualmente uma `BufferGeometry` unitária centralizada em `1×1×1`, com 8 faces laterais, tampa superior octogonal e face inferior
- Manter `materialIndex = 1` somente no topo, preservando o split `facadeMaterial`/`topMaterial` usado pelo prédio padrão
- Declarar `aProjPosition` e `aProjNormal` para o shader triplanar do [[scene-managers|DonationManager]]
- Usar normais de projeção cardinalizadas nas faces diagonais, evitando ambiguidade no branch `XY/ZY/XZ` do shader e mantendo a textura estável
- Compartilhar a `BufferGeometry` entre todos os prédios octogonais

> [!note] Textura triplanar
> A torre octogonal não deforma uma caixa como a torcida, mas ainda precisa fornecer `aProjPosition`/`aProjNormal`. Nas faces diagonais, a normal geométrica tem componentes X/Z parecidas; por isso o builder grava uma normal de projeção cardinal, escolhendo um eixo dominante determinístico para evitar alternância de projeção.

**API:**
```typescript
createOctagonalBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeOctagonalBuildingSharedResources(): void
getOctagonalFootprintPoints(width?: number, depth?: number): Array<{ x: number; z: number }>
OCTAGON_FLAT_SIDE_RATIO: number
```

> [!note] Acessórios
> `createSignMesh` usa `OCTAGON_FLAT_SIDE_RATIO` para reduzir o letreiro às faces planas centrais. `createEdgeLightMesh` usa `getOctagonalFootprintPoints` para criar 8 arestas verticais e 8 segmentos no topo, alinhados à planta octogonal.

---

### `createSetbackBuildingMesh.ts`

Cria um `THREE.Mesh` com três patamares recuados para edifícios com `BuildingShape === "setback"`.

**Responsabilidades:**
- Construir manualmente uma `BufferGeometry` unitária centralizada em `1×1×1`, com base cheia, corpo intermediário recuado e topo mais estreito
- Gerar faces laterais verticais para cada patamar e lajes horizontais expostas nos recuos
- Manter `materialIndex = 0` nas fachadas e `materialIndex = 1` nas lajes/topo, preservando o split `facadeMaterial`/`topMaterial`
- Declarar `aProjPosition` e `aProjNormal` em todas as faces para o shader triplanar do [[scene-managers|DonationManager]]
- Compartilhar a `BufferGeometry` entre todos os prédios setback

> [!note] Textura triplanar
> A torre setback não torce os vértices, então não precisa de snapshot pré-deformação como a torcida. Ainda assim, o builder grava `aProjPosition`/`aProjNormal` explicitamente: laterais usam normais cardinais (`±X`/`±Z`) e lajes usam `+Y`, mantendo a seleção de projeção do shader estável em cada face.

**API:**
```typescript
createSetbackBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeSetbackBuildingSharedResources(): void
getSetbackFootprintScaleAtHeightRatio(heightRatio: number): number
getSetbackTierFootprints(width?: number, depth?: number, height?: number): SetbackTierFootprint[]
```

> [!note] Acessórios
> `createSignMesh` usa `getSetbackFootprintScaleAtHeightRatio` para posicionar o letreiro no patamar correto perto do topo. `createEdgeLightMesh` usa `getSetbackTierFootprints` para criar LEDs verticais e contornos horizontais em cada nível recuado.

---

### `createHearstBuildingMesh.ts`

Cria um `THREE.Mesh` com torre facetada e diagrid inspirada na **Hearst Tower** para edifícios com `BuildingShape === "hearst"`.

**Responsabilidades:**
- Construir uma `BufferGeometry` unitária centralizada em `1×1×1`, com planta octogonal chanfrada e anéis alternando chanfragem rasa/profunda
- Gerar a malha principal da fachada com `facadeMaterial` e a tampa/diagrid com `topMaterial`, preservando o contrato de textura PBR do manager
- Recriar o diagrid da referência como cilindros embutidos na mesma geometria compartilhada, sem portar câmera/luzes/cena
- Declarar `aProjPosition` e `aProjNormal` em todas as partes para o shader triplanar
- Exportar helpers usados por letreiros e LEDs para acompanhar a planta facetada

**API:**
```typescript
createHearstBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeHearstBuildingSharedResources(): void
getHearstRingFootprintPoints(width?: number, depth?: number, ringIndex?: number): Array<{ x: number; z: number }>
getHearstFaceSpanRatio(axis: "x" | "z", heightRatio: number): number
HEARST_RING_COUNT: number
```

> [!note] Acessórios
> `createSignMesh` reduz a largura do letreiro conforme a face reta da Hearst na altura de instalação. `createEdgeLightMesh` segmenta as arestas verticais pelos mesmos anéis da torre e contorna o topo chanfrado.

---

### `createEmpireBuildingMesh.ts`

Cria um `THREE.Mesh` com volumetria inspirada no **Empire State Building** para edifícios com `BuildingShape === "empire"`.

**Responsabilidades:**
- Construir uma `BufferGeometry` unitária centralizada em `1×1×1`, usando apenas a criação do edifício do protótipo `EmpireState.md`
- Recriar base larga, eixo vertical, setbacks, coroa, mastros, janelas e pilastras como uma geometria compartilhada
- Usar materiais próprios sem texturas PBR; o `DonationManager` marca os materiais como textureless para impedir aplicação de mapas
- Declarar `aProjPosition` e `aProjNormal` para manter compatibilidade com o shader triplanar do manager
- Exportar helpers usados por letreiros e LEDs para acompanhar os recuos principais

> [!note] Custo do 1º build
> `appendGeometry` percorre o índice direto (mesma ordem do `toNonIndexed`) com vetores scratch; `addBox` escala uma `UNIT_BOX` compartilhada pela matriz em vez de criar um `BoxGeometry` por caixa (lado zero → caminho antigo, matriz normal singular). Saída idêntica (diferença ≤ 3e-8), ~2x mais rápido (32 → 17 ms no Node). Mesmo padrão em [[#createTaipeiBuildingMesh.ts]] e [[#createOneTradeBuildingMesh.ts]] (`getProjectionNormal(normal, target)`, `normalizeBuffers` sem alocar por vértice).

**API:**
```typescript
createEmpireBuildingMesh(facadeMaterial: THREE.Material, roofMaterial: THREE.Material): THREE.Mesh
disposeEmpireBuildingSharedResources(): void
setEmpireBuildingMeshColor(mesh: THREE.Mesh, color: string): void
getEmpireFootprintScaleAtHeightRatio(heightRatio: number): { x: number; z: number }
getEmpireTierFootprints(width?: number, depth?: number, height?: number): EmpireTierFootprint[]
```

---

### `createTaipeiBuildingMesh.ts`

Cria um `THREE.Mesh` com volumetria inspirada no **Taipei 101** para edifícios com `BuildingShape === "taipei"`.

**Responsabilidades:**
- Construir uma `BufferGeometry` unitária centralizada em `1×1×1`, usando apenas a criação do edifício do protótipo `taipei.md`
- Recriar base, módulos empilhados chanfrados, beirais, detalhes de quina, coroa e pináculo como geometria compartilhada
- Usar os materiais `facadeMaterial` e `topMaterial` recebidos do `DonationManager`, preservando as texturas PBR e o controle de cor/tiling do projeto
- Declarar `aProjPosition` e `aProjNormal` em todas as partes para manter compatibilidade com o shader triplanar
- Exportar helpers usados por letreiros e LEDs para acompanhar o corpo principal e os níveis do topo

**API:**
```typescript
createTaipeiBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeTaipeiBuildingSharedResources(): void
getTaipeiFootprintScaleAtHeightRatio(heightRatio: number): number
getTaipeiTierFootprints(width?: number, depth?: number, height?: number): TaipeiTierFootprint[]
TAIPEI_SIGN_Y_OFFSET_RATIO: number
```

---

### `createOneTradeBuildingMesh.ts`

Cria um `THREE.Mesh` para o modelo **One Trade**.

**Responsabilidades:**
- Construir uma `BufferGeometry` unitária centralizada em `1×1×1`, usando apenas a criação do edifício do protótipo `One_World_Trade.md`
- Recriar base chanfrada, torre facetada afunilada, ribs verticais, faixas horizontais, parapeto e pináculo como geometria compartilhada
- Usar os materiais `facadeMaterial` e `topMaterial` recebidos do `DonationManager`, preservando as texturas PBR padrão do sistema
- Declarar `aProjPosition` e `aProjNormal` em todas as partes para manter compatibilidade com o shader triplanar
- Exportar helpers usados por letreiros e LEDs para acompanhar a largura efetiva do corpo principal

**API:**
```typescript
createOneTradeBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
disposeOneTradeBuildingSharedResources(): void
getOneTradeFootprintScaleAtHeightRatio(heightRatio: number): number
getOneTradeTierFootprints(width?: number, depth?: number, height?: number): OneTradeTierFootprint[]
getOneTradeLedFootprintRings(width?: number, depth?: number, height?: number): OneTradeLedFootprintRing[]
ONE_TRADE_SIGN_Y_OFFSET_RATIO: number
```

---

### `createYachthouseBuildingMesh.ts`

Modelo `yachthouse`, nome **Yatchcasa** (ref. `Yatchcasa .png` na raiz). Segue padrão de [[#createResidentialBuildingMesh.ts]]: metros, andares pela altura, slots autorais, sem textura de fachada.

**Detalhes modelados:**
- Embasamento retangular bege (lote todo em X, 68% em Z): rodapé, faixa de vidro fumê recuada 30 cm com montantes, platibanda
- Duas torres lado a lado em X (20,4×21 m, vão 4 m ≈ 1/5 da torre, como na ref.), planta chanfrada; pano de vidro fumê azul-escuro contínuo com montantes escuros; rodapé escuro de 0,6 m sobre o embasamento
- Sacada (40 cm, 35 cm saliente) em toda laje, contornando cantos chanfrados: **face lateral dourada, tampas escuras** — de cima lê como linha fina, não laje bege
- Rasgo vertical envidraçado (3,2 m × 1,2 m) no meio da frente e dos fundos, pilastras douradas nas bordas; faixas param no rasgo
- Faixa larga (0,9 m) no recuo → coroamento 1,3 m recuado, 3 andares de 3,6 m com faixas finas; tampa do recuo e do coroamento no slot topo
- Cobertura: casa de máquinas envidraçada, laje em balanço (slot topo), mastro cônico de 18 m do lado do vão

**Como funciona:**
- Lote 50×50 m = unit box; mesh `1×1×0,68` centrado. Pé-direito 3,2 m, embasamento 12,8 m
- **Nº de andares segue a altura** (`getYachthouseFloorCount`, 0,04 un./m, 1–81). Escala vertical própria: torre esbelta, 0,1 un./m do residencial deixaria faixas ralas. Manager chama `setYachthouseBuildingHeight(mesh, scale.y)` em todo sync; geometria cacheada por nº de andares
- Prévia usa `YACHTHOUSE_PREVIEW_HEIGHT` (4,5 → 22 andares, ~12:1 como real); geometria padrão do registro usa mesma altura
- `mergeGeometries` por slot → **5 grupos = 5 draw calls**: `0 dourado` (= `facadeMaterial`, recebe cor da customização), `1 topo` (laje em balanço, tampa dos recuos), `2 vidro`, `3 esquadria/mastro/tampa das sacadas`, `4 embasamento bege`
- Faixa vira 2 partes: `band()` extruda e separa grupos do `ExtrudeGeometry` (0 = tampas → slot escuro/topo, 1 = laterais → dourado)
- Dourado: `clearTextureSlots` (sem Concrete024 — metal liso), cor `0xa67c3e`, metalness 0,6, roughness 0,35; mais claro vira creme na luz da cena. Vidro `0x24405e` (metalness 0,9), esquadria `0x2f3438`, embasamento `0x76695a` fosco — `createSceneMaterial` reflete a cidade
- `YACHTHOUSE_TOWER_CENTERS` (±0,244), `YACHTHOUSE_ROOFTOP_SCALE` (0,26): acessório na laje da torre esquerda, mastro fica atrás dela. `getYachthouseTowerFootprints` (por torre: corpo + coroamento → LED; corpo → letreiro nas duas torres) e `getYachthouseRoofOffset` (topo da laje)
- `check-building-shapes.mjs`: lote, 5 slots/grupos, vão entre torres (aberto, < 5 m) e rasgo por raycast, dourado sem tampa (< 1% da área olhando pra cima), andares por altura com cache, piso/teto, tiers e cobertura, vidros marcados p/ envMap, dispose
- Catálogo: key `yachthouse` (contrato, não muda). Backend `0012_yachthouse_building.sql` cria; `0024_yatchcasa_label.sql` renomeia label para **Yatchcasa**. Ver [[customization-api]]

**API:**
```typescript
createYachthouseBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
setYachthouseBuildingHeight(mesh: THREE.Mesh, height: number): void
disposeYachthouseBuildingSharedResources(): void
getYachthouseFloorCount(height: number): number
getYachthouseTowerFootprints(width?: number, depth?: number, height?: number): YachthouseTowerFootprint[]
getYachthouseRoofOffset(height: number): number
YACHTHOUSE_TOWER_CENTERS: readonly [number, number]
YACHTHOUSE_ROOFTOP_SCALE: number
YACHTHOUSE_PREVIEW_HEIGHT: number
```

---

### `createResidentialBuildingMesh.ts`

Modelo `residential`: torre residencial com sacadas. Sem textura de fachada — detalhe todo em geometria; pedra ganha textura de superfície Concrete024.

**Detalhes modelados:**
- Sacadas em 3 faces (frente `+Z`, laterais `±X`), laje saliente 1,92 m por andar, guarda-corpo de vidro translúcido (cobertura: 4 faces)
- Pano de vidro recuado atrás das sacadas: montantes verticais, testeira escura sob cada laje, pilar de pedra nos cantos
- Empena cega nos fundos (`−Z`) com 2 colunas de janelas estreitas; laje 7 cm saliente marca andar
- Aletas terracota nos 2 cantos dos fundos, do chão ao guarda-corpo da cobertura
- Térreo: pilotis, lobby de vidro recuado com caixilhos, parede nos fundos
- Cobertura: piso (slot topo), casa de máquinas com beiral, venezianas e porta

**Como funciona:**
- Medidas em metros (pé-direito 3,2 m, térreo 4,6 m, laje 0,6 m). Footprint 20×20 m = unit box; mesh `1×1×1` centrado (profundidade 0,996: laje frontal 8 mm aquém da aleta)
- **Nº de andares segue a altura** (`getResidentialFloorCount`, 0,1 un./m, 1–60). Registro cria com altura do preview (3 → 7 andares); manager chama `setResidentialBuildingHeight(mesh, scale.y)` em todo sync. Geometria cacheada por nº de andares
- `mergeGeometries` por slot → **6 grupos = 6 draw calls**: `0 pedra` (= `facadeMaterial`, recebe cor), `1 topo` (= `topMaterial`, concreto global dos telhados), `2 vidro`, `3 guarda-corpo`, `4 caixilho`, `5 terracota`
- Pedra: `clearTextureSlots` (exportado de [[#createEmpireBuildingMesh.ts]]) marca material autoral; cor travertino `0xbbb4a6`, roughness 1, clearcoat 0, `tilingMultiplier = 6` (~4 m por repetição no triplanar)
- **Builder não carrega textura** (roda no node e no preview): `setResidentialStoneMaps(stone, set | null)` recebe o set Concrete024 do manager
- Cores calibradas pro runtime (ambient ~8 + HDRI + exposição 1,45 ACES): pedra renderiza ≈ `#c2b8a7`, terracota ≈ `#b65630`. Vidros/metal com metalness alto (vidro 0,9, guarda-corpo 1 com opacidade 0,32) → ambient não deixa leitoso
- Slots próprios usam `envMap` da fachada (cube probe) → **refletem a cidade**. `userData.authoredEnvMapIntensity` marca p/ manager; guarda-corpo guarda `userData.baseOpacity`
- `RESIDENTIAL_ROOFTOP_SCALE` (0,35): acessório de topo assenta na casa de máquinas. `getResidentialTierFootprints` (LED: corpo + casa de máquinas) e `getResidentialRoofOffset` (letreiro apoiado na laje de cobertura)
- `check-building-shapes.mjs`: lote, 6 slots/grupos, andares por altura com cache, piso/teto de andares, pedra liga/desliga textura, guarda-corpo translúcido, vidros marcados p/ envMap, dispose
- Catálogo: migration backend `0015_residential_building.sql`, key `residential`, label **Residencial (sacadas)**. Ver [[customization-api]]

**API:**
```typescript
createResidentialBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
setResidentialBuildingHeight(mesh: THREE.Mesh, height: number): void
setResidentialStoneMaps(stone: THREE.MeshStandardMaterial, maps: ResidentialStoneMaps | null): void
disposeResidentialBuildingSharedResources(): void
getResidentialFloorCount(height: number): number
getResidentialTierFootprints(width?: number, depth?: number, height?: number): ResidentialTierFootprint[]
getResidentialRoofOffset(height: number): number
RESIDENTIAL_ROOFTOP_SCALE: number
```

---

### `createApartmentBuildingMesh.ts`

Modelo `apartment`: torre residencial de reboco branco (ref. `edificio.png`). Mesmo esquema do [[#createResidentialBuildingMesh.ts]] — andares pela altura, 6 slots autorais, sem textura de fachada.

**Detalhes modelados:**
- Corpo = `ExtrudeGeometry` do contorno da planta: degrau de 0,6 m nos 4 cantos, rasgo de sacadas (5 × 2,5 m) na frente `+Z` e nos fundos `−Z`, pilastra cega 30 cm saliente ao lado do rasgo. Planta espelhada frente/fundos
- Janelas recortadas em grade: laterais `±X` com 6 colunas (sala/quarto 1,5 m de correr com montante + banheiro 0,7 m alta), frente/fundos com 4. Caixilho + vidro + peitoril saliente
- Sacada por andar no rasgo: laje cinza, guarda-corpo de vidro esverdeado com corrimão, porta de correr no fundo
- Térreo: embasamento cinza recuado 0,3 m (beiral do corpo aparece), entrada envidraçada na frente, portão nos fundos, básculas nas laterais
- Cobertura: platibanda 1,2 m (contorno recuado 0,2 m, mesmo `Shape` com furo), piso (slot topo), caixa d'água central com tampa e casa de máquinas com porta

**Como funciona:**
- Medidas em metros (pé-direito 3 m, térreo 4 m). Footprint 20×20 m; tudo montado em metros, não indexado (`ExtrudeGeometry` não tem índice), e escalado **uma vez** pra unit box no fim. Lateral em 9,85 m: peitoril cabe no lote
- Quads (`PlaneGeometry`) em janela/porta — sem as 5 faces escondidas de caixa. ~800 vértices por andar
- `insetOutline`: recua contorno retilíneo andando `t` na normal interna das 2 arestas vizinhas (exato em 90°) → furo da platibanda e piso
- **Nº de andares segue a altura** (`getApartmentFloorCount`, 0,1 un./m, 1–60); manager chama `setApartmentBuildingHeight(mesh, scale.y)` em todo sync. Cache por nº de andares
- Slots: `0 reboco` (= `facadeMaterial`, recebe cor), `1 topo`, `2 vidro`, `3 guarda-corpo`, `4 caixilho`, `5 acabamento` (lajes, peitoris, embasamento)
- Reboco: `clearTextureSlots`, cor off-white `0xd9d6d0` (branco puro estoura com ambient ~8 + exposição 1,45), roughness 1, `normalScale` 0,35. Textura de superfície Concrete024 via `setResidentialStoneMaps` (mesmo set do residential)
- Slots próprios via `createSceneMaterial` (exportado do residential): `envMap` da fachada, `authoredEnvMapIntensity`, guarda-corpo com `baseOpacity`
- `APARTMENT_ROOFTOP_SCALE` (0,3): acessório de topo na caixa d'água. `getApartmentTierFootprints` (LED: corpo até a platibanda + caixa d'água) e `getApartmentRoofOffset` (letreiro apoiado no topo da platibanda)
- `check-building-shapes.mjs`: lote, 6 slots/grupos, atributos finitos, rasgo vazado e pilastra cheia por raycast (frente e fundos), andares por altura com cache, piso/teto de andares, tiers do LED, letreiro, vidros marcados p/ envMap, dispose
- Catálogo: migration backend `0023_apartment_building.sql`, key `apartment`, label **Residencial (janelas)**. Ver [[customization-api]]

**API:**
```typescript
createApartmentBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
setApartmentBuildingHeight(mesh: THREE.Mesh, height: number): void
disposeApartmentBuildingSharedResources(): void
getApartmentFloorCount(height: number): number
getApartmentTierFootprints(width?: number, depth?: number, height?: number): ResidentialTierFootprint[]
getApartmentRoofOffset(height: number): number
APARTMENT_ROOFTOP_SCALE: number
```

---

### `createGourmetBuildingMesh.ts`

Modelo `gourmet`, label **Varanda Gourmet** (ref. `residencial.png`): torre bege e creme com pilha de sacadas curvas na frente. Mesmo esquema do [[#createApartmentBuildingMesh.ts]] — andares pela altura, 6 slots autorais, sem textura de fachada.

**Detalhes modelados:**
- Frente `+Z`: vão de 11,2 m entre pilastras creme de 3 m nos cantos. Sacada curva por andar: laje branca 35 cm (arco com flecha 1,2 m além da face), guarda-corpo de vidro + corrimão de alumínio, pano de vidro curvo 2 m recuado com 5 montantes
- Laterais `±X` e fundos `−Z`: 2 pilastras bege 60 cm salientes por face, rasgo entre elas pintado de bege (`REVEAL`, 2 cm à frente do creme) com janela estreita de banheiro sobre a pintura. Janelas quadradas 1,1 m em coluna nas pilastras e no creme
- Embasamento creme 3,2 m no lote todo (torre 17,2 m sobre ele): portaria envidraçada na frente, porta nos fundos
- Cobertura: platibanda 1,1 m com frente curva (`Shape` com furo, mesmo contorno recuado 25 cm), piso (slot topo), caixa d'água central (topo do mesh) + 2 casas de máquinas bege com tampa, porta e veneziana

**Como funciona:**
- Metros (pé-direito 3 m, embasamento 3,2 m). Lote 20×20 m; tudo não indexado, escala **uma vez** pra unit box no fim. Embasamento em 9,92 m: portaria saliente cabe no lote
- Curva = arco de círculo único (`ARC_R`, centro `ARC_Z`) passando por `(±BAY, TOWER)`: laje (`Extrude` do "D" arco + corda atrás do vidro), vidro e guarda-corpo (`CylinderGeometry` aberto com `thetaStart/Length`), corrimão (`Extrude` de faixa entre 2 raios) e platibanda reusam o mesmo centro
- Laje, guarda-corpo e corrimão: molde único por geometria, `clone().translate()` por andar. Janela = 2 quads (caixilho + vidro). ~310 triângulos por andar; 51 andares ≈ 16k tris, mesmo custo do apartment
- **Nº de andares segue a altura** (`getGourmetFloorCount`, 0,1 un./m, 1–60); manager chama `setGourmetBuildingHeight(mesh, scale.y)` em todo sync. Cache por nº de andares. Mesh nasce com altura 6 (= prévia do admin: lote 1 × altura 3)
- Slots: `0 bege` (= `facadeMaterial`, recebe cor: pilastras, rasgo, casas de máquinas), `1 topo`, `2 vidro`, `3 guarda-corpo`, `4 caixilho`, `5 creme` (núcleo, pilastras da frente, lajes, platibanda, embasamento)
- Bege `0xab9c84` × Concrete024 via `setResidentialStoneMaps` (média do mapa ≈ ×0,54) lê taupe claro; `normalScale` 0,35. Sem textura (render, texturas off) sai mais claro. Creme `0x9a8f7c` sem textura lê creme, não branco
- `GOURMET_ROOFTOP_SCALE` (0,3): acessório na caixa d'água. `GOURMET_TOWER_SCALE` (0,86): letreiro na face da torre. `getGourmetTierFootprints` (LED: embasamento + torre até a platibanda + caixa d'água) e `getGourmetRoofOffset` (letreiro no topo da platibanda)
- `check-building-shapes.mjs`: lote, 6 slots/grupos, atributos finitos, sacada curva além da face e pilastra creme rente por raycast, pilastra bege saliente e rasgo recuado, andares por altura com cache, piso/teto, tiers do LED, letreiro, vidros marcados p/ envMap, dispose
- Catálogo: migration backend `0025_gourmet_building.sql`, key `gourmet`, label **Varanda Gourmet**. Ver [[customization-api]]

**API:**
```typescript
createGourmetBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
setGourmetBuildingHeight(mesh: THREE.Mesh, height: number): void
disposeGourmetBuildingSharedResources(): void
getGourmetFloorCount(height: number): number
getGourmetTierFootprints(width?: number, depth?: number, height?: number): ResidentialTierFootprint[]
getGourmetRoofOffset(height: number): number
GOURMET_ROOFTOP_SCALE: number
GOURMET_TOWER_SCALE: number
```

---

### `createLoftBuildingMesh.ts`

Modelo `loft`, label **Loftifício** (ref. `loft.png`): torre de reboco bege com faixas verticais de pastilha verde recuadas, pilotis aberto e térreo de garagem. Mesmo esquema do [[#createApartmentBuildingMesh.ts]] — andares pela altura, 6 slots autorais, sem textura de fachada.

**Detalhes modelados:**
- 4 faces, mesma gramática: pilastra de canto em L + pilastra central bege na face 9,9 m; faixa de pastilha verde 50 cm recuada (9,4 m) entre elas. Frente/fundos: faixas em `x ∈ ±[1,6; 5,8]`; laterais: `z ∈ ±[2,6; 6,4]`
- Janelas de alumínio por andar: quadrada 1 m em coluna nas pilastras de canto; na faixa verde, 2 folhas 1,7 m (montante) junto ao canto + quadrada junto ao centro; pilastra central com basculante (frente/fundos) ou quadrada (laterais)
- Térreo 3 m: muro de pastilha recuado (9,6 m), portão verde-escuro em cada vão de faixa, porta de pedestre + marquise de vidro na frente, cornija bege 30 cm
- Pilotis 3,8 m aberto: 20 pilares sob as pilastras (vaza de lado a lado), portaria de pastilha com porta de vidro, piso em concreto (slot topo — sem sombra na cena, piso bege fecharia o vão), viga de transição bege
- Cobertura: bege 60 cm acima da última janela + platibanda 1,2 m, piso (slot topo), casa de máquinas com porta, caixa d'água central (topo do mesh), 2 casinhas de canto

**Como funciona:**
- Grade única: pilastra → pilar do pilotis; faixa verde → vão de portão. Núcleo = caixa de pastilha; pilastras = caixas bege por cima (sem face coplanar sobreposta)
- Metros (pé-direito 2,9 m, base 6,8 m). Lote 20×20 m; tudo não indexado, escala **uma vez** pra unit box no fim. Cornija em 9,95 m e marquise em 9,98 m: cabem no lote. Vidro da marquise termina no caixilho (9,94 m), sem face coplanar
- Janela = 2 quads (caixilho + vidro) + montante na de 2 folhas. ~128 triângulos por andar; 51 andares ≈ 7k tris — metade do apartment/gourmet
- **Nº de andares segue a altura** (`getLoftFloorCount`, 0,1 un./m, 1–60); manager chama `setLoftBuildingHeight(mesh, scale.y)` em todo sync. Cache por nº de andares. Mesh nasce com altura 6 (= prévia do admin: lote 1 × altura 3)
- Slots: `0 reboco bege` (= `facadeMaterial`, recebe cor: pilastras, cornija, pilares, platibanda, casas), `1 topo`, `2 vidro`, `3 alumínio`, `4 pastilha verde`, `5 portão`
- Bege `0xd3c4a8` × Concrete024 via `setResidentialStoneMaps` (≈ ×0,54) lê bege claro; `normalScale` 0,35. Sem textura (render, texturas off) sai quase branco — calibrado com `--slot 0=726a5b,0,1`. Pastilha `0x47534a` acetinada (rough 0,45), portão `0x1c3a34`
- `LOFT_ROOFTOP_SCALE` (0,24): acessório na caixa d'água. `getLoftTierFootprints` (LED: corpo até a platibanda + caixa d'água) e `getLoftRoofOffset` (letreiro no topo da platibanda, face do lote como apartment)
- `check-building-shapes.mjs`: lote, 6 slots/grupos, atributos finitos, faixa verde recuada e pilastras rentes por raycast, pilotis vazado e térreo fechado, andares por altura com cache, piso/teto, tiers do LED, letreiro, materiais marcados p/ envMap, dispose
- Catálogo: migration backend `0027_loft_building.sql`, key `loft`, label **Loftifício**. Ver [[customization-api]]

**API:**
```typescript
createLoftBuildingMesh(facadeMaterial: THREE.Material, topMaterial: THREE.Material): THREE.Mesh
setLoftBuildingHeight(mesh: THREE.Mesh, height: number): void
disposeLoftBuildingSharedResources(): void
getLoftFloorCount(height: number): number
getLoftTierFootprints(width?: number, depth?: number, height?: number): ResidentialTierFootprint[]
getLoftRoofOffset(height: number): number
LOFT_ROOFTOP_SCALE: number
```

---

## O que Builders NÃO Fazem

Builders não decidem:
- Quando a animação roda → [[scene-runtime]]
- Quando os chunks são sincronizados → [[scene-managers]]
- Quando a câmera disparou refresh → [[scene-runtime]]

Essas decisões ficam no runtime e nos managers.

### Mapas incrementais de pedra

`setResidentialStoneMaps` compara a presença de cor, normal e roughness antes/depois. Um normal/roughness que chega após o color map também invalida a variante do shader. Alterações somente de cor não exigem recompilação. Testes de culling, GIF, cache e descarte: `scripts/check-mobile-performance.mjs`.
