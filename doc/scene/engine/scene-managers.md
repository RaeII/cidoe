---
title: Scene Managers
tags:
  - cidoe
  - managers
  - threejs
  - procedural
  - doação
aliases:
  - Managers
  - DonationManager
  - ChunkManager
---

# Scene Managers

Coordenadores de partes da cena com estado interno em `src/scene/managers/`.

## Objetivo da Pasta

Managers cuidam de partes da cena que têm **estado interno** e **comportamento contínuo**. Em vez de colocar toda a lógica procedural dentro do [[scene-runtime|runtime]], o projeto separa as áreas mais complexas aqui.

## Arquivos

### `createDonationManager.ts` ⭐ (Manager Principal)

Manager principal da cena atual. Gerencia os prédios como representações visuais de doações.

**Responsabilidades:**
- Manter a lista de doações (`DonationEntry[]`) ordenada por valor decrescente
- Criar e atualizar um único `InstancedMesh` com capacidade para até 500 prédios
- Posicionar prédios em **espiral quadrada** a partir do centro
- Calcular altura proporcional ao valor máximo
- Aplicar texturas PBR de fachada (cor, normal, roughness, metalness, displacement, emissive) — fachada **e** topo vêm do loader lazy + assíncrono + cache ([[scene-textures]]). Nenhuma textura é descartada no `dispose` (cache compartilhado)
- Atualizar materiais em tempo real
- Gerenciar envMap dinâmico via cube camera

#### Layout dos Prédios — 2 Modos

`blockLayoutSettings.centerTallest` escolhe como as doações ocupam os slots. Quadras, ruas, calçadas e lotes vazios são **idênticos** nos dois modos — só a posição e a altura dos edifícios mudam.

| Modo | `centerTallest` | Posição | Altura |
|---|---|---|---|
| **Por quadra** (padrão) | `false` | Três camadas: topo agrupado por quadra, meio nas quadras centrais, baixo nas de fora | Três faixas encaixadas |
| **Mais alto no centro** | `true` | Gradiente global: maior doação no slot central exato da cena, decrescendo pra borda | Régua única, direta do valor |

##### Modo por quadra — Sistema de 3 Camadas

Doações ordenadas por valor decrescente e cortadas em três camadas. Cada uma ganha uma **faixa de altura própria** e um **critério de posição** próprio:

| Camada | Seleção | Faixa de altura | Posição |
|---|---|---|---|
| **Topo** | Top `towerRatio` (padrão 33%) | `baseHeightCap × maxSceneHeight` → `maxSceneHeight` (11.2 → 16) | `towersPerBlock` por quadra (padrão 14), quadras em espiral do centro pra fora |
| **Meio** | Metade do que sobrou (~33%) | metade da faixa de baixo → `baseHeightCap × maxSceneHeight` (5.8 → 11.2) | Sorteio determinístico, mas preenche **quadras centrais primeiro** |
| **Baixo** | Resto (~34%) | `minBuildingHeight` → metade (0.5 → 5.8) | Sorteio determinístico nas quadras que sobraram |

**Faixas encaixadas, não sobrepostas.** Cada camada ocupa um trecho exclusivo da régua e dentro dela a altura é proporcional ao valor. Consequência: quem doou mais **nunca** ganha prédio mais baixo que quem doou menos, em qualquer formato de distribuição.

> [!warning] Por que não normalizar cada camada pelo próprio máximo
> O modelo antigo media cada camada contra o maior valor **dela mesma**. O primeiro prédio da camada de baixo então batia sempre no teto da própria faixa, independente do valor. Com doação de cauda longa (poucos doadores grandes, muitos pequenos) o degrau **invertia**: o último do topo saía 18× mais baixo que o primeiro do meio, com valores praticamente iguais. As faixas encaixadas eliminam isso por construção.

**Posição da camada do meio.** A camada do meio é sorteada separada da de baixo e concatenada **na frente** dela. As etapas A/B de preenchimento vão do centro pra fora, então a ordem do array vira ordem geográfica — o meio ocupa as quadras centrais, o resto sobra pras de fora. Prêmio de posição para quem ficou logo abaixo do corte do topo.

**Geometria de uma quadra (blockSize=8, 64 slots):**

```
[ ▪ ][ ▫ ][ █ ][ ▪ ][ ▫ ][ ▪ ][ █ ][ ▫ ]   █ = topo (14 por quadra, faixa alta)
[ ▫ ][ █ ][ ▪ ][ ▫ ][ █ ][ ▫ ][ ▪ ][ ▪ ]   ▫ = meio (faixa média, quadras centrais)
[ ▪ ][ ▪ ][ ▫ ][ █ ][ ▪ ][ █ ][ ▫ ][ ▪ ]   ▪ = baixo (faixa baixa, quadras de fora)
                    ⋮
```

Quadra central é **7×7 = 49 slots** (grade ímpar na mesma pegada) — ver [[#Destaque da Quadra Central]].

**Cálculo de espaçamento:**
```
blockFootprint = (blockSize - 1) × slotSize
blockSpacing   = blockFootprint + streetWidth
```

**Configurado por [[scene-types#BlockLayoutSettings]] (editável em tempo real):**
- `blockSize` — prédios por lado (padrão: 3 → 9 slots/quadra)
- `streetWidth` — espaço entre quadras (padrão: 6.0)
- `towerRatio` — fração da camada de topo (padrão: 0.33 = 33%)
- `towersPerBlock` — quantos do topo por quadra (padrão: 14). Controla o **espalhamento**: valor baixo força mais quadras e deixa a cidade vazada; ~`blockSize² × towerRatio` (≈21) deixa densa
- `baseHeightCap` — onde começa a faixa do topo, como fração de maxSceneHeight (padrão: 0.70 = 70%). Também é o teto da camada do meio

##### Modo mais alto no centro

Primeira ideia do projeto, mantida como opção pra comparação. Sem camadas, sem shuffle, sem boost por anel de quadra.

1. Junta todos os slots das quadras expandidas numa lista única, cada um com `d²` até a origem da cena.
2. Ordena por `d²` crescente (sort estável — empate dentro da quadra bate com a ordem de colocação).
3. `donations` já vem por valor decrescente → doação `i` vai pro slot `i` dessa lista.
4. Altura = range completo pra todo mundo: `minBuildingHeight + (value / maxValue) × (maxSceneHeight − minBuildingHeight)`.

Como a quadra central usa grade **ímpar** (ver [[#Destaque da Quadra Central]]), existe slot exato em `[0, 0]` — a maior doação da cena cai nele. Altura vira função direta do valor e valor decresce com a distância → nenhum prédio baixo no meio dos altos.

`towerRatio`, `towersPerBlock`, `baseHeightCap` e os boosts de torre (`CENTRAL_BLOCK_TOWER_*`, `INNER_RING_TOWER_HEIGHT_BOOST`) não têm efeito nesse modo. Quantidade de quadras vem de `ceil((donations.length + centralDeficit) / buildingsPerBlock)`, arredondada pro próximo anel completo.

```
        ▪ ▪ ▪ ▪ ▪          ▪ = mais baixo (borda)
      ▪ ▫ ▫ ▫ ▫ ▫ ▪
      ▪ ▫ ▄ ▄ ▄ ▫ ▪        ▄ = médio
      ▪ ▫ ▄ █ ▄ ▫ ▪        █ = maior doação, centro exato
      ▪ ▫ ▄ ▄ ▄ ▫ ▪
      ▪ ▫ ▫ ▫ ▫ ▫ ▪
        ▪ ▪ ▪ ▪ ▪
```

A cada nova doação ou mudança de layout, a lista é reordenada e **todas as instâncias são reconstruídas**.

#### Fórmula de Altura

```
height = boostDaQuadra × (minBuildingHeight + (valor / maxValor) × (maxSceneHeight - minBuildingHeight))
```

| Constante | Valor | Descrição |
|---|---|---|
| `minBuildingHeight` | `0.5` | Mínimo visual para qualquer doação |
| `maxSceneHeight` | `16` | Cap visual da cidade normal (`boostDaQuadra = 1`) |

`boostDaQuadra` = 1 na cidade toda, exceto nas torres do centro (ver abaixo). Base urbana nunca leva boost.

> [!tip] Para ajustar os limites
> Edite `DONATION_LAYOUT` em `createDonationManager.ts`.

#### Destaque da Quadra Central

Quadra do índice 0 da espiral (`bx = bz = 0`) é a vitrine da cena. Só **torres** mudam — base urbana igual em toda cidade. Boosts de altura/largura valem só no modo **por quadra**; no modo **mais alto no centro** a grade ímpar continua (garante slot em `[0, 0]`), mas sem boost.

**Grade ímpar na mesma pegada.** `getBlockSlotOffsets(size, slotSize?)` aceita espaçamento próprio. Quadra central usa `blockSize - 1` quando `blockSize` é par (8 → 7), com `slotSize = blockFootprint / (centralSize - 1)` (3.2 → 3.733). Resultado:

- existe **slot exato no centro** (`[0, 0]`, índice 0 da lista ordenada por distância) → maior doação da cena cai nele, não em slot embaralhado
- espaçamento maior → torre cabe mais larga sem colidir (`CENTRAL_BLOCK_TOWER_WIDTH_BOOST = 1.15`; largura máx. `2.6 × 1.15 = 2.99` < `3.733`)
- pegada e `blockSpacing` **não mudam** → asfalto, calçada e quadras vizinhas ficam intactos
- capacidade cai (64 → 49). `capacityOf(b)` devolve a capacidade certa por quadra; o déficit entra no cálculo de `baseBlocksNeeded`, então a base excedente vai pras outras quadras em vez de estourar slot

```
[ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ]
[ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ]
[ ▪ ][ ▪ ][ █ ][ ▪ ][ █ ][ ▪ ][ ▪ ]   █ = torre (boost 1.3→1.9, +15% largura)
[ ▪ ][ ▪ ][ ▪ ][ ▓ ][ ▪ ][ ▪ ][ ▪ ]   ▓ = maior doação da cena, slot exato do centro
[ ▪ ][ █ ][ ▪ ][ ▪ ][ ▪ ][ █ ][ ▪ ]   ▪ = base urbana (sem boost)
[ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ]
[ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ][ ▪ ]
```

**Boost de altura por anel de quadra** (`blockRing = max(|bx|, |bz|)`):

| Anel | Torres | Boost de altura |
|---|---|---|
| 0 (quadra central) | top `towersPerBlock` doações da cena | `1.3 → 1.9`, interpolado pelo valor dentro da quadra |
| 1 (quadras ao redor) | próximas torres | `1.15` fixo |
| 2+ (resto) | resto das torres | `1` (inalterado) |

Boost da central é **range**, não valor fixo: `MIN + (valor - menorTorreDaQuadra) / spanDaQuadra × (MAX - MIN)`. Isso **estica** a diferença de altura entre as maiores doações — sem isso as 8 maiores ficam quase da mesma altura quando os valores são próximos. Span 0 (todas iguais) → todas em `MAX`.

Ordem nunca inverte: piso da central (`1.3`) > anel 1 (`1.15`) > resto (`1`), e torres chegam por valor decrescente, então quadra mais central sempre tem valor ≥ quadra de fora.

> [!tip] Para ajustar o destaque
> Constantes `CENTRAL_BLOCK_TOWER_WIDTH_BOOST`, `CENTRAL_BLOCK_TOWER_HEIGHT_BOOST_MIN/MAX` e `INNER_RING_TOWER_HEIGHT_BOOST` no topo de `createDonationManager.ts`. Manter `MIN > INNER_RING > 1`.

#### Materiais

O manager usa um único par de materiais para prédios e um material de asfalto para as ruas:

| Material | Tipo | Descrição |
|---|---|---|
| `facadeMaterial` | `MeshPhysicalMaterial` | Textura de fachada com shader triplanar + cube envMap dinâmico. `clearcoat 1.0` / `clearcoatRoughness 0.02` — verniz que dá o brilho de vidro nas quinas; sem ele a fachada fica fosca mesmo com envMap. É o material do **grupo 0**; cada outra textura em uso ganha um clone (ver [[#Grupos de fachada]]). `getAllFacadeMaterials()` devolve todos — é por ele que noite, envMap, reflexo e settings alcançam os clones |
| `topMaterial` | `MeshPhysicalMaterial` | Textura de concreto para o topo dos prédios; mesmo clearcoat da fachada. Cor fixa `TOP_CEMENT_COLOR` (`#b9b6b1`) — laje não segue a cor do edifício nem a da customização |
| `focusFacadeMaterial` | `MeshPhysicalMaterial` | Clone do facadeMaterial para o edifício em destaque (opacidade total quando o instanced mesh fica semitransparente) |
| `focusTopMaterial` | `MeshPhysicalMaterial` | Clone do topMaterial para o edifício em destaque |
| `asphaltMaterial` | `MeshStandardMaterial` | Cor escura (#18191c), roughness 0.92 — usado nas faixas de asfalto entre quadras |
| `sidewalkTopMaterial` | `MeshStandardMaterial` | Cor do topo da calçada (de `blockLayoutSettings.sidewalkColor`, padrão #9a9da3), roughness 0.95 — face superior do meio-fio |
| `sidewalkSideMaterial` | `MeshStandardMaterial` | Cor das laterais da calçada (de `blockLayoutSettings.sidewalkSideColor`, padrão #55575c, mais escura) — dá efeito de sombra p/ enxergar a altura. O `sidewalkGeometry` remapeia os grupos de face (topo → material 0, laterais+base → material 1) |
| `lotMaterial` | `MeshStandardMaterial` | Cor das quadras (de `blockLayoutSettings.lotColor`, padrão #5b5048), roughness 0.98 — tile de lote vazio. `onBeforeCompile` injeta borda escura (`vLotPos`) demarcando cada lote, mantendo luz + sombra |

`applyFacadeMaterial` e `applyTextureToTop` só mantêm mapas cujo efeito está ativo. `normalScale = 0`, `roughnessIntensity = 0`, `emissiveIntensity = 0` e `displacementScale = 0` retiram os respectivos mapas/defines do shader. Exceção: `bumpMap` recebe sempre o mapa de displacement (`bumpScale 1`) — relevo de shading, sem custo de vértice, independente do `displacementScale`; mudanças apenas de uniform não forçam `material.needsUpdate`. A caixa padrão e a calçada reordenam os índices do `BoxGeometry` em dois grupos reais (laterais/base + topo), em vez de conservar os seis draws originais.

#### Janelas acesas de noite

`setNight(night, windowIntensity)` faz duas coisas: acende parte das janelas (brilho = slider "Brilho das janelas (noite)", [[html-components#EnvironmentControls.tsx]]; `uNightWindow = 0` de dia) e derruba o reflexo da fachada para `NIGHT_PRESET.facadeEnvMapIntensity` (0.6). O slider "Intensidade na fachada" (aba **reflexo**, padrão 4.8) vale **só de dia** — é override em `facadeEnvMapIntensity(settings)`, não escrita no settings, então o valor do painel volta intacto ao amanhecer. Usado em `applyFacadeMaterial` **e** em `endEnvCapture` (que restaura o intensity depois da captura do cube); mexer num sem o outro devolve o valor diurno no primeiro reflexo recapturado.

Acende **parte** das janelas da fachada. Só fachada — `applyTriplanarShader` liga o trecho quando `cacheKey.includes("facade")`, então clones de shape custom herdam sem tocar call site; topo fica fora.

- **Máscara de vidro = `metalnessMap` da própria fachada** (`Facade006_1K-PNG_Metalness.png`: branco no vidro, preto no caixilho). Zero textura nova na GPU. Sem `metalnessMap` (`metalnessIntensity = 0`) não tem janela acesa.
- **Grade `vec2(14.0, 8.0)`** = janelas por tile da textura padrão (medido no PNG: 14 colunas de 73px, 8 linhas de 128px, alinhadas com a borda do tile). `floor(vMetalnessMapUv * grade)` = ID da célula.
- **Hash da célula** decide acesa/apagada (`step(hash, NIGHT_PRESET.windowLitFraction)`). `vMetalnessMapUv` é triplanar de **mundo** → padrão diferente por prédio de graça e estável entre frames (sem cintilar).
- Soma em `totalEmissiveRadiance` depois de `#include <emissivemap_fragment>`, independente do `emissiveIntensity` do painel. Uniform `uNightWindow` = `environmentSettings.windowIntensity` de noite, `0` de dia → arrastar o slider e trocar dia/noite são só uniform, sem recompilar shader.

> [!note] Outra textura de fachada
> Grade é fixa em 14×8. Fachada com outra contagem de janela por tile ainda acende só no vidro (máscara é da própria textura), mas a célula agrupa/parte janelas — acende em blocos.

#### Rede de Estradas (Asfalto)

Como o loteamento tem piso mínimo `r ≥ MIN_LOTEAMENTO_RADIUS` (= 1), há sempre mais de um bloco. `rebuildRoads(r, blockSpacing, streetWidth)` agrega todas as vias em **dois `InstancedMesh`** — um pro asfalto e outro pro tracejado, ambos sobre o mesmo plano unitário (`roadSegmentGeometry`) escalado por instância:

- **Faixas longitudinais** (correm na direção Z): posicionadas em `x = (bx + 0.5) × blockSpacing` para cada gap entre colunas de blocos
- **Faixas transversais** (correm na direção X): posicionadas em `z = (bz + 0.5) × blockSpacing` para cada gap entre linhas de blocos
- Largura útil da pista = `streetWidth − SIDEWALK_RESERVE` (= `streetWidth − 3.6`) — asfalto estreito; o resto da rua vira calçada
- Comprimento = `2 × r × blockSpacing + blockFootprint` — estende até a **borda externa das quadras mais externas**, pra o asfalto chegar ao final do loteamento (não para nas interseções internas)
- Y = -0.015 (acima do ground plane em -0.03, abaixo dos prédios em 0)
- Cache: se `r`, `blockSpacing` e `streetWidth` não mudaram, `rebuildRoads` retorna imediatamente
- As faixas são recriadas toda vez que `rebuildInstances` muda o anel `r` ou os parâmetros de layout
- A quantidade de vias aumenta apenas o número de instâncias; não cria um `Mesh`/material por linha
- **Fatiada em segmentos:** cada via vira `2r + 1` segmentos (≈ 1 por fileira de quadras) em vez de uma tira contínua. Granularidade pro cull de distância sumir com a rua longe da câmera — tira contínua era tudo-ou-nada. Segmentos vizinhos se sobrepõem 0.002 (coplanares e da mesma cor → z-fighting invisível; costura de gap de arredondamento não seria)

**Faixa central (tracejado):** um único `ShaderMaterial` (`dashFS`) desenha todas as linhas. A instância já tem a largura final da faixa (`roadWidth × 0.02`), evitando rasterizar a pista inteira para descartar 98% dos fragmentos. O VS deriva a coordenada ao longo da via (`vDashAlong`) da posição da **instância** — eixo da via = aquele em que o segmento é comprido (`length(instanceMatrix[0].xyz)` vs `[2]`) —, então os segmentos desenham tracejado contínuo como se fossem uma tira só. O FS apaga vãos (85%, ciclo `dashSpacing` em unidades de mundo) e cruzamentos (`distInter < interHalf`, `interHalf = roadWidth/2 + 0.15`).

**Calçadas (`rebuildSidewalks`):** moldura de concreto elevada **estreita** em volta de **cada quadra**, no vão entre o lote e o asfalto.

- Calçada ocupa o vão entre a **borda externa dos lotes** (`blockFootprint/2 + (slotSize−0.5)/2`) e a **borda do asfalto** (`blockSpacing/2 − roadWidth/2`) → bem mais estreita que o asfalto e **nunca sobe na quadra**
- `SIDEWALK_GAP` (0.25) = respiro de chão livre entre a borda do lote e a calçada (`innerHalf = lotEdge + SIDEWALK_GAP`); calçada continua encostando no asfalto (meio-fio)
- 4 tiras de `BoxGeometry` por quadra num único `InstancedMesh` (`sidewalkMesh`) — N/S cobrem os cantos (largura total `2×outerHalf`), L/O ficam entre os cantos (`2×innerHalf`)
- As molduras **quebram naturalmente nos cruzamentos** (cantos das quadras), deixando o asfalto perpendicular passar livre — por isso é moldura por-quadra, não tira contínua
- Elevação: topo da calçada vem de `blockLayoutSettings.sidewalkHeight` (padrão 0.12 → degrau ~0.13 acima do asfalto -0.015 e dos lotes -0.012). Fundo fixo em `SIDEWALK_BOTTOM = -0.08` (abaixo do terreno -0.04 p/ não flutuar); espessura do box = `sidewalkHeight − SIDEWALK_BOTTOM`
- Capacidade cresce sob demanda (mesmo padrão dos lotes); `count = 0` quando não cabe calçada (`sidewalkWidth ≤ 0`)
- `dispose()` libera `sidewalkGeometry`/`sidewalkTopMaterial`/`sidewalkSideMaterial`

#### Postes de Luz (`rebuildStreetLamps`)

**8 por quadra** — 2 por lado (a 1/4 e 3/4 do lado), e só nos lados que **dão pra uma rua** (quadra da borda não ganha poste virado pro vazio). 1 por lado deixava a rua quase toda escura; 4+ virava alameda de poste. Chamado por `rebuildRoads` depois de `rebuildSidewalks`, e no rebuild localizado de `sidewalkHeight` (poste assenta no topo do meio-fio).

- **Escala** — cena tem prédio de 2.0 de largura e até 16 de altura → 1 unidade ≈ 10 m. Poste `LAMP_HEIGHT = 1.0` (~10 m, altura real de poste de rua); 2+ ficaria torre de estádio.
- **Posição** — meio da faixa de calçada, de `curbBand(blockSpacing, streetWidth, roadWidth)` (helper compartilhado com `rebuildSidewalks`: `innerHalf` = borda dos lotes + respiro, `outerHalf` = borda do asfalto). Base em `sidewalkHeight`, luminária na ponta, deslocada 0.12 pro lado da rua e girada 90° no lado N/S.
- **3 InstancedMesh** — poste (cilindro 6 lados), luminária (box) e mancha de luz (plano deitado). 3 draw calls pra cidade inteira; capacidade cresce sob demanda, `count = 0` quando `r = 0` (quadra única, sem rua).
- **Luz = decal aditivo, não `PointLight`** — 200+ postes = 200+ luzes reais, e a contagem de luzes entra na chave de cache do programa (acender/apagar recompilaria tudo). Plano de 4.0 de lado com queda radial ao quadrado, `AdditiveBlending`, `depthWrite: false`, empurrado 55% do caminho até o eixo da via (100% faria as duas calçadas somarem no mesmo ponto = risco quente no meio da rua).
- **Névoa entra no shader da mancha** (`fog: true` + spread de `THREE.UniformsLib.fog` → o three preenche `fogDensity` por frame). Aditivo tem que apagar em direção ao **preto**, não à cor da névoa, senão poste distante fica bolinha brilhando dentro do fog.
- **Só de noite** — `setNight` liga `lampHeadMaterial.emissiveIntensity` (`NIGHT_PRESET.lampEmissive`) e `uIntensity` da mancha (`NIGHT_PRESET.lampPool`). De dia os postes continuam em pé, apagados. Ambos são uniform: zero recompilação.
- Somem junto com o piso urbano na captura do cube quando `includeCityFloor` está desmarcado.

> [!warning] ponytail: poste não ilumina prédio
> Sem `PointLight`, a luz do poste existe só no chão. Fachada e calçada não recebem clareado do poste. Precisar disso = pool fixo de `PointLight` nos postes mais próximos da câmera, igual ao das spillLights do LED.

#### Loteamento e Lotes Vazios

Cena nunca fica vazia: o manager sempre desenha um **loteamento** (grade de quadras + asfalto + lotes demarcados), mesmo com 0 doações. Doações preenchem do centro pra fora; lote ocupado some sozinho (slot ocupado nunca vira lote). Os lotes vazios ficam **só no piso mínimo 3×3** — não crescem junto com a cidade; fora dele o anel externo fica só chão/asfalto entre os prédios.

- **Piso mínimo:** `MIN_LOTEAMENTO_RADIUS` (= 1) força `r ≥ 1` → grade 3×3 de quadras sempre presente. O loteamento cresce além disso quando as doações exigem mais quadras, nunca encolhe abaixo do piso.
- **Render inicial:** `rebuildInstances()` é chamado na criação do manager — o loteamento aparece antes de qualquer doação e já define `cityHalfExtent` pro relevo abrir a zona plana no setup.
- **Coleta de lotes:** no loop de posicionamento, cada bloco guarda `orderedSlots` (ordem usada: ocupados primeiro). Slots além de `occupiedSlots` viram lote vazio — coletados em `emptyLots` (posição world x,z), **mas só nos blocos dentro do piso mínimo** (`|bx| ≤ MIN_LOTEAMENTO_RADIUS && |bz| ≤ MIN_LOTEAMENTO_RADIUS`). Blocos do anel externo não semeiam lote vazio → loteamento não cresce junto com a cidade.
- **`rebuildLots(positions)`:** desenha um único `InstancedMesh` (`lotMesh`) de tiles de chão, 1 draw call pra todos os lotes. Cresce a capacidade sob demanda (mesmo padrão do prédio); `count = 0` quando o loteamento está cheio.
- **Tile:** `PlaneGeometry(slotSize − 0.5)` deitado (`rotateX`), em `LOT_Y = -0.012`. O gap de 0.5 entre tiles + a borda do shader = demarcação dos lotes.
- **Cor configurável:** `lotColor`, `sidewalkColor` (topo) e `sidewalkSideColor` (laterais) vêm de `blockLayoutSettings`. `updateBlockLayout` aplica direto em `lotMaterial.color` / `sidewalkTopMaterial.color` / `sidewalkSideMaterial.color` (materiais compartilhados → tudo de uma vez) e **só reconstrói** as instâncias quando muda um campo de geometria (`blockSize`, `streetWidth`, `towerRatio`, `towersPerBlock`, `baseHeightCap`, `centerTallest`) — trocar só a cor não dispara rebuild.
- **Altura da calçada configurável:** `sidewalkHeight` em `blockLayoutSettings`. `updateBlockLayout` faz um **rebuild localizado** só das tiras de calçada (`rebuildSidewalks` com os últimos params de estrada salvos: `lastRoadR`/`lastRoadBlockSpacing`/`lastRoadStreetWidth`) — não mexe nos prédios.
- **Cleanup:** `dispose()` remove `lotMesh` e libera `lotGeometry`/`lotMaterial`.

#### Cull do chão da cidade

Lotes, calçadas, postes e asfalto somem pelo **alcance do horizonte** (`setRenderDistance(distance, backDistance, groundDistance)` — o runtime passa `renderDistance * TERRAIN_CULL_SPAN`, mesmo raio do relevo), **não** pelo alcance dos prédios.

- **Grupos:** `lotCull`, `sidewalkCull`, `lampCull`, `roadCull` — cada um é um `InstanceCullGroup` de [[scene-utils#`instanceCulling.ts`]]. Cada `rebuild*` tira o snapshot das matrizes no fim (`snapshotInstances`), ou zera o grupo (`null`) quando não há o que desenhar.
- **Índice compartilhado:** poste + luminária + mancha de luz num grupo só (somem juntos); asfalto + tracejado idem.
- **Passe:** `cullGroundInstances()` roda dentro de `updateDistanceCulling` (antes do frame com alteração, guarda câmera/frustum) e **também no fim de cada rebuild** — senão o chão reaparece inteiro até o próximo passe.
- **Radial, sem frente/trás:** só `dx² + dz² <= groundCullSq`. Direção da câmera não entra.
- **Probe de reflexo:** `beginEnvCapture` chama `restoreInstances` nos quatro grupos (probe é fixo, captura a cidade inteira); `endEnvCapture` refaz o cull.

> [!bug] Chão escorregando junto com a câmera
> O cull é RADIAL: a borda que ele desenha é um **arco**. Com o raio dos prédios (208 padrão) esse arco caía **dentro** do frustum — o canto vai a ~1.55·`far` — e o loteamento aparecia cortado numa curva que escorregava a cada 0.25s junto com a câmera. O limite traseiro (46 padrão) fazia o mesmo pela base da imagem com a câmera inclinada, e a pino (sem forward em XZ) o chão virava um disco de 46u. Raio do horizonte (1.8·`far`) põe o arco fora da imagem; prédios continuam com `distance`/`backDistance`. Mesma correção já aplicada ao relevo — ver [[scene-runtime#Alcance visual e distância dos edifícios]].

> [!note] Por que shader triplanar?
> Prédios dentro do mesmo `InstancedMesh` têm alturas diferentes. O shader triplanar garante que a textura de fachada seja aplicada corretamente sem distorção, independente da escala de cada instância.

> [!bug] Projeção precisa do SINAL da normal
> A seleção XY/ZY/XZ usava só `abs(aProjNormal)`, então `+X` e `−X` (idem `+Z`/`−Z`) liam o mesmo UV — visto de fora, `+u` cai pra **esquerda** numa face e pra **direita** na outra. Consequência real: o tangent frame do three é derivado por `dFdx/dFdy` de `vNormalMapUv` (`getTangentFrame`, sem atributo `tangent`), então ele espelha junto. Com `normalScale = 20` o normal map domina a normal final → os bumps invertem e o **reflexo da face frontal não bate com o das laterais**.
>
> Correção: multiplicar a coordenada horizontal pelo sinal do eixo dominante (`+X → −z`, `−X → +z`, `+Z → +x`, `−Z → −x`). Handedness igual nas quatro faces verticais.

> [!note] Atributos `aProjPosition` / `aProjNormal`
> O shader não usa `position`/`objectNormal` diretamente — usa atributos customizados `aProjPosition`/`aProjNormal` para selecionar a projeção (XY/ZY/XZ) e calcular o UV. Na geometria default eles são cópias de `position`/`normal` (comportamento idêntico). Na geometria torcida ([[scene-builders#createTwistedBuildingMesh.ts|createTwistedBuildingMesh]]) eles preservam os valores **pré-twist** (axis-aligned), evitando que a normal twisted atravesse a fronteira entre projeções no meio do prédio. Na geometria octogonal ([[scene-builders#createOctagonalBuildingMesh.ts|createOctagonalBuildingMesh]]), as faces diagonais usam normais de projeção cardinalizadas para evitar ambiguidade entre projeções X/Z. Na geometria setback ([[scene-builders#createSetbackBuildingMesh.ts|createSetbackBuildingMesh]]), cada patamar grava normais cardinais/lajes horizontais para manter a textura estável nos recuos. Na geometria Taipei ([[scene-builders#createTaipeiBuildingMesh.ts|createTaipeiBuildingMesh]]) e One Trade ([[scene-builders#createOneTradeBuildingMesh.ts|createOneTradeBuildingMesh]]), módulos chanfrados, bordas e pináculos também gravam esses atributos para manter a textura triplanar do projeto.

#### Métodos Públicos

```typescript
// Doações
addDonation(value: number): void
addDonations(values: number[]): void
setDonations(entries: { id: number; value: number }[]): void  // replace-all do backend — ver seção abaixo
getDonationCount(): number
getCityRadius(): number   // meia-extensão world do loteamento (piso r=1, nunca 0); consumido pelo relevo

// Configurações globais
updateBuildingSettings(settings: BuildingSettings): void
updateTextureSettings(settings: TextureSettings): void
updateBlockLayout(settings: BlockLayoutSettings): void

// EnvMap
setEnvMap(texture: THREE.Texture): void
setEnvMapRotation(yDeg: number): void   // material.envMapRotation (só eixo Y) em fachada + topo; sem recaptura nem needsUpdate
setEnvHorizon(amount: number): void     // uniform uEnvHorizon (clamp 0–0.95): achata reflectVec.y no getIBLRadiance
setReflectionRoughnessFloor(roughness: number): void // uniform compartilhado; impõe piso de roughness sem percorrer materiais
setReflectionDistanceRange(start: number, end: number): void // fade horizontal do envMap por proximidade da câmera
beginEnvCapture(includeCityFloor: boolean): void // zera envMapIntensity; recompõe toda a cidade independente do culling principal; esconde piso salvo includeCityFloor
endEnvCapture(): void     // restaura envMapIntensity, piso e o buffer compacto da câmera principal

// LOD / cull de distância
setRenderDistance(distance: number, backDistance: number): void  // alcance de renderização frente/trás (sliders da aba Horizonte)
updateDistanceCulling(cameraPos: THREE.Vector3, cameraForward: THREE.Vector3): void  // esconde acessórios além de 80u; compacta as instâncias visíveis e reduz mesh.count conforme o limite direcional. Arrays lógicos permanecem estáveis para picking/metadados
tickAnimations(elapsedSeconds: number, deltaMs: number): boolean  // anima hologramas visíveis (pula os culled); true = algo animou → runtime segue desenhando

// Interação
getHoveredValue(event, camera, domElement): number | null       // picking hover → valor da doação (AABB por quadra, ver seção Picking)
getClickedDonationId(event, camera, domElement): number | null  // picking clique → donation ID (idem)
getDonationBox(donationId: number): THREE.Box3 | null  // caixa base do edifício: topo pro foco, largura pro botão de editar

// Foco e personalização
setFocusedDonation(donationId: number | null): void  // contexto e destaque visual
hasFocusedDonation(): boolean                      // informa o passe de composição
updateDonationCustomization(donationId: number, customization: BuildingCustomization): void
setRebuildDeferred(deferred: boolean): void  // true: transição de formato só marca rebuild; false: um rebuild pendente, sem criar malha de formato
pumpCustomShapes(budgetMs: number): boolean  // cria malhas de formato pendentes até o prazo; true = ainda falta

// Cleanup
dispose(): void
```

> [!note] getCityRadius
> Retorna a meia-extensão (half-extent) world do loteamento: `r * blockSpacing + blockFootprint/2 + slotSize`. Com o piso `MIN_LOTEAMENTO_RADIUS`, nunca é `0` — mesmo sem doações reflete a grade 3×3. O [[scene-runtime|runtime]] consome esse raio (`setCityRadius`) para escavar a zona plana do relevo ([[scene-builders#createTerrain.ts]]).

#### setDonations

Substitui **toda** a lista de doações de uma vez pelo snapshot do backend ([[donation-api]]). Usado no load inicial e a cada troca de filtro (região/UF/cidade/ONG). Contrasta com `addDonation`/`addDonations`, que só acrescentam.

Passos:

1. **Reseta foco:** `applyFocus(null)` — id focado pode sair do dataset; sem reset, cena fica presa no dimming (0.15) com highlight órfão. Editor também limpa `selectedBuildingId` + chama `clearFocus()` (restaura câmera).
2. **Replace-all:** limpa a lista atual, reconstrói com os `entries` recebidos.
3. **Preserva IDs do backend:** cada `DonationEntry` mantém o `id` que veio do snapshot (não gera novo). `nextId = max(maxId + 1, nextId)` — evita colisão se depois entrar doação manual.
4. **Preserva customização de ids sobreviventes:** `donation.customization` (cor/formato/tiling) é copiada da lista antiga pra ids que continuam no dataset — prédio customizado que sobrevive à troca de filtro não perde nada.
5. **Dispõe acessórios só de ids ausentes:** grupos de `rooftopMeshes`/`signMeshes`/`edgeLightMeshes`/`hologramMeshes` cujo id saiu do dataset são **destruídos** (os `sync*` só **escondem**, não deletam — sem isso vazariam). Ids sobreviventes ficam e são reposicionados pelos `sync*` do `rebuildInstances`.
6. **`customShapeMeshes`** é limpo automaticamente por `syncCustomShapes` (compara com `validIds`) — não precisa dispose manual.
7. **`growIfNeeded` + `rebuildInstances`:** cresce a capacidade do `InstancedMesh` se preciso e reconstrói tudo (posições espiral, alturas proporcionais, cores).

> [!warning] Doação manual descartada ao trocar filtro
> `setDonations` é replace-all — qualquer doação adicionada localmente via `addDonation` some quando o editor reenvia o snapshot filtrado. Customização de doação manual morre junto (id não existe no snapshot).

#### Picking (hover/clique) por AABB de quadra

Raycast do three em `InstancedMesh` é O(n) interno — itera as 100k instâncias por mousemove, trava o hover. `pickAt` substitui:

1. `rebuildInstances` preenche arrays paralelos por índice de instância (`instPosX/Y/Z` + `instHalf*`) e 1 AABB por quadra (`pickBlocks`: min/max XZ + altura máx. + faixa contígua `start..end` de instâncias — instâncias são alocadas quadra a quadra, então a faixa é contígua de graça).
2. Picking: `ray.intersectsBox` nos ~1,6k AABBs de quadra (µs) → `Ray.intersectBox` só nas instâncias das quadras atingidas (~dezenas). Prédio default é caixa — AABB é hit **exato**.
3. Instância culled (`instanceHidden[i]`) é pulada — o índice lógico permanece estável mesmo fora do buffer renderizado.
4. Custom shapes (poucos) seguem `raycaster.intersectObjects` normal; vence o hit mais próximo entre os dois caminhos.

Os mesmos arrays alimentam o loop de `updateDistanceCulling`. Quando a visibilidade muda, `compactVisibleInstances()` recompõe matrizes/cores contíguas e define `mesh.count` para a quantidade visível — o GPU deixa de executar vertex shader para prédios eliminados. Na captura do probe, o mesmo helper inclui temporariamente todas as instâncias e depois restaura o compacto. Acessórios e custom shapes continuam via `donationTransforms` — são poucos.

#### Foco em Edifício (Destaque Visual)

`compositeFocus` é ativado pelo runtime quando há HDR e antialiasing compatíveis. `hasFocusedDonation()` informa se o renderizador deve separar contexto e selecionado.

1. Instâncias e materiais mantêm suas cores, mapas, PBR, opacidades e profundidade autorais. A instância do selecionado sai do buffer compacto para evitar duplicação com `focusHighlightMesh`; formatos próprios usam seu Mesh existente.
2. `applyFocusLayers` separa edifícios/acessórios em camada 1 (contexto) e 2 (selecionado). A composição em [[scene-runtime#createFocusRenderer.ts]] aplica 15% ao contexto inteiro, evitando tornar centenas de superfícies opacas em transparentes. Coberturas, jardins/piscinas, letreiros, LEDs, hologramas e platibandas acompanham o edifício. O destaque padrão preserva a cor de cimento da laje.
3. O contexto mantém agrupamento e profundidade normais; o selecionado é desenhado depois da composição, com seus materiais e vidros. Raycaster e câmeras do probe incluem as camadas reservadas. Trocar/fechar foco restaura máscaras; edições de acessórios durante foco reaplicam as camadas.
4. A contagem de luzes dos LEDs permanece fixa. Luzes de vizinhos recebem 15% da intensidade durante o foco para não manter seu clarão sobre o selecionado; o LED do selecionado mantém a intensidade original.

Sem suporte a render target HDR, o fallback mantém transparência por material: contexto com `opacity` autoral × 0.15 e sem escrita de profundidade. Formatos esmaecidos continuam agrupados. Acessórios usam clones compartilhados por material, sem alterar o selecionado; clones ainda usados são reaproveitados ao trocar foco e os sem usuários são descartados. Hologramas usam `uOpacity`. Ao fechar, restaura opacidade, transparência, profundidade, referências e cores de instância; descarte libera somente clones, não texturas/geometrias compartilhadas. Repetir o mesmo ID não recria o estado.

---

#### Cores Individuais por Edifício

Quando um edifício recebe uma customização via `updateDonationCustomization`, a cor é armazenada em `DonationEntry.customization` e aplicada via `InstancedBufferAttribute` (instanceColor). Edifícios sem customização recebem a cor global (`currentBuildingColor`) **no próprio instanceColor**, não na cor do material. O sistema é reativado a cada `rebuildInstances` ou mudança de `BuildingSettings`.

> [!warning] instanceColor multiplica, não substitui
> Shader do three.js faz `diffuseColor *= vColor` — instanceColor é **multiplicado** pela cor do material, não troca ela. Então `applyInstanceColors` alterna a base:
>
> | Estado | `facadeMaterial.color` | `mesh.instanceColor` |
> |---|---|---|
> | Nenhuma customização, ou foco ativo | `currentBuildingColor` | `null` |
> | Alguma customização | branco (`INSTANCE_COLOR_BASE`) | cor real por instância |
>
> Sem a base branca, cor sai ao quadrado: `#d4d4d4` (linear 0.33) × 0.33 = 0.11 → cidade toda escurecia no instante em que um único prédio recebia cor customizada.
>
> `topMaterial` fica **fora** dessa alternância: `applyTriplanarShader` remove o `#include <color_fragment>` de todo material cujo `cacheKey` contém `top`, então a laje ignora vColor/instanceColor e mantém `TOP_CEMENT_COLOR`. `instanceColor` vale pra geometria inteira — sem esse descarte, a laje seria pintada com a cor do edifício.

Na composição HDR, o foco mantém as cores individuais; a remoção de `instanceColor` indicada na tabela acima vale somente para o fallback de transparência.

Para edifícios com `buildingShape !== "default"`, a cor é aplicada diretamente nos materiais clonados (sem instanceColor) via `updateCustomShapeColor`.

#### Grupos de fachada

Um `InstancedMesh` **por textura de fachada em uso** — `facadeGroups`. Draw calls = nº de texturas, não de prédios: é o que permite cada edifício ter a própria textura (sorteada ou escolhida) com a cidade cheia.

| Campo do grupo | O que é |
|---|---|
| `folder` | Pasta da textura. `""` = grupo 0, herda a textura global da cena |
| `material` | Grupo 0 = `facadeMaterial`; demais = clone (mesmo `cacheKey` → **um** programa de shader pra todos) |
| `mesh` | `InstancedMesh(buildingGeometry, [material, topMaterial], capacity)`. O topo é o mesmo material em todos os grupos — laje de cimento não varia |
| `colors` | Buffer de `instanceColor` compactado **do grupo** |
| `logicalCount` / `renderCount` | Instâncias atribuídas / efetivamente escritas (pós-culling) |

- **Índices lógicos não mudam.** `instanceGroup[i]` (`Uint8Array`, teto de 256 texturas) diz em qual grupo a instância lógica `i` vive. Picking, culling, `donationTransforms` e acessórios continuam indexados por instância lógica — nada disso sabe que existem N meshes.
- `compactVisibleInstances` distribui as instâncias visíveis pelos grupos numa passada só (matriz + cor), e fecha cada mesh com `count = renderCount`.
- **Capacidade por grupo** vem de `ensureGroupCapacity(group, group.logicalCount)` no fim do `rebuildInstances`, com a contagem real daquela textura. Grupo nasce com 64 — nascer com a capacidade global daria N × total de instâncias alocadas.
- `rebuildFacadeGroups()` refaz a lista a partir do pool + textura global; roda em `setFacadeTexturePool` e na troca da textura global (a pasta global é sempre o grupo 0), sempre seguido de `rebuildInstances()`.
- Trocar a textura de **um** prédio instanciado não refaz o layout: remapeia `instanceGroup[i]`, ajusta a capacidade do grupo destino e recompacta.
- O prédio em destaque (`focusFacadeMaterial`) recebe a pasta do próprio grupo, inclusive durante troca de textura no formato **Padrão**. Atualiza material do realce junto com instância; seleção automática recupera grupo sorteado. Reusa mesh, geometria e cache PBR, sem reconstruir layout ou adicionar trabalho por frame.
- Regressão: `node scripts/check-building-textures.mjs` verifica textura salva → escolhida, global, automática, isolamento de outro prédio e reutilização dos meshes/cache; sem servidor, navegador ou GPU.

#### Customizações que exigem Mesh próprio (`needsCustomMesh`)

Algumas personalizações precisam de **estado de material próprio** por edifício e não cabem no `InstancedMesh` (que compartilha um único material). O helper `needsCustomMesh(customization)` define quando uma doação sai do InstancedMesh e passa a ser desenhada como `Mesh` dedicado em `customShapeMeshes`:

- `buildingShape !== "default"` (ex: torre torcida, octogonal, setback, tapered, Chrysler, Hearst, Empire, Taipei ou One Trade)
- `Math.abs(tilingScale - 1) > 0.001` (tiling de textura customizado por edifício)
- `textureTransform` diferente do padrão `{ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }` (ajuste manual de textura por edifício)
- `textureKey` apontando pra uma pasta **sem grupo de fachada** (`hasUngroupedFacadeTexture`) — pasta fora do pool do catálogo. Textura própria **com** grupo não sai do instancing: o prédio só troca de `InstancedMesh`. Ver [[#Grupos de fachada]] e [[scene-textures]]

Quando a flag transiciona (entra ou sai do `customShapeMeshes`), `updateDonationCustomization` chama `rebuildInstances()` e re-aplica `applyFocus(focusedDonationId)` — ou, com `setRebuildDeferred(true)`, só marca `rebuildPending` (ver [[#Fila de customização]]). Mudanças que não atravessam essa fronteira (ex: ajustar tiling de 2.0 → 2.5 num prédio que já é custom) atualizam direto o uniform `uTilingMultiplier` do material — sem rebuild.

Para cada doação custom, `syncCustomShapes()`:

1. Clona `facadeMaterial`/`topMaterial`.
2. **Re-aplica `applyTriplanarShader` no clone** para que ele tenha seu próprio `uTilingMultiplier` (default 1.0). Sem isso, o clone herdaria o `onBeforeCompile` do original, apontando para o uniform compartilhado.
3. Define cor (`customization.color`) **só na fachada** — o `topMat` herda `TOP_CEMENT_COLOR` do clone —, tiling (`customization.tilingScale`) e ajuste manual de textura (`customization.textureTransform`).
4. Cria o mesh via [[scene-builders#createBuildingShapeMesh.ts|createBuildingShapeMesh(shape, facadeMat, topMat, buildingGeometry)]] — mapa formato → builder, sem `if` no manager:
   - `shape === "twisted"` → [[scene-builders#createTwistedBuildingMesh.ts|createTwistedBuildingMesh]] (geometria espiralada compartilhada).
   - `shape === "octagonal"` → [[scene-builders#createOctagonalBuildingMesh.ts|createOctagonalBuildingMesh]] (geometria octogonal compartilhada).
   - `shape === "setback"` → [[scene-builders#createSetbackBuildingMesh.ts|createSetbackBuildingMesh]] (geometria em patamares compartilhada).
   - `shape === "tapered"` → [[scene-builders#createTaperedBuildingMesh.ts|createTaperedBuildingMesh]] (geometria afunilada compartilhada).
   - `shape === "chrysler"` → [[scene-builders#createChryslerBuildingMesh.ts|createChryslerBuildingMesh]] (geometria art déco compartilhada).
   - `shape === "hearst"` → [[scene-builders#createHearstBuildingMesh.ts|createHearstBuildingMesh]] (geometria facetada com diagrid compartilhada).
   - `shape === "empire"` → [[scene-builders#createEmpireBuildingMesh.ts|createEmpireBuildingMesh]] (geometria art déco textureless compartilhada).
   - `shape === "taipei"` → [[scene-builders#createTaipeiBuildingMesh.ts|createTaipeiBuildingMesh]] (geometria modular compartilhada inspirada no Taipei 101).
   - `shape === "yachthouse"` → [[scene-builders#createYachthouseBuildingMesh.ts|createYachthouseBuildingMesh]] (Yatchcasa: duas torres por doação, 5 slots autorais). Cor da customização só se ≠ global (pinta linhas douradas); sem `setResidentialStoneMaps` (dourado é metal liso), `setYachthouseBuildingHeight(mesh, scale.y)` em todo sync. `positionRooftop` ancora acessório na laje da torre esquerda (`YACHTHOUSE_ROOFTOP_SCALE`, helicóptero `YACHTHOUSE_HELICOPTER_SCALE`; `getYachthouseRoofOffset`).
   - `shape === "one-trade"` → [[scene-builders#createOneTradeBuildingMesh.ts|createOneTradeBuildingMesh]] (geometria facetada com base chanfrada e pináculo, usando texturas PBR padrão).
   - `shape === "default"` → `THREE.Mesh(buildingGeometry, [facadeMat, topMat])` (mesma `BoxGeometry` do InstancedMesh, criada por `createUnitBuildingGeometry()`).
   - `shape === "residential"` → [[scene-builders#createResidentialBuildingMesh.ts|createResidentialBuildingMesh]] (torre com sacadas, 6 slots autorais). Manager injeta `setResidentialStoneMaps(facadeMat, topSet)` (Concrete024 do topo; `null` com texturas desligadas); cor da customização só entra se ≠ global. Em todo sync, `setResidentialBuildingHeight(mesh, scale.y)` ajusta nº de andares. `positionRooftop` escala acessório por `RESIDENTIAL_ROOFTOP_SCALE`.
   - `shape === "apartment"` → [[scene-builders#createApartmentBuildingMesh.ts|createApartmentBuildingMesh]] (torre de reboco com janelas em grade e rasgo de sacadas). Mesmo tratamento do residential: `setResidentialStoneMaps` no reboco, cor só se ≠ global, `setApartmentBuildingHeight(mesh, scale.y)` em todo sync, acessório escalado por `APARTMENT_ROOFTOP_SCALE`.
   - `shape === "gourmet"` → [[scene-builders#createGourmetBuildingMesh.ts|createGourmetBuildingMesh]] (Varanda Gourmet: sacadas curvas, pilastras bege). Mesmo tratamento do apartment: `setResidentialStoneMaps` no bege, cor só se ≠ global, `setGourmetBuildingHeight(mesh, scale.y)` em todo sync, acessório escalado por `GOURMET_ROOFTOP_SCALE`.
   - `shape === "loft"` → [[scene-builders#createLoftBuildingMesh.ts|createLoftBuildingMesh]] (Loftifício: faixas de pastilha verde, pilotis). Mesmo tratamento do apartment: `setResidentialStoneMaps` no reboco bege, cor só se ≠ global, `setLoftBuildingHeight(mesh, scale.y)` em todo sync, acessório escalado por `LOFT_ROOFTOP_SCALE`.
   - `shape === "empire"` também recebe `setEmpireBuildingMeshColor` quando a cor do prédio difere da cor global — o caso fica no manager, o mapa só constrói.
5. Adiciona à cena, registra em `customShapeMeshes` e seta `userData.donationId`/`userData.donationValue` para suportar raycast.
6. Fora do bloco de criação (roda em **todo** sync, inclusive pra entry reusada): `applyBuildingFacadeTexture(entry.facadeMat, donation)` carrega/aplica a textura própria do prédio; sem própria, a pasta do sorteio (`facadeGroupFor`) — formato custom segue o mesmo sorteio do instanciado. É idempotente — compara com a pasta já aplicada e sai cedo se nada mudou.

Pontos de integração:

- Os clones são incluídos em `getAllFacadeMaterials()` / `getAllTopMaterials()` para que `applyTextureToFacade`, `applyTextureToTop`, `updateBuildingSettings`, `setEnvMap` e `beginEnvCapture`/`endEnvCapture` propaguem mudanças globais para eles.
- **Material autoral** (`userData.textureless`, Empire/Residencial): `applyFacadeMaterial`/`applyTextureToTop` pulam o material inteiro → mapas e intensidades do builder ficam intactos. `applyTextureToTop` também reaplica a textura da pedra dos residenciais (set do topo chega async; liga/desliga junto). `updateBuildingSettings` não sobrescreve roughness/metalness autorais.
- Materiais com `userData.authoredEnvMapIntensity` (`getAuthoredEnvMaterials()`): `setEnvMap` troca o envMap deles também (probe recriado ou reflexo desligado não deixa vidro com cube descartado); `beginEnvCapture` zera; `endEnvCapture` restaura valor autoral **depois** do loop global.
- Fallback: `setMatOpacity` guarda estado autoral em `WeakMap` (incluindo `userData.baseOpacity`), multiplica opacidade no foco e restaura `transparent`/`depthWrite` ao sair. Contexto esmaecido não escreve profundidade; composição HDR mantém os materiais originais.
- No fallback, `setCustomShapeOpacity` mantém agrupamento por material no contexto esmaecido. O edifício selecionado preserva a política original do builder, incluindo vidros autorais. A ordem interna de blending do contexto passa a seguir os grupos agrupados; posições, triângulos, mapas e materiais são preservados. Ver [[scene-builders#Agrupamento por material (mobile)]].
- `updateDonationCustomization`: acessórios (topo, letreiro, LED, holograma) vivem em `applyAccessories()` e rodam **também** na troca de formato. Antes o `return` da transição descartava acessórios na 1ª aplicação vinda do banco (formato + acessórios juntos) — todo formato custom perdia topo/letreiro/LED ao recarregar. Cor/textura seguem puladas na transição (nascem certas no rebuild).
- Com composição, `setFocusedDonation` separa as camadas sem alterar materiais. No fallback, esmaece clones a `0.15` e mantém o selecionado em `1.0`. Formato próprio dispensa `focusHighlightMesh` porque seu Mesh já é separado.
- `getHoveredValue` / `getClickedDonationId` (via `pickAt`) testam custom shapes com raycaster normal e leem `donationId`/`donationValue` de `userData`; instanciados vão pelo caminho AABB (ver [[scene-managers#Picking (hover/clique) por AABB de quadra|Picking]]).
- O map `donationTransforms: Map<id, {position, scale}>` é a **fonte única** dos transforms lógicos: acessórios (rooftop/sign/edge) usam `readDonationTransform` que lê desse map, então funcionam igual para edifícios custom sem precisar saber se viraram Mesh separado.
- `dispose()` limpa cada clone (`facadeMat.dispose()` + `topMat.dispose()`) e chama `disposeBuildingShapeSharedResources()` — libera de uma vez a geometria compartilhada de todos os formatos.

> [!tip] Adicionando novas customizações de material
> Para uma futura personalização que precise de estado de material próprio (ex: normalScale individual), basta:
> 1. Adicionar o campo em `BuildingCustomization`.
> 2. Estender `needsCustomMesh` para considerar o novo campo.
> 3. Aplicar no clone dentro de `syncCustomShapes` e atualizar via uniform em `updateDonationCustomization`.

#### Fila de customização

Runtime drena a rajada de customizações do editor em fatias ([[scene-runtime#Desempenho (TBT e celular)]]). Manager dá duas peças:

- `setRebuildDeferred(true)` → transição de formato não chama `rebuildInstances`, marca `rebuildPending`. Acessórios seguem aplicados na hora. `setRebuildDeferred(false)` → **um** rebuild pra rajada inteira (antes: um por transição, 3–7 ms cada, e cada um recriava todos os letreiros/LEDs via `syncSigns`/`syncEdgeLights`) + `applyFocus`.
- `shapeDeadline` em `syncCustomShapes`: fora do prazo a doação fica sem malha nova (mantém a antiga, se houver) e `shapesPending = true`. Padrão `Infinity` = cria tudo (todo rebuild comum). O rebuild do `setRebuildDeferred(false)` roda com prazo `-Infinity` (não cria nenhuma). `pumpCustomShapes(budgetMs)` cria até o prazo — sempre ao menos uma — e refaz `syncRooftops` (topo do yachthouse/residencial depende da malha) e foco. 1º build de geometria complexa custa 10–25 ms (Empire, One Trade, Taipei): uma por tarefa.
- Pendente = sem malha e fora do instancing → invisível até a fatia dela. Runtime não desenha enquanto drena.

#### Platibandas automáticas

`createBuildingParapets(scene)` ([[scene-builders#createParapetMesh.ts]]) adiciona acabamento às coberturas planas, independente de `rooftopType` e sem exigir personalização.

- Após `syncCustomShapes`, `rebuildInstances` passa IDs, formatos e transforms lógicos. Nova doação, troca de formato, filtro e alteração de altura/layout reposicionam acabamentos.
- Três modelos por sorteio estável de ID. Geometria compartilhada por formato/modelo, instância por prédio. Formatos com coroamento próprio permanecem com acabamento original.
- `applyTextureToTop` sincroniza mapas da laje com platibandas após carregamento e mudanças nos controles. Materiais normal/foco usam shader triplanar com `topTilingUniform`, cor 20% mais escura e reflexos desativados; ficam fora das listas que propagam parâmetros de brilho.
- `applyFocus` sincroniza transparência/destaque. Passe de culling aplica mesmo limite frontal/traseiro dos prédios e limite de detalhe de 80u; buffers contêm somente platibandas visíveis.
- `dispose` libera todos os recursos da instância. Dataset vazio remove batches anteriores.

#### Acessórios de Topo

Cada edifício pode ter um acessório 3D no topo, como holofotes ou heliponto, gerenciado pelo campo `rooftopType` em `BuildingCustomization`. O manager mantém um `Map<donationId, { group, type }>` com os `THREE.Group` criados por [[scene-builders#createRooftopMesh.ts|createRooftopMesh]].

- **Posicionamento:** após cada `rebuildInstances`, `syncRooftops()` reposiciona todos os grupos no topo dos edifícios correspondentes.
- **Criação/remoção:** `setRooftop(donationId, type)` remove o grupo anterior e cria um novo se `type !== "none"`, já passado por `mergeRooftopParts` ([[scene-builders#createRooftopMesh.ts]]): peças opacas do mesmo material viram uma malha. Visão inicial: 1113 → 761 draw calls.
- **Performance:** o lookup do edifício usa `donationIdToInstanceIndex` em vez de `indexOf`, e os transforms temporários são reutilizados nos syncs.
- **LOD:** `updateDistanceCulling(cameraPos, cameraForward, frustum?)` (chamado antes do frame quando câmera/cena mudam) esconde o grupo além de `ACCESSORY_DETAIL_DISTANCE` (80u) — vale pra rooftop, sign, LED e holograma. Mesmo passe faz cull dos prédios além da distância de renderização (`setRenderDistance`): custom shapes via `visible`, instâncias via compactação do buffer/`mesh.count`. Ver [[#Cull do chão da cidade]] pro resto do loteamento.
- **Cleanup:** no `dispose()`, todos os grupos são removidos e `disposeRooftopSharedResources()` limpa geometrias e materiais compartilhados.

#### Letreiros (Signs)

Cada edifício pode ter um letreiro na fachada com o texto da marca/empresa do doador, gerenciado pelo campo `signText` em `BuildingCustomization`. O manager mantém um `Map<donationId, { group, text }>` com os `THREE.Group` criados por [[scene-builders#createSignMesh.ts|createSignMesh]].

- **Dimensionamento:** o letreiro usa as dimensões reais do edifício (`getBuildingScale`) — largura adaptada a cada fachada, altura consistente em todos os lados.
- **Lados:** `signSides` (1–4) controla em quantas fachadas o letreiro aparece. Cada mudança de texto ou de lados recria o sign completo via `setSign(donationId, text, sides)`.
- **Posicionamento:** `syncSigns()` reposiciona todos os letreiros no centro do edifício após cada `rebuildInstances`.
- **Detecção de mudança:** `updateDonationCustomization` compara `signText` e `signSides` anteriores com os novos valores — recria só se houve mudança.
- **Cleanup:** no `dispose()`, todos os sign meshes são removidos com `disposeSignMesh()`.

#### LED de Arestas

Cada edifício pode ter um efeito de **LED nas arestas** (4 arestas verticais nos cantos + 4 arestas no topo formando retângulo), gerenciado pelos campos `edgeLightType` e `edgeLightColor` em `BuildingCustomization`. O manager mantém um `Map<donationId, { group, type, color }>` com os `THREE.Group` criados por [[scene-builders#createEdgeLightMesh.ts|createEdgeLightMesh]].

- **Posicionamento:** o grupo é colocado na **base** do edifício (`donationY − scale.y/2`); meshes internos cobrem de `y=0` (chão) até `y=height` (topo) com lift de `0.05` no topo para evitar conflito com `helipad`/`spotlights`.
- **Reconstrução em rebuild:** ao contrário de rooftop/sign, `syncEdgeLights()` **reconstrói** todos os grupos existentes a cada `rebuildInstances`. Isso é necessário porque novas doações alteram a altura dos edifícios — a geometria do LED depende de `width`, `depth` **e** `height`.
- **Instancing:** o grupo contém só **3 `InstancedMesh`** (core + halo + haloOuter) — todos os segmentos de aresta são instâncias, então torre twisted custa 3 draw calls, não 156 meshes. Ver [[scene-builders#createEdgeLightMesh.ts]].
- **Cleanup:** no `dispose()`, todos os edge light meshes são removidos com `disposeEdgeLightMesh()` (libera materiais clonados + buffers de instância) e `disposeEdgeLightSharedResources()` libera as geometrias compartilhadas do módulo.

##### Fora do reflexo, dentro da luz

LED some **por completo** da captura do envMap — nem a fita espelhada, nem o clarão que ela joga nos vizinhos. Prédio ao redor fica iluminado só no render principal.

- **Saída do reflexo (fita):** `beginEnvCapture()` esconde todo group de LED visível (guarda em `edgeLightsHiddenForCapture`), `endEnvCapture()` restaura. Mesmo padrão do piso da cidade — ver [[scene-runtime#Probe de reflexo (envMap dos prédios)]].
- **Saída do reflexo (luz):** as `PointLight` vão a `intensity = 0` na captura (valores guardados em `spillIntensitiesBeforeCapture`) e voltam no fim. Zerar intensidade em vez de `visible = false` — apagar a luz mudaria a contagem de luzes e recompilaria todos os materiais **a cada captura**.
- **Luz nos vizinhos:** pool fixo de `EDGE_LIGHT_SPILL_POOL_SIZE` (8) `PointLight`, criado na **primeira** ativação de LED (`ensureSpillPool`). Sem LED na cena, nenhum material paga o custo das luzes.
- **Por que pool fixo:** contagem de luzes visíveis entra na chave de cache do programa. Criar/remover — ou alternar `visible` — recompilaria **todos** os materiais a cada passe de cull. Enquanto houver LEDs, as luzes ficam na cena; só posição e `intensity` mudam. Ao remover o último LED ou filtrá-lo do dataset, o pool é descartado; o próximo LED recria as oito luzes.
- **Atribuição:** no mesmo passe de `updateDistanceCulling`, os LEDs visíveis mais próximos da câmera assumem as luzes por ordem de distância; sobra fica com `intensity = 0`. LED nº 9+ não acende vizinho — subir `EDGE_LIGHT_SPILL_POOL_SIZE` se a cidade ficar densa de LED.
- **Ordem é contrato:** acesas sempre nos primeiros índices, apagadas no fim. Shader para na 1ª apagada ([[scene-runtime#Visibilidade e preparo incremental (mobile)|createScenePreparer]]) — luz acesa depois de uma apagada some. Cada luz no shader custa ~3–4 ms/frame no Adreno 618: subir o pool tem preço no celular.
- **Posição:** centro do edifício. Sem sistema de sombras a luz vaza pros vizinhos, e a própria fachada não acende porque a normal aponta pro lado oposto ao vetor da luz.
- **Clareia, não reflete:** `applyTriplanarShader` remove a linha do `reflectedLight.directSpecular` (lobo GGX da luz direta) do chunk `lights_physical_pars_fragment`. Sem isso a `PointLight` desenha o próprio "bulbo" espelhado na fachada do vizinho — ponto brilhante, não iluminação. Sobra `directDiffuse` = o clareado. **Reflexo do ambiente intacto:** ele vem de `indirectSpecular` (`getIBLRadiance`/envMap), outro caminho do shader. Só é seguro porque as únicas luzes **diretas** da cena são estas — o resto é `AmbientLight` + IBL (ver [[scene-builders#createLightingRig.ts]]).
- **Cleanup:** retirada do último LED e `dispose()` removem e descartam as luzes do pool.

---

### `createChunkManager.ts` _(referência arquitetural)_

> [!warning] Não usado pelo runtime principal
> Mantido no repositório como referência da arquitetura de cidade procedural infinita.

**Responsabilidades originais:**
- Criar `InstancedMesh` por chunk
- Gerar prédios proceduralmente com [[scene-utils#random.ts|seeded random]]
- Decidir quais chunks devem existir perto da câmera
- Remover chunks distantes
- Alternar materiais near/far por chunk com base em `ENV_MAP_NEAR_DISTANCE` (constante local; a key de config foi removida)

> [!note] createShadowManager removido
> Existia como referência de seleção de candidatos de sombra. Deletado junto com o sistema de sombras (cena não tem luz direcional — sombras nunca renderizavam).

## Quando Mexer em Managers

Mexa aqui quando o problema for **comportamental**:

| Objetivo | Onde mexer |
|---|---|
| Mudar layout dos prédios de doação | `createDonationManager.ts` → `DONATION_LAYOUT` |
| Alterar fórmula de altura proporcional | `createDonationManager.ts` |
| Aumentar limite máximo de doações | `createDonationManager.ts` → `DONATION_LAYOUT` |
| Alterar cor/material do asfalto | `createDonationManager.ts` → `asphaltMaterial` |
| Alterar largura do asfalto vs. calçada | `createDonationManager.ts` → `SIDEWALK_RESERVE` |
| Alterar calçada (cor, altura via UI) | aba **geral** → seção Calçada → `blockLayoutSettings.sidewalkColor` / `sidewalkHeight` |
| Trocar organização dos edifícios (por quadra ↔ mais alto no centro) | aba **geral** → seção Organização dos edifícios → `blockLayoutSettings.centerTallest` |
| Alterar geometria/posição da calçada | `createDonationManager.ts` → `rebuildSidewalks` / `SIDEWALK_GAP` / `SIDEWALK_BOTTOM` |
| Alterar faixa central / tracejado / cruzamentos | `createDonationManager.ts` → `dashFS` (`interHalf`) |
| Alterar lotes vazios (cor, borda, tamanho) | `createDonationManager.ts` → `lotMaterial` / `rebuildLots` |
| Alterar tamanho mínimo do loteamento | `createDonationManager.ts` → `MIN_LOTEAMENTO_RADIUS` |
| Problema de valores padrão (altura máx, tamanho) | [[scene-config]] |
| Fórmula matemática pequena | [[scene-utils]] |

### Culling espacial e atualizações incrementais

- As quadras já usadas pelo picking são testadas contra o frustum. Quadra inteiramente fora da imagem pula testes de distância dos seus prédios; dentro dela, AABBs individuais mantêm edifícios que cruzam a borda. Os grupos por textura continuam os mesmos: não aumenta draw calls. Displacement ativo conserva o descarte só por distância, pois move vértices além dos limites lógicos.
- `instanceHidden` preserva índices lógicos para seleção; só buffers renderizados são compactados. Matrizes/cores são comparadas antes de escrever; só grupos alterados recebem `needsUpdate` e intervalos limitados à parte utilizada. Bounds são invalidados quando necessário.
- `beginEnvCapture` restaura toda a cidade e o chão; `endEnvCapture` devolve o conjunto compacto da câmera principal. Não aplica o frustum da câmera às luzes dos LEDs, para preservar iluminação dos vizinhos.
- `donationById` mantém consultas de customização/foco/acessórios sem buscas lineares repetidas. Inserção, replace-all e dispose mantêm o índice sincronizado.
- Composição HDR não altera opacidades nem variantes de transparência. No fallback, opacidade só invalida material quando muda `transparent`; o contexto mantém batching e o selecionado conserva os materiais autorais.
- Teste: `scripts/check-building-textures.mjs` cobre culling com AABBs reais em quatro direções, probe, buffers estáveis, pool de LEDs, batching no foco, acessórios compartilhados, jardins/piscinas, letreiros, hologramas, edição em foco, restauração e descarte dos clones.
