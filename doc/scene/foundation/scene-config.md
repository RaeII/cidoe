---
title: Scene Config
tags:
  - cidoe
  - config
  - defaults
aliases:
  - Configurações
  - Valores Padrão
---

# Scene Config

Arquivos de configuração em `src/scene/config/`.

> [!tip] Regra prática
> Se você quer mudar comportamento inicial **sem alterar lógica**, comece aqui.
> - "Quero prédios mais escuros por padrão" → `buildingConfig.ts`
> - "Quero câmera mais longe" → `citySceneConfig.ts`
> - "Quero relevo mais alto" → `terrainConfig.ts`

## Objetivo da Pasta

Guarda valores padrão e configurações base do projeto. Evita "números soltos" espalhados na aplicação.

## Arquivos

### `buildingConfig.ts`

Valores padrão dos prédios:

| Campo | Descrição |
|---|---|
| `color` | Cor inicial dos prédios |
| `roughness` | Roughness inicial |
| `metalness` | Metalness inicial |
| `targetMaxHeight` | Altura alvo do prédio mais alto (padrão: 15) |

> [!note] targetMaxHeight vs maxHeight
> `targetMaxHeight` é definido pelo usuário via input. O prédio mais alto **nunca** ultrapassa `maxHeight` de `citySceneConfig.ts` (cap visual absoluto da cena).

**Funções exportadas:**
- `DEFAULT_BUILDING_SETTINGS`
- `createDefaultBuildingSettings()` — cria novo objeto sem compartilhar referência

---

### `textureConfig.ts`

Valores padrão das texturas PBR das fachadas:

| Campo | Padrão |
|---|---|
| `enabled` | `true` |
| `textureKey` | `"texture/Facade006_1K-mirrored-PNG"` (= value seed; pasta da fachada ativa, ver [[scene-textures]]) |
| `randomPerBuilding` | `true` — cada prédio sorteia uma textura do catálogo (ver [[scene-textures#Sorteio por edifício]]). `false` = cidade inteira com `textureKey` |
| `normalScale` | `0` |
| `displacementScale` | — |
| `tilingScale` | — |
| `roughnessIntensity` | — |
| `metalnessIntensity` | — |
| `emissiveIntensity` | `0` |
| `clayRender` | `false` |
| `top.*` | Sub-configurações do topo do prédio |

**Funções exportadas:**
- `DEFAULT_TEXTURE_SETTINGS`
- `createDefaultTextureSettings()`

---

### `groundConfig.ts`

Valores padrão do chão:

- Cor inicial
- Roughness e metalness
- Tipo de material (ver [[scene-types#GroundMaterialType]])

**Funções exportadas:**
- `DEFAULT_GROUND_SETTINGS`
- `createDefaultGroundSettings()`

---

### `terrainConfig.ts`

Valores padrão e constantes estruturais do relevo procedural (ver [[scene-types#TerrainSettings]]). Construído em [[scene-builders#createTerrain.ts]].

**Defaults (`createDefaultTerrainSettings()`):**

| Campo | Padrão | Descrição |
|---|---|---|
| `enabled` | `true` | Relevo começa ligado? |
| `seed` | `4690` | Semente do ruído procedural |
| `segments` | `64` | Resolução da malha (subdivisões por lado) |
| `size` | `700` | Largura do plano em unidades world |
| `height` | `35` | Amplitude do relevo |
| `frequency` | `2` | Escala do ruído base |
| `octaves` | `6` | Camadas de detalhe do fbm |
| `persistence` | `0.5` | Queda de amplitude por oitava |
| `lacunarity` | `2.2` | Ganho de frequência por oitava |
| `ridge` | `1.0` | Peso das cristas (ridge noise) |
| `faults` | `4` | Quantidade de falhas tectônicas |
| `faultStrength` | `4` | Força de cada falha |
| `smooth` | `4` | Iterações de suavização do heightfield |
| `terrace` | `0` | Patamares (0 = desligado) |
| `edge` | `0.3` | Rebaixamento da borda externa (0–1) |
| `wireframe` | `false` | Malha em arame |
| `lowColor` | `"#364e2c"` | Cor dos vales (gradiente baixo) |
| `highColor` | `"#1d2b03"` | Cor dos picos (gradiente alto) |

> [!note] `size`/`segments` viraram settings
> Antes constantes fixas (`TERRAIN_SIZE`/`TERRAIN_SEGMENTS`, **removidas**). Agora vivem em [[scene-types#TerrainSettings]] e são editáveis em tempo real. Trocar `segments` realoca buffers + índice da malha em [[scene-builders#createTerrain.ts]].

**Constantes estruturais:**

| Constante | Valor | Descrição |
|---|---|---|
| `TERRAIN_SEGMENT_OPTIONS` | `[16, 24, 32, 48, 64, 96, 128, 192, 256]` | Opções do select de resolução (`segments`) |
| `TERRAIN_CITY_PADDING` | `30` | Folga plana entre a borda do loteamento e o início do verde. Largo o bastante pra ultrapassar ~1 célula da malha (`size/segments`), senão a interpolação grosseira do relevo sangra verde sobre as quadras de borda |
| `TERRAIN_TRANSITION` | `60` | Largura MÍNIMA do degradê cidade→colinas (cresce com a altura: `max(este, height*3)`) |
| `TERRAIN_GROUND_Y` | `-0.04` | Nível plano do **chão único**, abaixo das ruas (−0.015) com folga. O plano cinza fica escondido no render normal (ver runtime), então não há z-fighting entre os dois |
| `TERRAIN_MAX_BUILDINGS` | `5000` | Teto de edifícios. Acima disso o runtime esconde o relevo — cidade já passou da borda da malha (`size` 700) e o verde só paga vértices. Painel continua mandando; runtime sobrepõe `enabled` (ver [[scene-runtime#Relevo (terrainRig)]]) |

**Funções exportadas:**
- `DEFAULT_TERRAIN_SETTINGS`
- `createDefaultTerrainSettings()`

---

### `lightConfig.ts`

Valores padrão das luzes:

- Ambient (cor, intensidade extra)
- Hemisphere (cor do céu, cor do chão, intensidade)
- Directional (distância, elevação, azimute, alvo)

**Funções exportadas:**
- `DEFAULT_LIGHT_SETTINGS`
- `createDefaultLightSettings()`

---

### `blockLayoutConfig.ts`

Valores padrão do layout de quadras:

| Campo | Padrão | Descrição |
|---|---|---|
| `blockSize` | `8` | Prédios por lado (8×8 = 64 slots por quadra; a central é 7×7 = 49) |
| `streetWidth` | `6.0` | Largura das ruas entre quadras em unidades world |
| `towerRatio` | `0.33` | Fração da camada de topo (33%). Metade do que sobra vira camada do meio |
| `towersPerBlock` | `14` | Quantos do topo por quadra. Baixo demais espalha a cidade e deixa vazada |
| `baseHeightCap` | `0.70` | Onde começa a faixa do topo e termina a do meio (70% de maxSceneHeight) |
| `lotColor` | `#5b5048` | Cor dos lotes vazios das quadras (editável na aba **geral** do painel) |
| `sidewalkColor` | `#9a9da3` | Cor do topo da calçada/meio-fio (editável na aba **geral** → seção Calçada) |
| `sidewalkSideColor` | `#55575c` | Cor das laterais da calçada (mais escura, efeito de sombra; aba **geral** → seção Calçada) |
| `sidewalkHeight` | `0.12` | Altura do topo da calçada (degrau acima do chão), editável na aba **geral** → seção Calçada |
| `centerTallest` | `false` | `false` = layout por quadra (torres + base); `true` = mais alto no centro. Aba **geral** → seção Organização dos edifícios |

**Funções exportadas:**
- `createDefaultBlockLayoutSettings()`

> [!note]
> Esses valores são editáveis em tempo real via inputs no overlay. Ver [[html-components#BuildingHeightInput.tsx]].

---

### `environmentConfig.ts`

Valores padrão do ambiente HDRI:

- `offsetX` — rotação horizontal do skybox
- `offsetY` — deslocamento vertical do horizonte
- `offsetZ` — roll diagonal
- `night` — modo noite (padrão `false`)
- `windowIntensity` — brilho das janelas acesas, padrão `NIGHT_PRESET.windowIntensity` (slider na seção **Ambiente**)

Exporta também `NIGHT_PRESET` — tudo que a noite muda. Sem HDRI noturno: noite = HDRI diurno multiplicado por azul escuro.

Arquivo do HDRI (WebP, céu 4K/2K por tier + fonte 1K do PMREM) não é config — mora em [[scene-builders#loadEnvironment.ts]].

| Campo | Padrão | Onde bate |
|---|---|---|
| `skyTint` | `#1b2440` | `MeshBasicMaterial.color` da esfera do céu — multiplica o mapa, mantém nuvem |
| `ambientColor` | `#8ea6d6` | Cor da `AmbientLight` (luar frio) |
| `ambientScale` | `0.09` | Fator sobre `ambientTotal` — prédio escurece, LED/holograma dominam |
| `environmentIntensity` | `0.1` | `scene.environmentIntensity`: IBL do HDRI diurno perde peso |
| `fogColor` | `#070b16` | Cor da `FogExp2` (densidade continua do horizonte) |
| `windowColor` · `windowLitFraction` | `#ffcb82` · `0.26` | Cor e fração das janelas acesas ([[scene-managers#Janelas acesas de noite]]) |
| `windowIntensity` | `1.7` | Só **padrão** do slider `EnvironmentSettings.windowIntensity` — quem manda em runtime é o painel |
| `facadeEnvMapIntensity` | `0.6` | `envMapIntensity` da fachada de noite — override do slider "Intensidade na fachada" (só de dia) |
| `lampEmissive` · `lampPool` | `2.6` · `0.55` | Luminária acesa e mancha de luz dos postes de rua ([[scene-managers#Postes de Luz (rebuildStreetLamps)]]) |
| `starCount` · `starRadius` · `starSize` | `1400` · `180` · `1.6` | Campo de estrelas ([[scene-builders#loadEnvironment.ts]]) |

---

### `reflectionConfig.ts`

Padrões do probe de reflexo dos prédios. `createDefaultReflectionSettings()` + `DEFAULT_REFLECTION_SETTINGS`.

| Campo | Padrão | Por quê |
|---|---|---|
| `enabled` | `true` | — |
| `resolution` | `256` | Fachada é espelho (`roughness 0`, amostra mip 0); 128 vira mancha lisa |
| `probeX/Y/Z` | `0, 18, 0` | Centro da cidade, logo acima dos telhados |
| `followCamera` | `true` | Probe na câmera: cada prédio devolve o que está à frente do ponto de vista |
| `skyDrop` | `0` | Sem deslocamento de céu na captura — cube vê o mesmo horizonte do render normal |
| `envHorizon` | `0` | Vetor de reflexão cru, sem achatamento. Slider achata `reflectVec.y` no shader. Fachada vertical espelha pra baixo (`R.y = −V.y`) onde o cube só tem cinza; puxar pro horizonte devolve o skyline. Escala só Y → **igual em toda face** |
| `envRotY` | `0` | Giro horizontal do envMap no material (graus). Único eixo de rotação rígida que preserva simetria entre faces |
| `heightFadeStart` | `32.8` | Altura da câmera onde começa a suavização |
| `heightFadeEnd` | `57.6` | Altura onde o desfoque chega ao máximo |
| `heightBlur` | `0` | Sem piso de rugosidade por altura — fachada mantém o espelho vista de cima |
| `reflectionDistanceStart` | `599` | Fade desligado: além do alcance do probe (`reflectionFar 260`) |
| `reflectionDistanceEnd` | `600` | Fade desligado: proximidade sempre `1` |
| `updateInterval` | `4` | Frames entre capturas |
| `continuous` | `true` | Recaptura sempre — probe segue a câmera, `cubeDirty` não basta |
| `includeGround` | `true` | Plano cinza + relevo entram no cube e aparecem nos reflexos |
| `includeCityFloor` | `true` | Asfalto/calçada/lotes entram no cube e aparecem nos reflexos |

> [!note]
> Editável na aba **reflexo** do painel. Tipo em [[scene-types#ReflectionSettings]], mecânica em [[scene-runtime#Probe de reflexo (envMap dos prédios)]].

---

### `uiVisibilityConfig.ts`

Controla visibilidade dos componentes HTML sobrepostos na tela. Persiste preferência em `localStorage` (chave `cidoe:ui-visibility`). `readProjectStorage` migra a preferência legada sem descartar o original em falhas de gravação. Defaults próprios da main preservados, incluindo `donationFilter`. Ver [[index#Marca, SEO e migração de nomes]].

| Campo | Padrão | Esconde |
|---|---|---|
| `cameraLog` | `true` | Log de posição da câmera (canto inferior esquerdo) |
| `donationInput` | `true` | Input de doação individual |
| `bulkInput` | `true` | Input de geração em lote (mín/máx/qtd) |
| `blockLayoutInput` | `true` | Input de configuração de quadras |
| `donationFilter` | `true` | Barra de filtros das doações (região/UF/cidade/ONG) |

**Funções exportadas:**
- `createDefaultUIVisibilitySettings()` — tudo visível
- `loadUIVisibilitySettings()` — lê `localStorage`, mescla com defaults (campo ausente/inválido cai no default); seguro contra JSON corrompido e `localStorage` bloqueado
- `saveUIVisibilitySettings(settings)` — grava no `localStorage`, falha silenciosa se bloqueado

> [!note]
> Editável em tempo real pela aba **tela** do painel. Ver [[html-components#CityControlPanel.tsx]]. Tipo em [[scene-types#UIVisibilitySettings]].

---

### `horizonConfig.ts`

Defaults de [[scene-types#HorizonSettings]]: `groundEdgeMode: "straight"`, `groundDistance: 660` (`far * 1.1`), `renderDistance: 600`, edifícios frente/trás `208.3 / 46.2`, névoa `0.007 / #8c8c8c`. Seletor na aba Horizonte oferece reta, circular e quadrado. Reta acompanha câmera e cobre frustum lateral; `1.1*far` é distância inicial, não garantia geométrica de cobertura.

### `citySceneConfig.ts` ⭐

Configuração mais global da cena. Define a estrutura completa de `CitySceneConfig`.

| Campo | Descrição |
|---|---|
| `chunkSize` | Tamanho de um chunk em unidades world |
| `chunkRadius` | Raio de chunks ao redor da câmera |
| `blockSize` | Tamanho dos blocos de prédios |
| `roadWidth` | Largura das ruas |
| `minHeight` | Altura mínima dos prédios |
| `maxHeight` | Cap visual absoluto (teto de altura; prédios nunca ultrapassam) |
| `maxBuildingsPerChunk` | Limite de prédios por chunk |
| `dprCap` | Limite máximo de device pixel ratio. `2` = resolução nativa em retina; só corta telas 3x+ |
| `liteDprCap` | DPR máximo no modo leve (`IS_LOW_TIER`, celular/máquina modesta): `1.5` |
| `targetFps` | FPS alvo para resolução dinâmica (inerte enquanto o granulado for `0`) |
| `liteFps` | Alvo da resolução dinâmica no modo leve: `60`. Não limita frames; o loop acompanha o rAF do navegador |
| `minRenderScale` | Piso **inicial** da escala de render. `1` = escala dinâmica desligada no boot. Em runtime quem manda é o `setGrain` do granulado — ver [[scene-runtime]] |
| `maxRenderScale` | Escala máxima de render |
| `far` | `600`: **padrão** do `HorizonSettings.renderDistance` (`camera.far` + raio do céu). Em runtime quem manda é o slider da aba horizonte |
| `reflectionFar` | `260`: alcance do probe, preservado para não ampliar custo das seis capturas |
| `maxSolarIntensity` | Intensidade solar máxima |
| `sceneBackground` | Cor de fundo da cena (hex) |
| `sceneFogColor` | Cor do fog |
| `sceneFogDensity` | Densidade do FogExp2 |
| ~~`groundSize`~~ | **removido**. Extensão do chão depende de `HorizonSettings.groundDistance`, `groundEdgeMode` e frustum (padrão `far * 1.1` em [[#horizonConfig.ts]]) |
| `cameraFov` | Campo de visão da câmera |
| `cameraNear` | `1`: near plane da câmera e do probe de reflexo. Precisão do depth ≈ distância²/near: caixilho 2 cm à frente da parede segura até ~90 un. (com `0.1` brigava a ~50 → z-fighting). Não baixar sem rever camadas finas dos builders ([[novo-edificio#2. Builder]]) |
| `initialCameraPosition` | Posição inicial `{x, y, z}` |
| `controlTarget` | Target inicial do OrbitControls |
| `controls.*` | Damping de referência a 60 Hz (normalizado pelo tempo real), velocidades, limites de zoom/pan/rotate |

> [!note] Alcances independentes
> `far` cobre geometria próxima, sem coordenadas gigantes. [[scene-builders#createGroundPlane.ts]] mantém apenas chão local que acompanha câmera. `HorizonSettings.distance`/`backDistance` limitam só edifícios pelo manager; `renderDistance` mexe em `camera.far` e no raio do céu; `groundDistance` controla alcance do chão conforme `groundEdgeMode`. `reflectionFar` mantém alcance anterior do probe. Intervalo/resolução da captura continuam em [[#reflectionConfig.ts]]; terreno conserva defaults e geometria.

**Constantes exportadas:**
- `CITY_SCENE_CONFIG` — objeto de configuração global
- `DEFAULT_SCENE_STATS` — estado inicial das métricas (`sceneReady: false`)

## Diferença entre Configs por Domínio e Config Global

Use os arquivos menores quando a configuração pertencer a um domínio específico:
- `buildingConfig`, `groundConfig`, `lightConfig`, `textureConfig`, `environmentConfig`, `reflectionConfig`, `terrainConfig`, `blockLayoutConfig`

Use `citySceneConfig.ts` quando for estrutural da cena inteira (tamanhos, câmera, FPS, fog).

## Tipos Relacionados

- [[scene-types#CitySceneConfig]] — interface TypeScript da config global
- [[scene-types#BuildingSettings]], [[scene-types#TextureSettings]] etc. — contratos dos domínios
