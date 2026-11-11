---
title: Three Components
tags:
  - cidoe
  - threejs
  - componentes
  - canvas
aliases:
  - Canvas
  - CitySceneCanvas
---

# Three Components

Componentes React responsáveis por montar a cena 3D.

## Objetivo da Camada

A pasta `src/components/three` isola o ponto de montagem da cena.

**Por que essa separação existe?**
- React cuida da árvore de componentes
- Three.js cuida do conteúdo dentro do canvas
- A cena não deve ser construída diretamente dentro do painel HTML

## Arquivos

- `CitySceneCanvas.tsx` — cena principal
- `CustomizationPreview.tsx` — preview isolado de uma personalização (admin)
- `BuildingPreview.tsx` — edifício completo durante a personalização no modal

## Arquivo Principal

### `CitySceneCanvas.tsx`

Componente pequeno por design. Faz três coisas:

1. Cria um `ref` para um `div`
2. Chama o hook [[scene-hooks|useCityScene]]
3. Renderiza o `div` onde `renderer.domElement` será anexado

### Props recebidas

| Prop | Tipo | Descrição |
|---|---|---|
| `buildingSettings` | `BuildingSettings` | Cor, roughness, metalness dos prédios |
| `textureSettings` | `TextureSettings` | Configurações PBR de textura |
| `groundSettings` | `GroundSettings` | Material e cor do chão |
| `lightSettings` | `LightSettings` | Luzes da cena |
| `environmentSettings` | `EnvironmentSettings` | HDRI / skybox |
| `reflectionSettings` | `ReflectionSettings` | Probe do envMap dos prédios ([[scene-runtime#Probe de reflexo (envMap dos prédios)]]) |
| `blockLayoutSettings` | `BlockLayoutSettings` | Tamanho de quadra e largura de rua |
| `facadeTexturePool` | `readonly string[]` | Texturas sorteáveis por edifício (`value` das ativas do catálogo). Vazio = textura global em tudo. Ver [[scene-textures#Sorteio por edifício]] |
| `grain` | `number` | Granulado de renderização. `0` = resolução nativa travada. Repassado ao `setGrain` do runtime — ver [[scene-runtime]] |
| `onStatsChange` | `(stats: SceneStats) => void` | Callback de métricas |

> [!note] Estado próprio
> `CitySceneCanvas` não guarda estado da cena. Apenas recebe estado do `CitySceneEditor` e entrega ao hook.

### Handle Imperativo (`CitySceneCanvasHandle`)

O componente expõe uma ref com métodos imperativos:

```typescript
canvasRef.current?.addDonation(value)
canvasRef.current?.addDonations(entries) // [{ value, customization? }]; formatos criados em fatias
canvasRef.current?.setDonations(entries)  // replace-all do backend
canvasRef.current?.focusOnDonation(id)
canvasRef.current?.clearFocus()
canvasRef.current?.updateDonationCustomization(id, customization)
```

Isso permite que `CitySceneEditor` dispare ações na cena sem criar ciclos de estado React. `setDonations(entries)` aplica o snapshot filtrado do backend ([[donation-api]]) — replace-all preservando os IDs do backend (ver [[scene-managers#setDonations]]).

> [!note] Doações iniciais vêm do backend
> As props `initialDonations` e `initialBuildingCustomizations` foram **removidas** (junto do `useEffect` de mount que as aplicava). Agora `CitySceneEditor` carrega o snapshot via `useDonations` e empurra por `setDonations` quando `loadState.status === "ready"`. Ver [[donation-api]].

## O que ele NÃO faz

O canvas não:
- cria luz manualmente
- cria `scene` ou `camera`
- gera prédios

Tudo isso fica no [[scene-runtime|runtime]].

## Por que isso é útil

Se você quiser trocar a forma como o canvas é montado, muda um componente pequeno.

Exemplos:
- adicionar overlay acima do canvas
- trocar a classe de layout do container
- adicionar comportamento visual no wrapper

Sem essa separação, qualquer mudança simples no container exigiria mexer no código 3D pesado.

## `CustomizationPreview.tsx`

Mostra **uma** personalização fora da cena. Usado no admin ([[personalizacoes]]) e nos modais de conquista e escolha por indicação ([[html-components#RewardDialog.tsx]]) pra ver o modelo, não só o nome. Só cola React + `WebGLRenderer`: quem monta a cena é [[scene-builders#createPreviewScene.ts|createPreviewScene]], que por sua vez usa os mesmos builders da cena — nada é remodelado aqui.

**Assunto** (`PreviewSubject`) = `{ kind, key }`, key crua do catálogo: `shape` (Formato), `rooftop` (Topo), `edgeLight` (LED).

Dois exports, mesma cena interna:

| Export | Uso | Custo |
|---|---|---|
| `CustomizationThumb` | miniatura na lista | render 1× por assunto → PNG data URL em cache module-level; depois é só `<img>`. **Um** `WebGLRenderer` compartilhado p/ todas as thumbs — renderer por thumb estoura limite de contextos (~16) e browser derruba o da cena principal |
| `CustomizationPreview` | preview grande no dialog | canvas vivo com `OrbitControls` (arrastar/zoom, auto-rotate), 1 contexto WebGL enquanto montado; 30 FPS, pausa em aba oculta |

**Detalhes:**
- **`resolveSubject(subject) === null`** — key sem builder no front, ou `none`: thumb some, dialog mostra "Sem preview 3D para esta opção"
- **Miniatura em `requestAnimationFrame`** — render sai do commit do React; lista com 10 itens não trava o paint
- **Sem WebGL** (contexto perdido, driver ruim) → cache guarda `""` e o componente devolve um bloco vazio, sem quebrar a página
- **Resize não reposiciona a câmera** — só a primeira medida válida chama `place()`; depois disso o giro é do usuário
- **Limite vertical** — `maxPolarAngle = Math.PI / 2`, como no `BuildingPreview`: câmera para no horizonte, sem mostrar a parte inferior do edifício. Giro horizontal e zoom preservados. Teste com `OrbitControls` real, sem DOM/GPU.
- **Teclado** — canvas focável; Shift + setas gira, +/− aproxima/afasta dentro dos limites de zoom. Foco do DS. Movimento reduzido desliga giro automático.
- **Falha de WebGL** — preview interativo mostra mensagem; escolha e restante do modal continuam disponíveis.
- **Dispose no unmount** — `view.dispose()` (cena) + `controls`, listeners, `renderer.forceContextLoss()` e o `canvas`; contexto liberado ao voltar/fechar, sem afetar renderer compartilhado das miniaturas.
- **Verificação** — `node scripts/check-signup-reward-dialog.mjs`: teclado, limites, aba oculta, descarte e falha de contexto, sem GPU/navegador.

> [!important] three.js entra por import dinâmico
> ~600 kB. `Customizations.tsx` importa este arquivo via `lazy()` + `Suspense` e **só `import type`** de qualquer coisa de `scene/` — um único import estático de builder (nem que seja pra pegar um guard) arrasta three pro chunk compartilhado do admin, e **toda** página admin paga o download (medido: 11 kB → 221 kB).

## `BuildingPreview.tsx`

Prévia 3D do edifício completo no [[html-components#BuildingCustomizer.tsx|BuildingCustomizer]], carregada por import dinâmico somente enquanto o modal está aberto. Recebe a aparência completa e as configurações de textura; reutiliza [[scene-builders#createPreviewScene.ts|createPreviewScene]] e os mesmos modelos/acessórios da cidade, em proporções normalizadas para avaliar o estilo.

- Preenche a área definida pelo customizador: no celular `clamp(96px, 28cqh, 208px)`, a partir de `md` toda a coluna esquerda. A lista de opções rola separadamente, mantendo a prévia visível. Dica curta **Arraste para girar** abaixo do canvas, sem cobrir o edifício; salvamento automático é informado pelo rodapé do modal. Canvas e enquadramento acompanham o tamanho pelo `ResizeObserver` existente.
- Um renderer/contexto por abertura. Alterar itens atualiza o modelo; cor, tint e opacidade atualizam materiais existentes, preservando câmera e GIF.
- OrbitControls: arrastar para girar, rolar para aproximar; deslocamento lateral desabilitado e ângulo polar limitado a 90° (`maxPolarAngle = Math.PI / 2`), impedindo ver o edifício por baixo. Giro automático respeita `prefers-reduced-motion`.
- Até 30 FPS e pixel ratio limitado a 1,5. Pausa renders com aba escondida ou prévia fora da tela (`IntersectionObserver`). Sem giro/animação/mudança dos controles, mantém o frame; resize, estilo, imagem carregada e retorno à tela pedem render.
- Texturas PBR usam o loader/cache compartilhado; só a textura selecionada e o concreto do topo são pedidos. A prévia completa os mapas mesmo se o cache da cidade estiver parcial; não pede displacement, que seu material não usa. Mapas locais clonados recebem tiling/offset sem modificar os mapas da cidade.
- Fecha → cancela rAF, desconecta observadores, descarta modelo, controles e renderer, remove canvas e chama `forceContextLoss`. Sem WebGL → feedback, mantendo a edição disponível.
- `node scripts/check-building-customizer.mjs` verifica o limite vertical com OrbitControls real sem DOM, preservação do zoom, pausa e limpeza com contexto simulado; [[scene-builders#createPreviewScene.ts|checagens de geometria]] verificam o modelo completo.

## Relação com o Hook

`CitySceneCanvas` é a porta de entrada. Quem cria e sincroniza a cena é o [[scene-hooks|useCityScene.ts]].

**Ordem de leitura natural:**

1. `CitySceneCanvas.tsx`
2. [[scene-hooks|useCityScene.ts]]
3. [[scene-runtime|createCitySceneRuntime.ts]]
