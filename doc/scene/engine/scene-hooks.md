---
title: Scene Hooks
tags:
  - cidoe
  - react
  - hooks
  - bridge
aliases:
  - Hooks
  - useCityScene
  - Bridge React-Three
---

# Scene Hooks

A ponte entre React e Three.js: `src/scene/hooks/useCityScene.ts`.

## Catálogo no fluxo de contribuição

`src/components/hooks/useCustomizationCatalog.ts` atende o [[html-components#BuildingCustomizer.tsx|menu do edifício]] e as notificações do passe. Retorna `{ catalog, rewards }`. Catálogo carregado uma vez; `refreshKey` refaz somente conquistas quando `CitySceneEditor` confirma pagamento ou usuário abre menu da conta. Login/reload busca por usuário. Mesma resposta alimenta permissões, pendências e próxima meta, sem polling adicional. `useMemo` mantém referências entre estatísticas da cena. Avisos dispensados filtrados por sessão, inclusive contra resposta atrasada; ACK em lote ao fechar. Ver [[customization-api#useCustomizationCatalog()]] e [[passe-front]].

## Objetivo do Hook

Esse hook existe para que os componentes React **não precisem conhecer diretamente** a implementação do runtime.

**Duas responsabilidades principais:**
1. Criar o [[scene-runtime|runtime]] uma única vez
2. Sincronizar mudanças de estado React com o runtime

## Como Funciona

### Criação

Quando [[three-components|CitySceneCanvas]] monta:

1. O hook lê o `mountRef` (o `div` do canvas)
2. `await createCitySceneRuntime(...)` com as settings atuais (`settingsRef`) — criação **assíncrona**, em etapas ([[scene-runtime#Desempenho (TBT e celular)]])
3. Desmontou no meio → `dispose()` assim que resolver. Senão salva em `runtimeRef`
4. Reaplica o que mudou durante a criação (compara identidade com o snapshot usado), chama `setFacadeTexturePool` e `setGrain` (efeitos deles rodaram com runtime `null`) e drena a fila de chamadas imperativas

> [!warning] Sem WebGL / WebGL por software
> `await createCitySceneRuntime` em `try/catch`. Sem WebGL (robô, verificação do login com Google, GPU bloqueada) o renderer lança erro; com WebGL por software (SwiftShader, llvmpipe) o runtime rejeita de propósito. Sem catch React desmonta app inteiro → home em branco. Com catch: `runtimeRef` fica `null`, fila de chamadas vira `null` (descarta), efeitos viram no-op (`?.`), catch emite `sceneReady: true` (nada mais vai carregar) → página de loading sai, resto da home renderiza.

> [!note] settingsRef
> Settings mais recentes numa ref atualizada por effect sem deps (roda antes do effect de criação). Criação lê o snapshot; o que mudar enquanto o runtime nasce é reaplicado no fim. Atualizações depois disso: efeitos de sincronização.
>
> `facadeTexturePool` vem do catálogo do backend (fetch assíncrono): chega depois do mount e entra pelo efeito de sincronização (ou pelo passo 4). Ver [[scene-textures#Sorteio por edifício]].

> [!note] Fila de chamadas (`callRuntime`)
> `addDonation`, `addDonations`, `setDonations`, `updateDonationCustomization`, `focusOnDonation`, `clearFocus` antes do runtime existir vão pra `pendingCallsRef` e rodam na ordem quando ele sobe — o editor pode chamar `setDonations` antes da criação terminar.

### Sincronização

Cada `useEffect` é responsável por uma área:

```typescript
useEffect(() => {
  runtimeRef.current?.updateBuildingSettings(buildingSettings);
}, [buildingSettings]);

useEffect(() => {
  runtimeRef.current?.updateTextureSettings(textureSettings);
}, [textureSettings]);

// Catálogo chega depois do mount (fetch): o pool entra por efeito, não no setup.
useEffect(() => {
  runtimeRef.current?.setFacadeTexturePool(facadeTexturePool);
}, [facadeTexturePool]);

useEffect(() => {
  runtimeRef.current?.updateGroundSettings(groundSettings);
}, [groundSettings]);

useEffect(() => {
  runtimeRef.current?.updateLightSettings(lightSettings);
}, [lightSettings]);

useEffect(() => {
  runtimeRef.current?.updateEnvironmentSettings(environmentSettings);
}, [environmentSettings]);

useEffect(() => {
  runtimeRef.current?.updateReflectionSettings(reflectionSettings);
}, [reflectionSettings]);

useEffect(() => {
  runtimeRef.current?.updateBlockLayout(blockLayoutSettings);
}, [blockLayoutSettings]);

useEffect(() => {
  runtimeRef.current?.updateTerrainSettings(terrainSettings);
}, [terrainSettings]);

useEffect(() => {
  runtimeRef.current?.setGrain(grain);
}, [grain]);
```

> [!note] grain
> Número solto, não entra na criação. Efeito de sync roda com runtime `null` no mount → aplicado no passo 4 da criação. Ver granulado em [[scene-runtime]].

> [!note] terrainSettings
> Vai na criação (snapshot de `settingsRef`) — um `useEffect` dedicado chama `updateTerrainSettings` quando muda. Ver relevo em [[scene-runtime]].

Isso é importante para evitar um efeito gigante tentando fazer tudo.

### Retorno

O hook retorna um objeto com referências estáveis (via `useCallback`) que delegam ao runtime atual via `callRuntime` (fila enquanto ele não existe):

```typescript
{
  addDonation: (value: number) => void
  addDonations: (values: number[]) => void
  setDonations: (entries: { id: number; value: number }[]) => void
  updateDonationCustomization: (donationId: number, customization: BuildingCustomization) => void
  focusOnDonation: (donationId: number) => void
  clearFocus: () => void
}
```

Cada função é memorizada para não recriar o handle imperativo do [[three-components|CitySceneCanvas]] a cada render. `setDonations` é `useCallback` estável que delega ao runtime — o editor chama com o snapshot filtrado do backend ([[donation-api]]).

## `useEffectEvent`

O hook usa `useEffectEvent` para callbacks que não devem recriar o runtime:

```typescript
const handleStatsChange = useEffectEvent((stats: SceneStats) => {
  onStatsChange(stats);
});

const handleHoverChange = useEffectEvent(
  (value: number | null, x: number, y: number) => {
    onHoverChange?.(value, x, y);
  },
);

const handleBuildingClick = useEffectEvent(
  (donationId: number | null) => {
    onBuildingClick?.(donationId);
  },
);
```

Isso repassa os callbacks para o runtime sem recriar o runtime toda vez que o React renderiza — cada callback sempre vê o valor mais recente sem precisar ser listado como dependência.

## Cleanup

Quando o canvas desmonta:

```typescript
return () => {
  cancelled = true;          // criação em curso descarta o runtime quando resolver
  runtimeRef.current = null;
  runtime?.dispose();
};
```

Evita vazamentos de:
- renderer e WebGL context
- event listeners (`resize`)
- animation frame (`requestAnimationFrame`)
- objetos da cena (geometrias, materiais, texturas)

## Por que Usar um Hook

- O [[three-components|componente do canvas]] continua simples
- O [[scene-runtime|runtime]] não fica acoplado diretamente ao componente
- O ciclo de vida fica explícito e testável isoladamente

## Quando Mexer Aqui

Mexa em `useCityScene.ts` quando o problema for de **sincronização entre React e runtime**:

| Problema | Ação |
|---|---|
| Mudança de estado não chega na cena | Verifique os `useEffect` de sync |
| Novo método do runtime precisa ser chamado | Adicione `useEffect` correspondente |
| Lifecycle de montagem/desmontagem precisa mudar | Edite o `useEffect` principal |

> [!tip]
> Se o problema for comportamento interno da cena, o arquivo certo provavelmente é [[scene-runtime|createCitySceneRuntime.ts]].

## Relações

- Usado por: [[three-components|CitySceneCanvas]]
- Cria: [[scene-runtime|createCitySceneRuntime]]
- Tipos de opções: [[scene-types]]
