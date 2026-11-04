---
title: Scene Utils
tags:
  - cidoe
  - utils
  - funções puras
aliases:
  - Utilitários
  - Utils
---

# Scene Utils

Funções puras e reutilizáveis em `src/scene/utils/`.

> [!abstract] Filosofia
> Um utilitário recebe dados, calcula algo e devolve um resultado. Sem criar UI, sem controlar ciclo de vida da cena.

## Como Saber se Algo Vai para Utils

> [!tip] Regra de ouro
> Se a função pode ser entendida **sem saber onde ela será renderizada**, provavelmente pertence a `utils`.

**Bons exemplos para utils:**
- Fórmula de intensidade solar
- Cálculo do raio de busca
- Mapeamento de tipo de material para valores

**Ruins para utils (pertencem a outras pastas):**
- Montar um `Mesh` → [[scene-builders]]
- Ligar eventos de resize → [[scene-runtime]]
- Controlar cleanup do renderer → [[scene-runtime]]

## Arquivos

### `math.ts`

Funções matemáticas genéricas:

| Função | Descrição |
|---|---|
| `clamp(value, min, max)` | Limita um valor entre mínimo e máximo |
| `getSearchRadius(...)` | Calcula raio de busca de chunks |

Use quando a lógica for matemática e genérica.

---

### `materials.ts`

Mapeamento de material do chão:

| Função | Descrição |
|---|---|
| `getGroundMaterialValues(type)` | Transforma `GroundMaterialType` em valores reais de `roughness` e `metalness` |

**Exemplos:**
- `"matte"` → roughness alto, metalness baixo (fosco)
- `"polished"` → roughness baixo (polido)

Relacionado a: [[scene-types#GroundMaterialType]]

---

### `lighting.ts`

Funções de cálculo de iluminação:

| Função | Descrição |
|---|---|
| `getDirectionalPositionFromAngles(distance, elevation, azimuth)` | Converte ângulos esféricos em posição 3D da luz direcional |
| `getSolarIntensityFromElevation(elevation)` | Calcula intensidade solar baseada na elevação |
| `getDynamicAmbientIntensity(elevation)` | Calcula intensidade ambiente dinâmica |
| `getLightMetrics(settings)` | Deriva métricas de luz a partir de `LightSettings` |

> [!tip]
> Se quiser alterar fórmulas de luz, este é o arquivo certo.

---

### `random.ts`

Utilitários de geração procedural:

| Função | Descrição |
|---|---|
| `fract(x)` | Parte fracionária de um número |
| `seeded(seed)` | Gerador de números pseudoaleatórios por seed |
| `pickIndex(id, salt, length)` | Índice determinístico em `[0, length)` a partir de um id — sorteio estável (mesmo id, mesmo item). `length <= 0` → `0`. Usado no sorteio de textura por edifício ([[scene-textures#Sorteio por edifício]]); coberto pelos asserts de `devAssertions.ts` |

O [[scene-managers|ChunkManager]] usa essas funções para definir, de forma **determinística por chunk**:
- densidade dos prédios
- altura
- forma
- offsets de posição

> [!note] Por que seeded?
> Com seeds baseadas na posição do chunk, a cidade sempre gera os mesmos prédios nas mesmas posições, mesmo após rebuild.

---

### `instanceCulling.ts`

Cull de distância e frustum para `InstancedMesh` do chão da cidade (lotes, calçadas, postes, asfalto). Mesmo esquema dos prédios: matriz lógica fica em snapshot, buffer renderizado leva só as visíveis.

| Função | Descrição |
|---|---|
| `snapshotInstances(meshes, count)` | Congela matrizes já escritas nos meshes. Deriva posição XZ da translação do primeiro mesh. Retorna `InstanceCullGroup` (ou `null` se `count === 0`) |
| `cullInstances(group, visible, frustum?)` | Compacta as instâncias aprovadas por distância e, quando fornecido, frustum; ajusta `count`. Retorna quantas sumiram |
| `restoreInstances(group)` | Devolve todas as instâncias — probe de reflexo captura cidade inteira |

Meshes do mesmo grupo compartilham índice lógico: poste + luminária + mancha de luz são a **mesma** instância vista de três meshes, somem juntos.

> [!note] Por que compactar em vez de `visible = false`
> Cada grupo é 1 draw call. Esconder o mesh sumiria com a cidade toda; zero-scale ainda gastaria vertex shader. Compactar corta vértice de verdade.

Usado por [[scene-managers|createDonationManager]]. Relacionado: [[scene-runtime#Horizonte]].

---

### `deviceTier.ts`

| Export | Descrição |
|---|---|
| `IS_LOW_TIER` | Toque (`pointer: coarse`) OU ≤4 núcleos OU ≤4 GB. Lido uma vez. Runtime liga o modo leve (sem MSAA, DPR 1,5, sem cube camera), com FPS seguindo o rAF e alvo do scaler em 60; manifesto de texturas usa `.low.webp` |
| `isSoftwareGL(gl)` | Renderer WebGL na CPU (SwiftShader, llvmpipe, softpipe, WARP/"Basic Render"), via `WEBGL_debug_renderer_info` (ou `RENDERER`). Runtime desiste: sem `KHR_parallel_shader_compile` cada shader PBR trava segundos |

Usado por [[scene-runtime#Desempenho (TBT e celular)]] e [[scene-textures]].

---

### `devAssertions.ts`

Verificações de desenvolvimento com `console.assert`:

| Função | Descrição |
|---|---|
| `runDevAssertionsOnce()` | Roda uma única vez na criação do runtime |

Ajuda a detectar regressões em utilitários básicos durante o desenvolvimento.
Chamado pelo [[scene-runtime|createCitySceneRuntime]] na inicialização.

### Buffers e limites do culling

`snapshotInstances` guarda índices visíveis e esferas que contêm todas as peças de cada instância (incluindo o halo do poste). Meshes do piso mantêm transformações locais fixas; o movimento está nos buffers. A esfera global continua conservadora após compactação.

`cullInstances` compara a sequência visível anterior: conjunto idêntico não copia nem sinaliza upload. Prefixo preservado não é reenviado; `addUpdateRange` marca somente a cauda alterada, sem apagar intervalos ainda pendentes na GPU. Zero instâncias ajusta apenas `count`. `restoreInstances` usa o mesmo caminho, inclusive ao restaurar o cubemap. Teste: `scripts/check-mobile-performance.mjs`.
