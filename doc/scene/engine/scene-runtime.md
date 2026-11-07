---
title: Scene Runtime
tags:
  - cidoe
  - runtime
  - threejs
  - orquestrador
aliases:
  - Runtime
  - createCitySceneRuntime
---

# Scene Runtime

O orquestrador da cena 3D: `src/scene/runtime/createCitySceneRuntime.ts`.

> [!abstract] Analogia
> Se o projeto fosse uma orquestra:
> - `config` → a partitura com valores
> - `builders` → os instrumentos montados
> - `managers` → os grupos especializados
> - `runtime` → **o maestro**

## Responsabilidades

O runtime:
- Cria `scene`, `camera`, `renderer` e `OrbitControls`
- Chama os [[scene-builders|builders]]
- Chama os [[scene-managers|managers]]
- Roda o loop de animação
- Escuta eventos de `resize`
- Faz `dispose` completo no final

## Fluxo Interno

### 1. Inicialização

`async` — devolve `Promise<CitySceneRuntime>`. Etapas com `await` entre elas (tarefa nova cada, ver [[#Desempenho (TBT e celular)]]). Rejeita sem WebGL ou com WebGL por software.

```
createCitySceneRuntime({mount, settings...})   // async
  ├── runDevAssertionsOnce()
  ├── await afterNextFrame()   ← sai do commit do React; layout já pronto
  ├── THREE.Scene (background, FogExp2)
  ├── THREE.PerspectiveCamera
  ├── THREE.WebGLRenderer (ACES filmic, powerPreference "high-performance")
  ├── isSoftwareGL()?  → throw "WebGL por software" (hook libera o loading)
  ├── OrbitControls
  ├── await yieldToMain()
  ├── loadEnvironment()       ← builder de HDRI
  ├── createLightingRig()     ← builder de luzes
  ├── createGroundPlane()     ← builder do chão
  ├── createTerrain()         ← builder do relevo (terrainRig)
  ├── await yieldToMain()
  ├── WebGLCubeRenderTarget   ← envMap dinâmico dos prédios (256px)
  ├── CubeCamera              ← probe fixo no centro da cidade (y = ENV_PROBE_HEIGHT)
  ├── createFocusRenderer()   ← composição do foco quando há HDR
  ├── createDonationManager() ← manager principal (recebe blockLayoutSettings/compositeFocus)
  ├── await yieldToMain()
  └── requestAnimationFrame(animate)   ← 1º frame no rAF seguinte
```

### 2. Loop de Animação (`animate`)

A cada tick do rAF, também no modo leve, sem limitador artificial de FPS. A frequência segue o navegador, inclusive quando ele reduz a taxa por economia de energia. **Render sob demanda**: tick sem mudança sai cedo e o canvas segura o último frame.

0. Gate: evento `change` do OrbitControls (`handleControlsChange`) com câmera em movimento → frame. Não usar retorno do `controls.update()` do loop: zoom (roda/pinça) aplica inteiro no `update()` do handler do evento → loop vê `false`, câmera anda sem redesenhar e "teleporta". Também pedem frame: `cameraAnim`, `markCubeDirty` (toda mudança de cena), `requestRender` (resize, granulado, reflexo, foco), cull pendente, captura de cube pendente, holograma visível (`tickAnimations` → `true`). Frame **não sai** com passe de compilação em curso ou fila de customização drenando.
1. `controls.update()` — aplica damping do OrbitControls com fator `1-(1-f)^(elapsed*60)`. `f` é a referência a 60 Hz; `elapsed` usa tempo real, preservando a inércia em 30/60/90/120 Hz e em frames lentos.
2. `groundPlane.setPosition(camera.x, camera.z)` — chão segue a câmera
3. `environmentUpdater.updatePosition(...)` — skybox segue a câmera
4. **Métricas de FPS** — acumula tempo real entre frames consecutivos e suaviza a cada 0.5s. O delta limitado a 50 ms serve somente à interpolação da câmera. `SceneStats.performance` expõe FPS/tempo médio e contagens do último frame; `renderer.info.autoReset = false` inclui os passes de captura antes do reset por frame.
5. **Resolução dinâmica** — ajusta `renderScale` para atingir `targetFps`. **Desligada no padrão** (piso `renderScaleFloor = 1`, controlado pelo granulado do painel)
6. **CubeCamera** — só fora do modo leve. Near = `cameraNear` (probe segue a câmera; near curto punha z-fighting dentro do reflexo). Captura quando `cubeDirty` (cena mudou, 180ms de debounce) ou, com `followCamera`, quando a câmera andou desde a última captura (`lastCapturePos`); no máximo a cada `updateInterval` frames. Câmera parada = sem captura (antes recapturava a cada 4 frames: 6 renders + PMREM, 15–20 ms no M4). `continuous` sem `followCamera` recaptura a cada intervalo nos frames desenhados. Captura pendente segura o loop. Ver [[#Probe de reflexo (envMap dos prédios)]].
7. **Culling** — com `cullPending`, atualiza o far, a matriz da câmera e seu frustum antes do frame. `updateDistanceCulling(position, forward, frustum)` mantém o alcance dos acessórios (80u), descarta quadras/instâncias fora do enquadramento e compacta o chão com limites conservadores. Sem throttle: girar a câmera não deixa buracos por um quarto de segundo.
8. `focusRenderer.render(hasFocusedDonation())` — um render normal sem foco; contexto HDR + fundo + composição + selecionado quando há foco

#### Resolução Dinâmica

```
FPS < targetFps - 8  → renderScale -= 0.05 (reduz qualidade)
FPS > targetFps + 1  → renderScale += 0.025 (aumenta qualidade)
```

O `renderScale` é multiplicado pelo `devicePixelRatio` (limitado pelo `dprCap`, `2` no padrão). O piso da queda é `renderScaleFloor`, não `minRenderScale`: começa em `CITY_SCENE_CONFIG.minRenderScale` e é reescrito por `setGrain`. Com piso `1` os dois ramos ficam presos em `1` e nenhum `setPixelRatio` roda — o render nunca sai da resolução nativa.

#### Granulado (`setGrain`)

Granulado = queda de resolução sob carga, visível como imagem granulada. Controle na aba **tela** do [[html-components|CityControlPanel]], estado `grain` do `CitySceneEditor`, **padrão `0`**.

```
renderScaleFloor = 1 - clamp(grain, 0, 1) * 0.5
grain 0   → piso 1.00 → downscale desligado, nunca granula
grain 1   → piso 0.50 → troca nitidez por FPS de forma agressiva
```

Baixar o granulado sobe `renderScale` até o novo piso **na hora** (`setPixelRatio` + `setSize` imediatos) — sem isso a imagem ficaria granulada até o FPS se recuperar sozinho. Mudanças têm cooldown de 1,5s; o delta imediatamente posterior à captura do cubemap não entra na média, evitando que um frame esporádico de CubeCamera/PMREM deixe a resolução permanentemente baixa em monitores de 60 Hz.

## Desempenho (TBT e celular)

Medido com CPU profile + trace (Lighthouse mobile simula CPU 4x: tarefa > 12,5 ms no M4 já é tarefa longa lá). Antes: link de shader síncrono (`onFirstUse`) ~375 ms, rajada de customizações ~420 ms numa tarefa, captura do cube a cada 4 frames, upload de textura no 1º render. Com SwiftShader (sem GPU) o link travava 7–17 s por tarefa.

- **Modo leve** (`IS_LOW_TIER`, [[scene-utils#deviceTier.ts]]): `antialias` off, DPR `liteDprCap` (1,5), **sem cube camera** (fachada usa `scene.environment`, reflexo do céu em vez da cidade). O loop acompanha o rAF; `liteFps` (60) é apenas o alvo do scaler dinâmico. Resolução, materiais e texturas não mudam com a remoção do limitador de 30 FPS.
- **WebGL por software** (`isSoftwareGL`: SwiftShader/llvmpipe/WARP): runtime desiste (`throw`) — sem `KHR_parallel_shader_compile` cada shader PBR trava segundos. Hook cai no catch e libera o loading.
- **Criação em etapas** (`async` + `yieldToMain`): contexto | céu/luz/chão/relevo | doações | resto. `afterNextFrame` evita reflow forçado no `mount.clientWidth`.
- **Compilação assíncrona** (`runCompilePass`): delega a `createScenePreparer`, que prepara variantes alteradas e texturas ainda não enviadas. Ver [[#Visibilidade e preparo incremental (mobile)]]. O canvas mantém o último frame durante a preparação; o limite de espera continua em 5 s.

- **Fila de customização**: `updateDonationCustomization` enfileira por id (última vence) e drena em fatias: com `setRebuildDeferred(true)` aplica sem rebuild; fila vazia → `setRebuildDeferred(false)` = **um** rebuild pra rajada inteira; depois `pumpCustomShapes(SLICE_MS)` cria malhas de formato em fatias. Ver [[scene-managers#Fila de customização]].
- `renderer.debug.checkShaderErrors = import.meta.env.DEV` (logs síncronos de shader só em dev).
- **Opacos de frente pra trás** (`renderer.setOpaqueSort`): `z` antes de `material.id`. Padrão do three ordena por material primeiro; com clone de material por prédio custom, profundidade virava sorteio e fachada PBR era pintada pra depois ser coberta. Empate em `z` (mesmo objeto) mantém ordem por material de antes. Adreno 618, visão inicial: 106 → 92 ms/frame; diff de pixels: 1 em 649 mil.
- Sinal `sceneReady` ([[scene-types#SceneStats]]): frame com HDRI resolvido (carregou ou falhou: `onFailed` do [[scene-builders#loadEnvironment.ts|loadEnvironment]]), doações recebidas, fila vazia e `assetsLoading` false. `assetsLoading` vem do `DefaultLoadingManager`: `onStart` liga e emite `sceneReady: false` **síncrono**; `onProgress` = `loaded < total`; `onLoad` desliga. Libera a página de loading do `CitySceneEditor` ([[html-components#Carregamento inicial (casca)]]).

### 3. Atualizações do React

O runtime expõe métodos públicos chamados pelo [[scene-hooks|useCityScene]]:

```typescript
type CitySceneRuntime = {
  // Configurações da cena
  updateBuildingSettings(settings: BuildingSettings): void
  updateTextureSettings(settings: TextureSettings): void
  setFacadeTexturePool(keys: readonly string[]): void  // texturas sorteáveis por edifício (catálogo)
  updateGroundSettings(settings: GroundSettings): void
  updateLightSettings(settings: LightSettings): void
  updateHorizonSettings(settings: HorizonSettings): void // distância só dos edifícios; câmera/chão/relevo independentes
  updateEnvironmentSettings(settings: EnvironmentSettings): void
  updateReflectionSettings(settings: ReflectionSettings): void // probe do envMap; resolution recria o cube target
  updateBlockLayout(settings: BlockLayoutSettings): void
  updateTerrainSettings(settings: TerrainSettings): void
  setGrain(grain: number): void // 0 = resolução nativa travada; >0 libera o downscale por FPS

  // Doações
  addDonation(value: number): void
  addDonations(values: number[]): void
  setDonations(entries: { id: number; value: number }[]): void  // replace-all do backend

  // Personalização individual
  updateDonationCustomization(donationId: number, customization: BuildingCustomization): void // enfileira; drena em fatias
  focusOnDonation(donationId: number): void  // destaque visual no edifício + posição do botão de editar
  clearFocus(): void                          // remove destaque
  setViewShift(px: number): void              // cena desliza px para a esquerda (painel lateral ao lado do edifício)

  dispose(): void
}
```

> [!note] setDonations
> Replace-all do snapshot do backend ([[donation-api]]). Chama `donationManager.setDonations(entries)`, depois `syncTerrainToCity()` (relevo reabre a zona plana pro novo raio), `emitStatsPatch({ buildings })` (contador do painel) e `markCubeDirty()` (força recaptura do envMap). Ver [[scene-managers#setDonations]].

> [!note] Evento de clique em edifícios
> O runtime acompanha o `pointerId` entre `pointerdown`/`pointermove`/`pointerup`. Mover mais de 5px cancela o clique, mesmo voltando ao início. Segundo dedo/pinça e `pointercancel` também cancelam; `pointerup` sempre consome o estado. Clique simples faz picking e chama `onBuildingClick(donationId)`.

> [!note] Sistema de foco
> `focusOnDonation` delega para `donationManager.setFocusedDonation(id)`. Com HDR, separa contexto/selecionado por camadas e compõe o contexto a 15%, preservando os materiais; sem suporte, usa transparência por material. Prédio padrão recebe mesh isolado; formato custom usa o existente. `clearFocus` restaura cena e câmera.
>
> Zoom preserva o **lado atual da câmera**, com distância horizontal de 8 unidades. A câmera termina 4,3 unidades acima do topo e mira 5 unidades abaixo dele (mínimo `y = 0`), mostrando a cobertura de cima. O limite polar normal permanece ativo. `cameraAnim` interpola pos+target com ease-out cubic em `0.8s`. `clearFocus` restaura pos/target salvos.
>
> **Botão de editar.** `focusOnDonation` guarda `focusBox` (`donationManager.getDonationBox`, caixa base). Com foco, cada frame desenhado (e o próprio `focusOnDonation`, antes do voo) chama `onFocusScreenPosition(x, y)`: ponto na face do edifício que fica à direita na tela — centro + meia largura ao longo do eixo X da câmera (`hx·|right.x| + hz·|right.z|`), altura do alvo do foco (topo − 5; meio do edifício se baixo) — projetado em px do canvas. Sem frame novo = sem chamada (render sob demanda). `clearFocus` zera `focusBox`. Consumidor: [[index#2. Container Principal]].
>
> **Painel lateral.** `setViewShift(px)` → alvo `viewShift = px`. Loop aproxima `viewShift` exponencial (`1 − e^(−8·Δt)`, ~0,4 s) e aplica `camera.setViewOffset(w, h, viewShift, 0, w, h)` (`clearViewOffset` em 0): frustum desliza, alvo da órbita vai `px` para a esquerda. Câmera/target intactos — órbita gira em torno do edifício, picking/hover/cull usam mesma matriz. `handleResize` reaplica. Mesma pausa da interpolação abaixo.
>
> A interpolação pausa enquanto houver compilação pendente/em andamento ou fila de customização drenando: o primeiro frame pronto inicia o movimento, sem avançar invisivelmente até o destino. Um evento `start` dos controles cancela a interpolação para o usuário assumir a câmera. O listener é removido no dispose. `scripts/check-horizon.mjs` simula compilação demorada, retomada intermediária, interrupção por gesto, retorno da câmera e cliques/pinças/cancelamentos.

### createFocusRenderer.ts

Renderização do foco em conjunto, ativada com `EXT_color_buffer_float` e MSAA de RGBA16F compatível quando o contexto usa antialiasing:

1. Contexto (camada 1) em render target HDR `HalfFloatType`, com profundidade e materiais normais; preserva o descarte de superfícies ocultas.
2. Céu, relevo e piso (camada 0) no canvas.
3. Composição do contexto a 15%: alpha limitado a [0,1], ACES e conversão de cor para a saída do renderer. Half-float evita cortar reflexos/emissivos antes do tone mapping; MSAA até 4 amostras quando habilitado no contexto.
4. Limpa profundidade e desenha o selecionado/acessórios (camada 2), preservando os materiais autorais e a leitura dos detalhes.

Camera normal e faces do cube incluem as três camadas; picking inclui as duas camadas de edifícios. As luzes visíveis pela câmera recebem temporariamente as camadas dos passes. `try/finally` restaura máscara da câmera, luzes, background, clear color/alpha, render target e `autoClear`, inclusive em falhas.

Target alocado no primeiro foco, na resolução efetiva do canvas (sem downscale), redimensionado quando necessário e reutilizado entre seleções. `dispose` libera target, quad e material. Sem foco, faz um único render normal. Sem extensão HDR ou MSAA de RGBA16F compatível com o contexto, o manager usa o fallback de transparência por material. O caminho preserva geometria/texturas/PBR; a transparência do contexto passa a ser do conjunto, sem acumular as camadas internas de cada edifício.

`createScenePreparer` aquece também a variante do target HDR. Materiais Standard/Physical preservam seu hook/chave; clones de acessórios não empilham o mesmo hook. Bloco de point lights vira **loop dinâmico** (sem `unroll_loop`) que para na 1ª luz de cor zero e evita `RE_Direct` quando `directLight.visible` já é falso. Depende do pool do LED vir com as acesas primeiro ([[scene-managers#Fora do reflexo, dentro da luz]]). Motivo: no Adreno 618 as 8 cópias desenroladas custavam ~28 ms/frame mesmo com o `if`, inclusive as 4 apagadas (custo estático do shader, não do BRDF). Com o loop: 64 → 54 ms, diff de pixels zero. Ignora sombra de point light — cena não tem sombra. O shader de composição converte para a saída uma vez, conforme [gerenciamento de cores do Three.js](https://threejs.org/manual/pages/color-management.html).

`check-mobile-performance.mjs` verifica HDR, tamanho, passes, luzes, retorno sem foco, fallback, preservação do estado após exceção, descarte e cache dos shaders. `check-building-textures.mjs` verifica materiais originais, camadas, picking e restauração no manager real.

### Validação do foco no Android

Em 29/10/2026, Chrome no M2101K6G/Adreno 618, via USB, na aplicação local `beta` com 480 edifícios:

- Clique mostrou posições intermediárias da câmera; órbita e pinça nativas mantiveram o mesmo edifício selecionado. Fechar detalhes restaurou câmera, alvo e camadas normais.
- Render target HDR completo a 589 × 1102, sem redução de resolução, sem erro WebGL ou perda de contexto. Contexto e acessórios esmaecidos; selecionado com materiais originais.
- Órbita controlada de 0,8 rad em 4,5 s, após aquecimento: aproximadamente **16,3 FPS**, mediana de frame 65 ms e cerca de 640 draw calls. Ainda abaixo de fluidez adequada; não é evidência de 30/60 FPS nem benchmark da produção.
- Evitar atualizações React por métricas na interface pública removeu cerca de 1,35 s de trabalho React em um perfil de 5,4 s. A imagem parada antes/depois dessa mudança foi idêntica, mas os FPS ficaram praticamente iguais (16,3–16,6). O custo restante requer investigação gráfica; a extensão de timer GPU não estava disponível, portanto o tempo de GPU não foi medido diretamente. Diagnóstico admin continua completo — ver [[html-components#GameMenu.tsx]].

Medição curta na versão de desenvolvimento; aquecimento prolongado, outros aparelhos e desempenho da build publicada não foram revalidados nesta rodada.

> [!note] Sem sombras
> Cena não tem luz direcional — iluminação é ambiente + IBL do HDRI. Sistema de sombras (settings, UI, flags `castShadow`) foi removido por ser código morto. Pra reintroduzir: criar `DirectionalLight` com shadow camera antes de qualquer flag.

> [!note] Relevo (terrainRig)
> O runtime possui o `terrainRig` ([[scene-builders#createTerrain.ts]]) — opção `terrainSettings` + método `updateTerrainSettings`. Sincroniza a zona plana via `syncTerrainToCity`, que chama `terrainRig.setCityRadius(donationManager.getCityRadius())` após `addDonation`/`addDonations`/`updateBlockLayout` (toda mudança de doação ou layout de quadra). Cor do chão sincronizada via `terrainRig.setGroundColor` em `updateGroundSettings`. Ver [[scene-managers|getCityRadius]].
>
> **Teto de edifícios:** `syncTerrainToCity` também resolve a visibilidade — `terrainRig.mesh.visible = currentTerrain.enabled && getDonationCount() <= TERRAIN_MAX_BUILDINGS` (5000, ver [[scene-config#terrainConfig.ts]]). Passou do teto, relevo some sozinho; caiu abaixo, volta. `currentTerrain` guarda o que o painel pediu, e `updateTerrainSettings` repassa `{ ...settings, enabled: terrainEnabled() }` pro rig — senão o rebuild devolveria `mesh.visible = s.enabled` por cima.
>
> **Chão infinito:** o `groundPlane` fica **sempre visível** (`y=−0.05`, abaixo do piso do relevo em `−0.04`) e **segue a câmera** (`updateCamera` no loop). Onde há relevo, o terreno cobre; além da borda do relevo (mesh fixo, 700u na origem), o plano preenche o vazio → cidade grande **não tem limite** ao mover a câmera. Fica sempre abaixo do terreno → **sem z-fighting** (antes o plano era escondido com o relevo ligado, pra não piscar por ficar acima). Na **captura do cube envMap**, relevo e plano cinza permanecem visíveis por padrão e aparecem nos reflexos. Desmarcar `includeGround` os oculta apenas durante a captura; a visibilidade do render principal não muda.

### Alcance visual e distância dos edifícios

- Câmera principal: `updateCameraFar()` após OrbitControls/foco usa `max(renderDistance, distância ao centro do relevo + raio + 1)`. Bounding sphere da malha atual garante montanhas inteiras durante órbita, zoom e pan, sem deformar/mover terreno. Relevo oculto → far volta a `renderDistance` (padrão 190). Projeção só atualiza quando far muda; raio do céu continua `renderDistance * 0.9`. Alcance dos edifícios independente.
- Chão local: `updateHorizonSettings` repassa opções a `groundPlane.updateHorizon`; loop chama `groundPlane.updateCamera(camera)` após OrbitControls/foco. `straight` padrão mantém frente reta, laterais fora do frustum; `circular` oferece disco; `square` preserva quadrado original. `groundDistance` controla distância à frente, raio ou meio lado, respectivamente. Material/altura preservados; sem regenerar relevo. Ver [[scene-builders#createGroundPlane.ts]].
- Camada cinza do horizonte removida: nenhum quad/shader de fundo atrás do terreno, nem nos reflexos. Restam chão local, relevo e céu; eliminação poupa chamada de desenho e material adicionais.
- Edifícios: `distance`/`backDistance` continuam no `setRenderDistance` (só os prédios — relevo e chão da cidade saíram desse limite); cull antes de cada frame com câmera/cena alterada compacta instâncias e controla formatos customizados/acessórios. `renderDistance` não toca nesse cull.
- Chão da cidade: lotes, calçadas, postes e asfalto usam o **raio do horizonte** (`renderDistance * CITY_FLOOR_CULL_SPAN`, terceiro argumento de `setRenderDistance`), no mesmo passe de visibilidade (compactação de instâncias — ver [[scene-managers#Cull do chão da cidade]]). Cull radial, sem frente/trás: com o alcance dos prédios o arco entrava no frustum e o loteamento parecia encolher/escorregar quando a câmera mexia.
- Montanhas: malha, seed, cores, posição e resolução independem da câmera. Removidos `setRenderDistance`, `updateCulling` e `setCullEnabled` do terreno: sem descarte no fragmento baseado na câmera. Far contém relevo inteiro; captura usa material normal e alcance próprio do probe.
- Reflexos: `CITY_SCENE_CONFIG.reflectionFar = 260` preserva alcance anterior das seis faces do probe; não herda alcance ampliado da câmera principal.

Verificação: `node scripts/check-horizon.mjs`. Runtime real com I/O substituído; valida três modos, mais de 10 mil raios em órbita/aspectos/zoom/distâncias, borda horizontal, ausência da camada cinza adicional, culling de 500 prédios (slider dos prédios não pode encolher o chão da cidade), vértices do terreno dentro do far em órbita/pan, malha e transform fixos, restauração do far ao desligar relevo, alcance do probe, precisão Float32 em órbita e descarte de recursos. Sem servidor/navegador; não mede FPS da aplicação.

### Modo noite

`EnvironmentSettings.night` ([[scene-types#EnvironmentSettings]]) liga a noite. Divisão:

| Parte | Onde |
|---|---|
| Céu tingido + estrelas | [[scene-builders#loadEnvironment.ts]] (`environmentUpdater.updateSettings`) |
| Luz, IBL, névoa | `applyNightMode()` no runtime |
| Janelas acesas + reflexo da fachada | [[scene-managers#Janelas acesas de noite]] (`donationManager.setNight`) |
| Postes de rua acesos | [[scene-managers#Postes de Luz (rebuildStreetLamps)]] (mesmo `setNight`) |

`applyNightMode()` sempre parte do estado "de dia" e aplica o override por cima:

```typescript
const metrics = lightingRig.update(currentLight)      // volta ao valor do painel
if (night) {
  lightingRig.ambient.color.set(NIGHT_PRESET.ambientColor)
  lightingRig.ambient.intensity = metrics.ambientTotal * NIGHT_PRESET.ambientScale
}
scene.environmentIntensity = night ? NIGHT_PRESET.environmentIntensity : 1
scene.fog.color.set(night ? NIGHT_PRESET.fogColor : currentHorizon.fogColor)
donationManager.setNight(night)
```

> [!warning] Primeira chamada vem depois do `donationManager`
> `applyNightMode()` toca o manager, então a chamada inicial fica **abaixo** do `createDonationManager` (não junto da definição). Subir de volta = `ReferenceError` na const.

> [!warning] Chamar em toda mudança que a noite pisa por cima
> `updateLightSettings`, `updateHorizonSettings` e `updateEnvironmentSettings` guardam o valor em `currentLight`/`currentHorizon`/`currentEnvironment` e chamam `applyNightMode()` — não escrevem luz/névoa direto. Sem isso, mexer num slider de luz com a noite ligada devolve o valor diurno na cena.

> [!note] Reflexo acompanha
> O probe captura a cena real → céu escuro e prédios apagados já entram no cube. `updateEnvironmentSettings` faz `markCubeDirty()`, então alternar dia/noite recaptura. Durante a captura o `night` sobrevive: o override de `skyDrop` é um spread de `currentEnvironment`.

> [!note] Sem HDRI noturno
> `scene.environment` continua sendo o PMREM do HDRI **diurno** — quem apaga é `scene.environmentIntensity`. Trocar por um HDRI de noite de verdade = outro asset de vários MB; o tint + `environmentIntensity` entrega o mesmo efeito com zero download.

### Probe de reflexo (envMap dos prédios)

Fachada usa o cube do `buildingCubeTarget` como `envMap` (ver [[scene-managers|setEnvMap]]). Probe é **ancorado na cidade** por padrão, não na câmera. Todo knob vem de `ReflectionSettings` — aba **reflexo** do painel ([[html-components#ReflectionControls.tsx]]), defaults em [[scene-config#reflectionConfig.ts]], tipo em [[scene-types#ReflectionSettings]]:

| Campo | Padrão | Efeito no runtime |
|---|---|---|
| `enabled` | `true` | `false` → `setEnvMap(null)` e captura não roda; three.js cai no `scene.environment` (HDRI PMREM), então sobra reflexo difuso do céu — só a **cidade** sai do reflexo |
| `resolution` | `256` | Lado do `WebGLCubeRenderTarget`; trocar **recria** target + `CubeCamera` |
| `probeX/Y/Z` | `0, 18, 0` | Posição da captura (Y sobe = mais céu, desce = mais fachada) |
| `followCamera` | `true` | Probe na câmera; força recaptura todo intervalo |
| `skyDrop` | `0` | `offsetY` extra do céu **só na captura** |
| `envHorizon` | `0` | `donationManager.setEnvHorizon` → uniform `uEnvHorizon`; achata `reflectVec.y` no `getIBLRadiance`. Muda a **direção amostrada**, não a captura |
| `envRotY` | `0` | Graus. `donationManager.setEnvMapRotation` → `material.envMapRotation` (só eixo Y) |
| `heightFadeStart/End` | `32.8 / 57.6` | Faixa de altura sobre o chão usada pelo `smoothstep` |
| `heightBlur` | `0` | Piso máximo de rugosidade aplicado quando a câmera está alta |
| `reflectionDistanceStart/End` | `599 / 600` (fade desligado) | Reflexo completo até o início; fade até zero no fim, pela distância horizontal câmera→prédio |
| `updateInterval` | `4` | Frames entre capturas (`cubeFrameCounter % max(1, n)`) |
| `continuous` | `true` | Recaptura mesmo sem `cubeDirty` |
| `includeGround` | `true` | Mantém plano cinza + relevo na captura |
| `includeCityFloor` | `true` | Mantém asfalto/calçada/lotes (repassado a `beginEnvCapture`) |

`updateReflectionSettings` só paga o custo alto quando precisa: `resolution` diferente → dispose do target antigo, `createCubeProbe(res)`, `setEnvMap` na textura nova; `enabled` diferente → só `setEnvMap`. Alterações que mudam a captura são agrupadas pelo debounce de 180ms. O cube bruto usa `LinearFilter` sem mipmaps nativos: `MeshPhysicalMaterial` já solicita ao three.js um PMREM separado, portanto gerar uma segunda cadeia de mipmaps seria trabalho redundante.

> [!bug] Por que não na câmera
> Probe na posição da câmera = reflexo só aparecia de lado, em certo ângulo. Motivo: o shader amostra o cube pela direção `reflect()`. Prédio de frente → direção de amostragem sai da câmera pra trás/pra baixo → céu e chão vazios atrás do observador = fachada lisa. Girando a órbita, o cube inteiro escorregava junto → reflexo "surgia" em ângulos específicos. Probe fixo no centro: qualquer ângulo amostra a cidade e a imagem fica estável.

> [!note] Equilíbrio entre piso e céu abaixo do horizonte
> Espelho vertical visto **de cima** reflete pra **baixo**: `R.y = −V.y`. Câmera 24° acima do prédio → o raio refletido sai 24° abaixo do horizonte, faixa que agora contém chão, asfalto, lote e calçada por padrão. Se a prioridade for destacar céu/skyline, os controles permitem retirar essas superfícies da captura:
>
> 1. `groundPlane.mesh.visible = false` na captura (antes era forçado a `true`) — desligável por `includeGround`.
> 2. `donationManager.beginEnvCapture(includeCityFloor)` esconde o piso da cidade (asfalto, calçada, lotes) — ver [[scene-managers#beginEnvCapture]].
> 3. `skyDrop` soma `+0.2` ao `offsetY` do céu **durante a captura** (`updateSettings` → restaurado antes do `renderer.render`): a faixa azul/nuvens/sol desce ~36°, então o raio que aponta pra baixo ainda pega céu de verdade. O fundo da cena não se move — o offset do `EnvironmentSettings` que o usuário controla continua valendo no render normal.
>
> Com os dois controles ligados, o cubemap preserva o piso real da cena. Desligados, sobram telhados e fachadas dos vizinhos, com céu nos vãos.
>
> 4. **`envHorizon`** (seção *Direção do reflexo*) ataca o mesmo problema pelo outro lado: em vez de mover conteúdo dentro da captura, corrige a direção **na hora de amostrar**. Custo zero: nenhuma recaptura, nenhum `needsUpdate`.

> [!warning] Rotação rígida não iguala as faces
> A primeira tentativa foi `material.envMapRotation` no eixo X. Não funciona: uma `mat3` de rotação em torno de X deixa as direções **±X quase paradas** (estão sobre o eixo) e gira **±Z pelo ângulo inteiro** — a própria correção vira dependente da face, e o padrão do reflexo frontal deixa de bater com o das laterais.
>
> `envHorizon` escala só o Y do `reflectVec` (`reflectVec.y *= 1 − uEnvHorizon`, renormalizado), operação **simétrica em torno do eixo vertical**: toda fachada vertical passa a amostrar a mesma faixa de elevação do cube. Injetado no `getIBLRadiance` pelo `onBeforeCompile` do triplanar ([[scene-managers#Shader triplanar]]), ancorado em `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );`. `getIBLRadiance` mora em `#include <envmap_physical_pars_fragment>`, só expandido pelo three **depois** do `onBeforeCompile` — patch inlina `ShaderChunk.envmap_physical_pars_fragment` antes, senão âncora nunca casa (horizonte, fade por distância e early-return de `envMapIntensity` ficavam mortos). Em DEV, âncora ausente vira `console.warn`. Clamp em `0.95`: com `1.0` um reflexo apontando reto pra cima viraria `vec3(0)` → NaN.
>
> Sobra a diferença de **azimute**: cada face amostra uma direção horizontal distinta de um probe único, então o conteúdo continua diferente (a frente espelha o que está atrás da câmera, a lateral atravessa a cidade). Isso só some com `roughnessIntensity` maior (cone largo média o conteúdo) ou probe por edifício.
>
> `envRotY` continua útil e é seguro: rotação em Y gira o azimute de todas as fachadas verticais **igualmente**.

Consequências:

- **Câmera alta suaviza o reflexo.** A altura é `camera.position.y − groundPlane.mesh.position.y`, independente da distância horizontal ao centro. `heightFadeStart`/`heightFadeEnd` delimitam a transição; `heightBlur` define a rugosidade máxima. Um único uniform atende materiais instanciados e clones: sem loop por prédio, textura extra, recaptura ou novo probe. Alterar esses campos não suja o cubemap.
- **Só prédios próximos refletem.** O shader testa primeiro a distância horizontal ao quadrado. Após `reflectionDistanceEnd`, retorna antes de `textureCubeUV`; dentro da transição conserva o `smoothstep` linear. O controle de alcance agora reduz amostragens do cubemap, não apenas multiplica uma leitura já feita por zero. Durante a captura, `envMapIntensity = 0` também retorna antes das leituras de irradiância/radiância.
- **Órbita e culling não sujam o cube.** Girar a câmera daria captura idêntica — o reflexo varia sozinho pelo `reflect()`. Antes da CubeCamera, `beginEnvCapture` recompõe temporariamente todas as instâncias e custom shapes; `endEnvCapture` restaura o buffer compacto da câmera principal. Assim o probe fixo representa a cidade, não a lista visível da câmera. Exceções pagas por escolha do usuário: `followCamera` e `continuous` capturam todo `updateInterval`.
- **Asset assíncrono suja o cube.** `THREE.DefaultLoadingManager.onLoad = markCubeDirty` (+ `markCubeDirty()` no `onLoaded` do [[scene-builders#loadEnvironment.ts|loadEnvironment]]). O debounce deixa HDRI/texturas que chegam próximos compartilharem uma captura. `dispose` limpa `onStart`/`onLoad`/`onProgress` **só se ainda forem dele**: manager é global e, no StrictMode, o runtime descartado terminava de nascer depois do vivo e apagava os handlers dele (loading preso, HDRI sem sujar o cube).
- **Céu segue o probe durante a captura.** No render normal a esfera de céu segue a câmera; na captura recebe a posição do probe (`environmentUpdater.updatePosition`) e volta pra câmera antes do `renderer.render` do mesmo frame. Sem isso a esfera (raio 200) ficaria deslocada ou atrás do probe. Chão e piso urbano ficam visíveis por padrão.
- **Estrelas ficam fora do reflexo.** `environmentUpdater.setStarsVisible(false)` antes do `cubeCamera.update`. As estrelas são `Points` com `sizeAttenuation: false` — tamanho fixo em px numa face de 256px = manchas grandes na fachada, não pontinhos. O `updateSettings(currentEnvironment)` que restaura o céu depois da captura já devolve `visible = night`. Céu tingido de noite continua refletindo.
- **256px, não 128.** Fachada com `roughnessIntensity = 0` é espelho e amostra o nível mais nítido do PMREM — em 128px céu e skyline viravam mancha lisa. Custo cabe porque a captura é event-driven e debounced. `resolution` vai de 64 a 1024 pelo painel; dobrar o lado quadruplica o número de pixels das seis faces e do PMREM.

> [!tip] Reflexo lavado
> `envMapIntensity` da fachada (4.8 no padrão) multiplica o especular do cube; alto demais + ACES achata o contraste do reflexo até parecer chapado. Baixar o slider revela a imagem refletida. `normalScale = 20` também embaralha a normal por pixel → reflexo cintilante em vez de imagem legível. Sliders nas abas **texturas** e **reflexo** (mesmo `TextureSettings` — intensidade vive no material, não no probe).

### 4. Dispose

Limpeza completa ao desmontar:

```
dispose()
  ├── removeEventListener('mousemove')     ← hover
  ├── removeEventListener('pointerdown')   ← clique (detecção de drag)
  ├── removeEventListener('pointerup')     ← clique (raycast)
  ├── cancelAnimationFrame
  ├── removeEventListener('resize')
  ├── controls.removeEventListener("change") + controls.dispose()
  ├── donationManager.dispose()            ← inclui acessórios de topo, signs, focus mesh
  ├── focusRenderer.dispose()              ← target HDR, quad e material
  ├── groundPlane.dispose()
  ├── terrainRig.dispose()                 ← relevo procedural
  ├── horizonSilhouette.dispose()
  ├── lightingRig.dispose()
  ├── environmentUpdater.dispose()
  ├── loadedEnvMap?.dispose()
  ├── loadedBgTexture?.dispose()
  ├── buildingCubeTarget.dispose()
  ├── renderer.dispose()
  └── mount.removeChild(renderer.domElement)
```

## Configuração do Renderer

| Propriedade | Valor |
|---|---|
| `outputColorSpace` | `SRGBColorSpace` |
| `toneMapping` | `ACESFilmicToneMapping` |
| `toneMappingExposure` | `1.45` |
| `powerPreference` | `"high-performance"` (força GPU dedicada em laptop híbrido) |

## Por que essa Camada é Importante

Sem o runtime, a lógica ficaria espalhada em componentes React:
- código difícil de ler
- cleanup arriscado
- cena dependente do ciclo de render do React

Com o runtime:
- Three.js fica centralizado
- React só envia estado
- manutenção previsível

## Quando Mexer no Runtime

Mexa aqui quando a mudança envolver **coordenação entre várias partes da cena**:

- Mudar o comportamento do loop principal
- Alterar a regra de refresh da câmera
- Mudar a ordem de criação da cena
- Alterar a estratégia de `dispose`
- Adicionar nova peça que precisa ser sincronizada

## Relações

- Criado por: [[scene-hooks|useCityScene]]
- Usa builders: [[scene-builders]]
- Usa managers: [[scene-managers]]
- Tipos das opções: [[scene-types]]
- Valores de config: [[scene-config]]

### Visibilidade e preparo incremental (mobile)

- `IntersectionObserver` no mount e `visibilitychange` suspendem o rAF com canvas fora da tela ou aba oculta. Retorno pede frame/culling, reinicia a amostra de FPS e não trata a pausa como lentidão. `dispose` desconecta ambos.
- Hologramas só sustentam renders se distância e frustum permitirem vê-los. O GIF retoma sua fase pelo tempo real, sem desenhar os quadros intermediários. Não oculta luzes fora do enquadramento: elas ainda podem iluminar edifícios visíveis.
- `createScenePreparer.ts` substitui a preparação indiscriminada: inventário de objetos/luzes uma vez por passe, cache fraco por objeto/versão de material/geometria/instancing/ambiente, deduplicação de variantes e uploads por versão. A coleta de luzes para `compileAsync` usa uma visão da cena que percorre só as luzes, evitando atravessar a cidade para cada programa. Preserva variantes de tela e cubemap e cede a thread entre tarefas de aproximadamente 4 ms; uma operação isolada ainda pode exceder esse orçamento.
- `childadded` e `childremoved` pedem preparo, incluindo a retirada do último pool de LEDs. Intensidade/cor são uniforms; mudanças de presença de mapas/transparência ainda invalidam materiais.
- DPR, antialiasing, materiais, geometria, formatos de textura e limites de qualidade permanecem nos valores anteriores. KTX2/BatchedMesh/renderer em worker continuam alternativas dependentes de medição e validação visual.
- Verificação sem servidor/GPU: `scripts/check-mobile-performance.mjs`, `check-building-textures.mjs` e `check-horizon.mjs`. O teste do runtime executa modo mobile, cobre render em cada rAF de 30/60/90/120 Hz, inércia equivalente com OrbitControls real, repouso, DPR preservado, 10 FPS reais, suspensão/retomada e limpeza; as contagens não são benchmark no aparelho.
