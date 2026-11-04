---
title: Catálogo de Personalizações (API)
tags:
  - api
  - customization
  - gamification
aliases:
  - customization-api
  - unlock
---

# Catálogo de Personalizações

Camada que traz do backend **quais** personalizações existem e **o que o usuário precisa fazer** pra usar cada uma. Código (builders, shaders, layout) fica no front; catálogo e regra de liberação vêm do backend.

Gamificação em volta desses dados = [[passe-front|módulo Passe]].

**Arquivos:** [`src/api/customizationApi.ts`](../../src/api/customizationApi.ts) · [`src/components/hooks/useCustomizationCatalog.ts`](../../src/components/hooks/useCustomizationCatalog.ts)

## `fetchCustomizationCatalog()`

`GET /customization/catalog` → normaliza árvore de categorias num objeto por-categoria pronto pro painel:

```ts
type CustomizationCatalog = {
  shapes: CatalogOption[];      // categoria 'shape'
  rooftops: CatalogOption[];    // 'rooftop'
  edgeLights: CatalogOption[];  // 'edge_light'
  colors: CatalogOption[];      // 'color' (value = hex)
  textures: CatalogOption[];    // 'texture' (value = caminho/URL)
  features: { sign: CatalogFeature | null; hologram: CatalogFeature | null };
};
type CatalogOption = { id: number; key: string; label: string; value: string | null; sortOrder: number; unlock: UnlockRule };
type CatalogFeature = { unlock: UnlockRule };
```

`features.*` = presença da categoria no payload. Backend só manda categoria **ativa**, então não-null = habilitado. Admin desliga Letreiro/Holograma → some do painel. Feature carrega regra própria (não tem lista de opções onde guardar).

`option.key` = contrato com builder (`twisted`, `helipad`, `led`…). Painel faz cast `key as BuildingShape` etc. Formato novo exige builder no front — admin não cria.

Requisito viaja no catálogo público porque é **igual pra todo visitante**. É isso que preserva o cache do backend e deixa quem está deslogado ver o passe inteiro com cadeado.

## `fetchMyUnlocks()`

`GET /customization/me` (exige sessão) → progresso e conquistas do usuário:

```ts
type MyUnlocks = {
  progress: { donated: number; referrals: number };
  unlockedOptionIds: number[];      // inclui presentes de cadastro, mesmo quando item é grátis
  unlockedCategoryKeys: string[];   // 'sign', 'hologram'
  pendingRewards: RewardNotification[]; // até 100 avisos ainda não dispensados
};
```

Separado do catálogo de propósito: catálogo é igual pra todos e fica em cache; isto é por-usuário e nunca cacheável. Front junta os dois.

Conquista é **permanente**: admin subir o limiar não tira nada daqui.

## Formatação do requisito

`UnlockRule` = `{ donationMin: number | null; referralMin: number | null } | null`. `null` no topo = grátis. Eixo `null` = não exige. **Zero não existe** — backend recusa, então nenhuma tela precisa tratar.

Tipo e todas as funções de exibição vivem em [`src/lib/unlock.ts`](../../src/lib/unlock.ts) — fonte única. Ver [[passe-formatacao]].

## `useCustomizationCatalog()`

Hook: carrega catálogo 1× no mount, retorna `{ catalog, rewards: { pending, next, choice, nextChoice, signupReferrals, choose, deferChoice, dismiss } }`. `catalog: null` = carregando; falha vira catálogo vazio. Consumido em [[html-components#CitySceneEditor|CitySceneEditor]], passado ao [[html-components#BuildingManageDialog.tsx|BuildingManageDialog]] e ao [[html-components#BuildingCustomizer.tsx|BuildingCustomizer]] via prop `catalog`. `rewards` segue para `AuthMenu` → `RewardDialog`.

Endpoint cacheado no backend (staleness ≤60s), mas o cache é **invalidado a cada escrita do admin** — mudança de regra aparece na cena na hora.

Hook busca `/customization/me` por usuário autenticado. Dados vinculados ao ID impedem reutilizar conquistas de outra sessão. Opções/features recebem `isUnlocked` derivado de grátis, ledger ou progresso; admin visualiza todos. Erro/carregamento de conquistas mantém itens pagos bloqueados. Ver [[passe-cena]] e [[primeiros-inscritos]].

`useCustomizationCatalog(refreshKey = 0)` refaz conquistas ao mudar a chave, sem baixar novamente o catálogo; editor incrementa após simulação concluída e ao abrir menu da conta. Login/reload consulta por mudança de usuário. Sem polling, foco de janela ou listeners de visibilidade adicionais. `useMemo` mantém catálogo, avisos e próxima meta entre alterações visuais/estatísticas.

## Avisos de conquistas

`pendingRewards`: `key` (`option:ID` ou `category:ID`), `label`, `categoryKey`, `categoryLabel`, `optionKey` (nullable), `value` e `unlock`. Visual vem junto, mesmo com catálogo cacheado antigo. `unlock` = snapshot histórico; null = presente/escolha. `signupReferralMin` (opcional) = item escolhido na etapa de N indicações; motivo vira "Você indicou N pessoas que se cadastraram". Nunca inferir conquista comparando listas locais de acesso: grátis/admin/presente também liberam acesso.

`acknowledgeRewards(keys)` → `POST /customization/me/rewards/acknowledge`, `{ keys: string[] }`, 204. Um lote ao dispensar modal; sem GET seguinte. Backend limita 100 chaves e escopa pela sessão. Confirma só chaves apresentadas; conquista concorrente continua pendente.

Hook oculta dispensadas imediatamente, inclusive contra GET atrasado. Falha no POST: toast, permanece fechado nesta sessão; servidor conserva pendência para próxima visita. Logout/troca de conta não reaproveita dados alheios; request anterior abortado. Duas abas já abertas podem mostrar mesmo aviso antes da confirmação; futuras leituras respeitam confirmação persistida.

## Escolha por indicação

`signupRewards` em `/customization/me`: `null` (campanha pausada/fora do limite) ou `{ referrals, tiers: [{ referralMin, rewards: RewardNotification[] }] }`. `referrals` = cadastros indicados, sem contribuição. Só etapas não escolhidas e itens não conquistados.

Hook deriva `choice` (menor etapa com `referralMin <= referrals`), `nextChoice` (primeira acima) e `signupReferrals`. `choose(referralMin, key)` → `POST /customization/me/rewards/choose`, resposta = `/me` completo; trava clique duplo (`choosing`), descarta GET mais antigo (`requestVersion`). Erro: relê `/me` e repassa erro ao modal. `deferChoice()` esconde até `refreshKey` mudar.

Backend é autoridade: recalcula oferta, recusa etapa não alcançada (`409`), chave fora da oferta (`400`), segunda escolha (`409`); retry da mesma escolha é no-op. Ver [[primeiros-inscritos]].

Deploy: migration backend `0026_reward_notifications.sql` → backend → frontend. Front tolera `pendingRewards` ausente durante transição, sem inventar avisos. Ver [[passe-front]].

## Fluxo

```mermaid
flowchart LR
  Editor[CitySceneEditor] --> Hook[useCustomizationCatalog]
  Hook --> API[fetchCustomizationCatalog]
  API --> BE[GET /customization/catalog]
  Hook --> Panel[BuildingManageDialog]
  Hook --> Modal[BuildingCustomizer no pagamento]
  Panel --> |key as BuildingShape| Builders[create*BuildingMesh]
  Me[fetchMyUnlocks] --> BEME[GET /customization/me]
  Fmt[lib/unlock] --> Panel
  Fmt --> Admin[Admin · Personalizações]
```

## Modelo Yatchcasa

Key `yachthouse`, label **Yatchcasa**. Migration backend `0012_yachthouse_building.sql` inclui opção em `shape`, ordem 11, presa a código; `0024_yatchcasa_label.sql` renomeia label (key mantida). Painel e preview reutilizam catálogo existente; aplicar migration e aguardar cache público (até 60 s) para disponibilizar opção. Builder em [[scene-builders#createYachthouseBuildingMesh.ts]].

## Modelo Residencial

Key `residential`, label **Residencial (sacadas)**. Migration backend `0015_residential_building.sql` inclui opção em `shape`, ordem 12, presa a código, **sem requisito** (grátis até admin configurar liberação). Painel e preview reutilizam catálogo; aplicar migration e aguardar cache público (até 60 s). Enum `buildingShape` do backend aceita `residential`. Builder em [[scene-builders#createResidentialBuildingMesh.ts]].

## Modelo Residencial (janelas)

Key `apartment`, label **Residencial (janelas)**. Migration backend `0023_apartment_building.sql` inclui opção em `shape`, ordem 13, presa a código, **sem requisito** (grátis até admin configurar liberação). Enum `buildingShape` do backend aceita `apartment`. Aplicar migration e aguardar cache público (até 60 s). Builder em [[scene-builders#createApartmentBuildingMesh.ts]].

## Modelo Varanda Gourmet

Key `gourmet`, label **Varanda Gourmet**. Migration backend `0025_gourmet_building.sql` inclui opção em `shape`, ordem 14, presa a código, **sem requisito** (grátis até admin configurar liberação). Enum `buildingShape` do backend aceita `gourmet`. Aplicar migration e aguardar cache público (até 60 s). Builder em [[scene-builders#createGourmetBuildingMesh.ts]].

## Modelo Loftifício

Key `loft`, label **Loftifício** (loft + edifício). Migration backend `0027_loft_building.sql` inclui opção em `shape`, ordem 15, presa a código, **sem requisito** (grátis até admin configurar liberação). Enum `buildingShape` do backend aceita `loft`. Aplicar migration e aguardar cache público (até 60 s). Builder em [[scene-builders#createLoftBuildingMesh.ts]].

## Combinação dos requisitos

`unlock.mode`: `all` exige todos os eixos preenchidos; `any` libera ao atingir um deles. Eixo `null` não conta como alternativa cumprida. Catálogo antigo sem `mode` usa `all` no front. Migration backend `0013_customization_unlock_mode.sql` adiciona modo sem alterar conquistas existentes. Ver [[passe-front]].
