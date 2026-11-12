---
title: Scene Types
tags:
  - cidoe
  - typescript
  - tipos
  - contratos
aliases:
  - Tipos
  - Interfaces
  - Contratos
---

# Scene Types

Contratos TypeScript centralizados em `src/scene/types.ts`.

> [!abstract] Objetivo
> Centralizar os tipos usados entre as camadas. Evita duplicação e garante que o TypeScript proteja a comunicação entre React, hook, runtime, builders, managers e configs.

## Tipos de Configuração (Settings)

### `BlockLayoutSettings`

Configurações de layout das quadras de prédios:

```typescript
type BlockLayoutSettings = {
  blockSize: number;    // prédios por lado da quadra (ex: 3 → 3×3 = 9 slots)
  streetWidth: number;  // espaço entre quadras em unidades world (ex: 6.0)
  towerRatio: number;   // fração da camada de topo (0–1, padrão: 0.33)
  towersPerBlock: number;// quantos do topo por quadra (padrão: 14)
  baseHeightCap: number;// início da faixa do topo / teto da faixa do meio (0–1, padrão: 0.70)
  lotColor: string;     // cor dos lotes vazios das quadras (loteamento esperando edifício)
  sidewalkColor: string; // cor do topo da calçada (meio-fio em volta das quadras)
  sidewalkSideColor: string; // cor das laterais da calçada (mais escura = efeito de sombra/altura)
  sidewalkHeight: number;// altura do topo da calçada (degrau acima do chão), em unidades world
  centerTallest: boolean;// false = layout por quadra (padrão); true = mais alto no centro
}
```

O sistema de 3 camadas corta as doações em topo (`towerRatio`, padrão 33%), meio (metade do que sobra) e baixo (o resto). Cada camada tem **faixa de altura exclusiva** — nunca se sobrepõem, então quem doou mais nunca fica mais baixo. O meio ganha as **quadras centrais** como prêmio de posição. Ver [[scene-managers#Layout dos Prédios — Sistema de 3 Camadas]].

`centerTallest` troca esse esquema pelo modo **mais alto no centro** (primeira ideia do projeto): quadras e ruas ficam iguais, mas nenhuma torre agrupa por quadra. Todos os slots da cidade entram numa lista única ordenada por distância da origem e as doações (já em ordem de valor decrescente) caem nessa ordem. Resultado: maior doação no slot central exato, altura caindo suave pra borda, sem prédio baixo no meio dos altos. `towerRatio`/`towersPerBlock`/`baseHeightCap` ficam inertes nesse modo.

Editável em tempo real via inputs no overlay superior. `centerTallest` fica no card flutuante [[html-components#BuildingLayoutCard.tsx|BuildingLayoutCard]], fora do painel. `lotColor` (seção **Quadras**), `sidewalkColor`, `sidewalkSideColor` e `sidewalkHeight` (seção **Calçada**) são editáveis pela aba **geral** do [[html-components#CityControlPanel.tsx|CityControlPanel]]. Padrões em `blockLayoutConfig.ts`.

---

### `BuildingSettings`

Configurações visuais dos prédios:

```typescript
type BuildingSettings = {
  color: string;
  roughness: number;
  metalness: number;
  targetMaxHeight: number; // altura alvo do prédio mais alto
}
```

---

### `TextureSettings`

Configurações PBR das texturas de fachada:

```typescript
type TextureSettings = {
  enabled: boolean;
  textureKey: string;         // pasta da fachada (value do catálogo). Global da cena; por edifício em BuildingCustomization — ver [[scene-textures]]
  randomPerBuilding: boolean; // sorteia a textura de cada prédio entre as ativas do catálogo — ver [[scene-textures#Sorteio por edifício]]
  normalScale: number;
  displacementScale: number;  // relevo visual via displacement map
  tilingScale: number;        // UV repeat
  roughnessIntensity: number;
  metalnessIntensity: number;
  envMapIntensity: number;    // intensidade dos reflexos
  emissiveIntensity: number;  // brilho/glow usando colorMap como emissiveMap
  clayRender: boolean;        // espelhamento nas superfícies
  top: TopTextureSettings;    // configurações específicas do topo
}
```

---

### `TopTextureSettings`

Sub-configurações de textura para o topo dos prédios:

```typescript
type TopTextureSettings = {
  normalScale: number;
  displacementScale: number;
  tilingScale: number;
  roughnessIntensity: number;
  metalnessIntensity: number;
  envMapIntensity: number;
}
```

---

### `GroundSettings`

Configurações do chão:

```typescript
type GroundSettings = {
  color: string;
  roughness: number;
  metalness: number;
  materialType: GroundMaterialType;
}
```

Tamanho e formato em [[scene-types#HorizonSettings|HorizonSettings]]: `groundDistance` + `groundEdgeMode`. Aplicados por [[scene-builders#createGroundPlane.ts]]; material permanece em GroundSettings.

---

### `GroundMaterialType`

Tipos possíveis de material do chão:

```typescript
type GroundMaterialType = "standard" | "matte" | "soft-metal" | "polished"
```

| Tipo | Comportamento |
|---|---|
| `standard` | Material padrão |
| `matte` | Chão fosco (roughness alto) |
| `soft-metal` | Metal suave |
| `polished` | Chão polido (roughness baixo) |

---

### `TerrainSettings`

Relevo procedural ao redor da cidade (partes sem edifício). Estrutura = ruído fbm + cristas + falhas + terraços; cor = gradiente low→high por altura. Mesmos controles do protótipo `terrain.md`.

```typescript
type TerrainSettings = {
  enabled: boolean;
  seed: number;          // semente do ruído procedural
  segments: number;      // resolução da malha (subdivisões por lado)
  size: number;          // largura do plano em unidades world
  height: number;        // amplitude do relevo
  frequency: number;     // escala do ruído base
  octaves: number;       // camadas de detalhe do fbm
  persistence: number;   // queda de amplitude por oitava
  lacunarity: number;    // ganho de frequência por oitava
  ridge: number;         // peso das cristas (ridge noise)
  faults: number;        // quantidade de falhas tectônicas
  faultStrength: number; // força de cada falha
  smooth: number;        // iterações de suavização do heightfield
  terrace: number;       // patamares (0 = desligado)
  edge: number;          // rebaixamento da borda externa (0–1)
  wireframe: boolean;    // malha em arame
  lowColor: string;      // cor dos vales (gradiente baixo)
  highColor: string;     // cor dos picos (gradiente alto)
}
```

Estrutura via **fbm** (`persistence`/`lacunarity`), **ridge noise**, **falhas tectônicas** (`faults`/`faultStrength`), **terraços** e **suavização** (`smooth`); borda externa rebaixada por `edge`; cor por **gradiente** `lowColor`→`highColor` interpolado pela altura. `segments`/`size` controlam resolução e largura da malha (antes eram constantes fixas). Construído em [[scene-builders#createTerrain.ts]], defaults em [[scene-config#terrainConfig.ts]]. Editável pela aba **terreno** do painel.

---

### `LightSettings`

Configurações das luzes da cena:

```typescript
type LightSettings = {
  ambientColor: string;
  ambientExtraIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  directionalColor: string;
  directionalDistance: number;
  directionalElevation: number;  // ângulo esférico
  directionalAzimuth: number;    // ângulo esférico
  directionalTargetX: number;
  directionalTargetY: number;
  directionalTargetZ: number;
}
```

---

### `HorizonSettings`

Alcance do horizonte, distância dos edifícios e névoa da cena:

```typescript
type HorizonSettings = {
  distance: number;       // alcance dos edifícios à frente (padrão: 208.3)
  backDistance: number;   // alcance dos edifícios atrás da câmera (padrão: 46.2)
  renderDistance: number; // limite do horizonte: camera.far + raio do céu (padrão: 600)
  groundDistance: number; // alcance conforme modo (padrão: 660)
  groundEdgeMode: "straight" | "circular" | "square"; // GroundEdgeMode; padrão straight
  fogDensity: number;     // densidade da névoa exponencial (FogExp2, padrão: 0.007)
  fogColor: string;       // cor da névoa
}
```

`distance` e `backDistance` não alteram projeção da câmera, chão ou montanhas. [[scene-runtime#Alcance visual e distância dos edifícios|Runtime]] mantém cull dos edifícios separado do alcance visual.

`renderDistance` escreve `camera.far` e o raio da esfera do céu ([[scene-builders#loadEnvironment.ts]]) — céu sempre a `renderDistance * 0.9`, dentro do far plane. Independente de `distance`/`backDistance`: mexer no horizonte não mexe no cull dos edifícios.

`groundEdgeMode: GroundEdgeMode` seleciona `"straight" | "circular" | "square"` (padrão `straight`). `groundDistance` define distância à frente no reto, raio no disco, meio lado no quadrado. Modo reto acompanha azimute da câmera, estende laterais além do frustum; não depende de `groundDistance > renderDistance`. Não altera projeção, céu, edifícios ou relevo.

> [!note] Névoa global
> `fogDensity` e `fogColor` controlam o `THREE.FogExp2` da cena inteira — dissolvem terreno e edifícios distantes antes do far plane. Céu (`fog: false`) não recebe névoa.

---

### `RenderDirectionSettings`

Limites de carregamento de chunks por direção da câmera:

```typescript
type RenderDirectionSettings = {
  forwardDistance: number;
  sideDistance: number;
  backwardDistance: number;
}
```

> [!note] Só referência
> Consumido apenas por `createChunkManager` (arquivo de referência arquitetural). Cadeia viva (config, UI, runtime) foi removida.

---

### `EnvironmentSettings`

Configurações do ambiente HDRI/skybox:

```typescript
type EnvironmentSettings = {
  offsetX: number;  // rotação horizontal do skybox
  offsetY: number;  // deslocamento vertical (UV offset do horizonte)
  offsetZ: number;  // roll diagonal
  night: boolean;   // modo noite: céu escuro + estrelas + luz/névoa noturnas
  windowIntensity: number;  // brilho das janelas acesas (só de noite)
}
```

> [!note] `night`
> Liga/desliga pelo menu do usuário ([[area-admin#Modo noite (menu do usuário)]]). Valores da noite ficam em `NIGHT_PRESET` ([[scene-config#environmentConfig.ts]]); céu + estrelas em [[scene-builders#loadEnvironment.ts]], cena em [[scene-runtime#Modo noite]].

> [!note] `windowIntensity`
> Único knob da noite que virou setting (o resto é `NIGHT_PRESET` fixo): slider "Brilho das janelas (noite)" na seção **Ambiente** ([[html-components#EnvironmentControls.tsx]]). De dia o valor é ignorado — janela apagada. Ver [[scene-managers#Janelas acesas de noite]].

### `ReflectionSettings`

Probe de reflexo dos prédios (`CubeCamera` + `WebGLCubeRenderTarget` do runtime). Defaults em [[scene-config#reflectionConfig.ts]], UI na aba **reflexo** ([[html-components#ReflectionControls.tsx]]), mecânica em [[scene-runtime#Probe de reflexo (envMap dos prédios)]].

```typescript
type ReflectionSettings = {
  enabled: boolean;          // false → envMap null; fachada cai no scene.environment (HDRI)
  resolution: number;        // lado do cube em px, potência de 2 (64–1024); trocar recria o target
  probeX: number;            // posição da captura
  probeY: number;            // sobe = mais céu, desce = mais fachada
  probeZ: number;
  followCamera: boolean;     // probe na câmera (recaptura todo intervalo)
  skyDrop: number;           // offsetY extra do céu SÓ na captura
  envHorizon: number;        // 0–0.95; achata reflectVec.y no shader (mesma faixa de elevação em toda face)
  envRotY: number;           // graus; gira o envMap no eixo vertical (único eixo que preserva simetria)
  heightFadeStart: number; // altura onde começa a suavização
  heightFadeEnd: number;   // altura onde o desfoque chega ao máximo
  heightBlur: number;      // rugosidade mínima na altura máxima (0–1)
  reflectionDistanceStart: number; // distância horizontal com reflexo completo
  reflectionDistanceEnd: number;   // distância onde o reflexo desaparece
  updateInterval: number;    // frames entre capturas
  continuous: boolean;       // recaptura mesmo sem mudança na cena
  includeGround: boolean;    // plano cinza + relevo entram na captura
  includeCityFloor: boolean; // asfalto, calçada e lotes entram na captura
}
```

> [!warning] Intensidade não mora aqui
> `envMapIntensity`, `roughnessIntensity` e `metalnessIntensity` são do **material** ([[scene-types#TextureSettings]]) — a aba **reflexo** edita os mesmos campos que a aba **texturas**, sem estado duplicado.

### `UIVisibilitySettings`

Liga/desliga componentes HTML sobrepostos na tela. Persistido em `localStorage`. Defaults e helpers de load/save em [[scene-config#uiVisibilityConfig.ts]]. Controlado pela aba **tela** do painel.

```typescript
type UIVisibilitySettings = {
  cameraLog: boolean;        // log de posição da câmera (canto inferior esquerdo)
  donationInput: boolean;    // input de doação individual
  bulkInput: boolean;        // input de geração em lote (mín/máx/qtd)
  blockLayoutInput: boolean; // input de configuração de quadras
  donationFilter: boolean;   // barra de filtros das doações (região/UF/cidade/ONG)
  buildingLayoutCard: boolean; // card flutuante de organização/quantidade dos edifícios
  contributeButton: boolean; // botão Contribuir
  referralHud: boolean;      // placa da marca/indicação
  myBuildingsButton: boolean; // botão Meus edifícios
  menuButton: boolean;      // menu da conta/compartilhar ou controles deslogados
}
```

## Tipos de Métricas

### `SceneStats`

Métricas enviadas de volta para o React para exibição no painel:

```typescript
type SceneStats = {
  buildings: number;         // prédios ativos na cena
  culled: number;            // prédios ocultos por distância e/ou frustum
  performance?: {
    fps: number; frameTimeMs: number;
    drawCalls: number; triangles: number;
    geometries: number; textures: number; programs: number;
  };                        // FPS real; contagens do último frame, incluindo capturas
  fpsMode: string;           // modo FPS atual
  chunks: number;            // chunks carregados
  sceneReady: boolean;       // frame com HDRI resolvido, shaders prontos, doações aplicadas e nenhuma textura baixando
}
```

`sceneReady` libera a página de loading no `CitySceneEditor` ([[html-components#Carregamento inicial (casca)]]). Não monotônico: volta a `false` quando o `DefaultLoadingManager` começa a baixar. Sem WebGL o hook emite `true`. Ver [[scene-runtime#Desempenho (TBT e celular)]].

## Tipos de Personalização

### `RooftopType`

Tipos de estrutura que podem ser colocados no topo de um edifício:

```typescript
type RooftopType =
  | "none"           // sem estrutura
  | "spotlights"     // 4 holofotes com feixe de luz para cima
  | "helipad"        // heliponto realista com pintura e luzes de perímetro
  | "garden"         // jardim suspenso com deck, vegetação e piscina
  | "helicopter"     // helicóptero leve low-poly realista pousado no topo
```

### `EdgeLightType`

Estilos de iluminação aplicáveis às arestas do edifício:

```typescript
type EdgeLightType =
  | "none"           // sem LED
  | "led"            // 4 arestas verticais (cantos) + 4 arestas no topo formando retângulo
```

### `BuildingShape`

Formato volumétrico do edifício:

```typescript
type BuildingShape =
  | "default"        // caixa padrão renderizada via InstancedMesh
  | "twisted"        // torre torcida (estilo Cayan Tower) — 90° de twist do chão ao topo
  | "octagonal"      // torre com planta octogonal regular
  | "setback"        // torre em patamares recuados
  | "tapered"        // torre afunilada
  | "chrysler"       // torre art déco inspirada no Chrysler Building
  | "hearst"         // torre facetada com diagrid inspirada na Hearst Tower
  | "empire"         // torre art déco inspirada no Empire State Building
  | "taipei"         // torre em módulos empilhados inspirada no Taipei 101
  | "one-trade"      // torre facetada com base chanfrada e pináculo One Trade
  | "yachthouse"     // Yatchcasa: torres gêmeas de vidro azul-escuro, linhas douradas, coroamento recuado
  | "residential"    // torre residencial: sacadas, guarda-corpo de vidro, aletas terracota
  | "apartment"      // torre de reboco branco: janelas em grade, rasgo de sacadas, caixa d'água
  | "gourmet"        // Varanda Gourmet: torre bege e creme, sacadas curvas, pilastras com rasgo
  | "loft"           // Loftifício: torre bege, faixas de pastilha verde, pilotis, portões
```

Quando `buildingShape !== "default"`, a doação é desenhada como um `Mesh` próprio (ver [[scene-builders]]) e pula a alocação no `InstancedMesh`. O manager mantém clones de material (facade + top) por edifício customizado.

### `BuildingCustomization`

Personalização visual de um edifício individual:

```typescript
type BuildingCustomization = {
  color: string;              // cor hex do edifício
  buildingShape: BuildingShape; // formato volumétrico
  textureKey: string | null;  // pasta de textura da fachada (value do catálogo). null = herda a global
  tilingScale: number;        // multiplicador de tiling da textura (1.0 = global, 2.0 = texturas 2× menores, etc)
  textureTransform: {
    scaleX: number;           // escala horizontal da textura no edifício
    scaleY: number;           // escala vertical da textura no edifício
    offsetX: number;          // deslocamento horizontal da textura
    offsetY: number;          // deslocamento vertical da textura
  };
  rooftopType: RooftopType;   // acessório de topo ou none
  signText: string;           // texto do letreiro na fachada (vazio = sem letreiro)
  signSides: number;          // quantos lados exibem o letreiro (1–4)
  edgeLightType: EdgeLightType; // LED nas arestas ou none
}
```

Armazenada opcionalmente em cada `DonationEntry`. Cada campo controla um aspecto visual independente:

| Campo | Efeito | Implementação |
|---|---|---|
| `color` | Cor individual do edifício | `InstancedBufferAttribute` (instanceColor) quando o prédio fica no `InstancedMesh`; cor direta no clone do material quando vira mesh próprio |
| `buildingShape` | Formato volumétrico do edifício | `default`: caixa padrão; demais valores usam builders dedicados em [[scene-builders]] |
| `textureKey` | Textura de fachada **só desse edifício** | Continua instanciado: cada textura do catálogo tem seu próprio `InstancedMesh` ([[scene-managers#Grupos de fachada]]), então o prédio só troca de grupo. `null` = herda a global (ou a sorteada, ver [[scene-textures#Sorteio por edifício]]). Só vira `Mesh` próprio se a pasta estiver fora do pool do catálogo |
| `tilingScale` | Multiplicador de tiling da textura aplicado **só nesse edifício** | Faz o prédio sair do `InstancedMesh` (quando ≠ 1.0) e virar `Mesh` próprio com clone de material e uniform `uTilingMultiplier` dedicado |
| `textureTransform` | Ajuste manual da textura aplicado **só nesse edifício** | Faz o prédio sair do `InstancedMesh` quando diferente do padrão e ajusta `scaleX`, `scaleY`, `offsetX`, `offsetY` via uniform dedicado |
| `rooftopType` | Acessório 3D no topo do edifício | `THREE.Group` criado por [[scene-builders#createRooftopMesh.ts\|createRooftopMesh]], posicionado no topo |
| `signText` | Texto da marca/empresa na fachada | `CanvasTexture` + `PlaneGeometry` criados por [[scene-builders#createSignMesh.ts\|createSignMesh]] |
| `signSides` | Em quantas fachadas o letreiro aparece | 1=frente, 2=+trás, 3=+direita, 4=todos os lados |
| `edgeLightType` | LED contornando as arestas do edifício | `THREE.Group` criado por [[scene-builders#createEdgeLightMesh.ts\|createEdgeLightMesh]] (core + halo aditivo) |

Todos gerenciados pelo [[scene-managers|DonationManager]]. A customização é propagada pelo pipeline: `CitySceneEditor` → `CitySceneCanvas` → `useCityScene` → `runtime` → `donationManager.updateDonationCustomization()`.

---

## Tipos de Dados da Cena

### `DonationEntry`

Representa uma doação individual:

```typescript
type DonationEntry = {
  id: number;
  value: number;
  customization?: BuildingCustomization;  // personalização visual opcional
}
```

---

### `ChunkData`

Representa um chunk já criado na cidade (usado no [[scene-managers|ChunkManager]]):

```typescript
type ChunkData = {
  key: string;
  mesh: THREE.InstancedMesh;
  count: number;
  centers: Float32Array;
  heights: Float32Array;
  scales: Float32Array;
}
```

---

### `CameraVisibilityState`

Estado usado para detectar se a câmera mudou o suficiente para exigir nova sincronização de chunks:

```typescript
type CameraVisibilityState = {
  x: number;
  z: number;
  forwardX: number;
  forwardZ: number;
}
```

## Tipo de Infraestrutura

### `CitySceneConfig`

Descreve a estrutura esperada para a config global da cena. Garante consistência de `citySceneConfig.ts`.

`far: number` = alcance visual da câmera principal. `reflectionFar: number` = alcance independente da CubeCamera; ampliar horizonte não amplia captura dos reflexos. `liteDprCap` = teto de DPR no modo leve; `liteFps` = alvo da resolução dinâmica, sem limitar o rAF.

Ver campos completos em [[scene-config#citySceneConfig.ts ⭐]].

## Regra Prática

> [!tip]
> Sempre que um dado precisar viajar entre mais de uma camada, ele deve virar um tipo centralizado aqui.

Quando criar um novo tipo:
- Nova seção do painel que sincroniza com o runtime → `types.ts`
- Novo manager que precisa receber nova configuração → `types.ts`
- Novo campo na config global → `types.ts` + `citySceneConfig.ts`

`SceneStats.performance` é emitido a cada amostra de aproximadamente 0,5 s de frames consecutivos. Pausas não alimentam a média; o diagnóstico inclui o tempo de capturas (apenas o scaler de resolução filtra esse custo); contagens de texturas/geometrias não representam bytes de VRAM. Não muda o limite de FPS nem a resolução.
