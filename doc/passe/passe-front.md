---
title: Passe de Conquistas (front)
tags:
  - passe
  - gamification
  - index
aliases:
  - passe-front
  - passe
---

# Passe de Conquistas — front

Personalização de edifício = conquista. Usuário libera quando bate meta de **doação** e/ou **indicação** que admin definiu.

Aqui = lado do front: de onde vem o dado, como vira texto, como admin edita regra, o que falta na cena.

> [!info] Regra mora no backend
> Modelo, motor de liberação e cenários ficam no vault do backend (`doc/modulos/passe/`). Front nunca decide quem pode usar o quê — só mostra. Ver [[customization-api]].

## Mapa

| Página | Responde |
| --- | --- |
| [[passe-formatacao]] | Como requisito vira texto. Regra "nunca mostre eixo não exigido" |
| [[passe-admin-ui]] | Tela onde admin define quanto custa cada personalização |
| [[passe-cena]] | Cadeado no painel do usuário — fase seguinte, contrato já fechado |

Camada de dados (`customizationApi.ts`, hook) fica em [[customization-api]]. Trilha visual compartilhada: `PassTrack` recebe recompensas por props; sem callback de edição, funciona em modo somente leitura. Admin inclui prévia das recompensas ativas.

## Ideia central

```
GET /customization/catalog  → o que existe + quanto custa   (igual pra todos, cacheado)
GET /customization/me       → quanto eu tenho + o que ganhei (por usuário, sem cache)
              ↓
      lib/unlock.ts  → badge, frase, "faltam X"
              ↓
   admin /dale/passe: define regra → PassTrack: trilha reutilizável
      cena: cadeado + RewardDialog com conquista, motivo e próxima meta
```

## Contrato do requisito

```ts
type UnlockRule = { donationMin: number | null; referralMin: number | null; mode?: "all" | "any" } | null;
```

| Valor | Lê-se |
| --- | --- |
| `null` | **grátis** — disponível pra todos |
| `{ donationMin: 30, referralMin: null }` | exige R$ 30 |
| `{ donationMin: null, referralMin: 3 }` | exige 3 indicações |
| `{ donationMin: 50, referralMin: 3, mode: "all" }` | exige **as duas** (AND) |
| `{ donationMin: 50, referralMin: 3, mode: "any" }` | exige **uma ou outra** (OR) |

Backend envia `mode`; ausente no catálogo antigo = `all`. Regras grátis continuam `null`.

> [!important] Zero não existe
> Backend recusa zero — "não exige" tem representação única (`null`). Nenhuma tela do front precisa tratar `0`. É isso que torna "R$ 30 de doação e 0 indicações" impossível de renderizar.

## Estado

| Peça | Situação |
| --- | --- |
| `unlock` no catálogo | ✅ [[customization-api]] |
| `fetchMyUnlocks()` | ✅ hook da cena; progresso, conquistas e avisos pendentes |
| `lib/unlock.ts` | ✅ [[passe-formatacao]] |
| UI admin (página Passe, trilha visual, dialog) | ✅ [[passe-admin-ui]] |
| Cadeado no `BuildingManageDialog` | ✅ [[passe-cena]] |
| Aviso de conquista | ✅ `RewardDialog`, cartões ampliados, confete, prévia 3D sob demanda e confirmação persistida |
| Escolha por indicação | ✅ `RewardDialog` → `SignupRewardDialog` (cards ampliados, revelação Motion, confete Canvas e prévia 3D sob demanda), validada no backend — [[primeiros-inscritos]] |

## Notificação de recompensa

Beta: mesmo modal da main para conquistas reais do backend. Sem reaceite de termos; somente onboarding e demais fluxos seguram o aviso. Simulação local não concede recompensa real.

`useCustomizationCatalog` reaproveita `/customization/me` no login/reload e ao concluir simulação. Abrir menu da conta também atualiza conquistas — encontra indicações recebidas em outra sessão. Doações simuladas não contam como doações reais nem geram conquistas no backend. Indicações e presentes de cadastro continuam reais. Sem polling de recompensas ou Pix nesta branch.

Passe conta indicação só com contribuição real do indicado (`progress.referrals`) — no pré-lançamento não avança. Etapas de escolha contam cadastros (`signupReferrals`), sem contribuição: recompensa por indicação do pré-lançamento vem daí ([[primeiros-inscritos]]). `PassTrack` avisa: "No passe, indicação conta quando a pessoa indicada contribui."

`AuthMenu` monta `RewardDialog` via lazy import só com pendências ou escolha disponível (`rewards.choice`). Pendência tem prioridade; escolha aparece depois. Espera onboarding, indicação, menu, compartilhamento, pagamento, ajuda e edição/info do edifício liberarem tela. Sem interromper formulário aberto. Onboarding pulado offline, ainda não confirmado no servidor: avisos aguardam conclusão persistida.

Modal agrupa lote em cartões: um item = cartão ampliado central; vários = grade de duas colunas, com motivo próprio por item. Título curto, motivo compacto com ícones (contribuição, indicações ou primeiros inscritos); sem troféu, kicker ou tipo da recompensa. Formatação compartilha `formatUnlockRequirement`/`formatReferrals`, preservando snapshot histórico e AND/OR. Formatos/topos/LEDs têm **Ver em 3D**, canvas único sob demanda; voltar preserva lote e não confirma aviso. Próxima conquista segue `sortPassRewards`, ignora grátis e conquistadas, usa `formatUnlockRemaining`; metas seguintes em texto simples, sem fundo/borda, destaque só nos valores. Sem meta: seção omitida. Motion revela cartões; `RewardConfetti` celebra ambos os modais com 300 partículas do Realistic Look. Movimento reduzido: fade, sem confete/giro automático. Cores, borda pixel, botão e Dialog do DS.

X, Esc, clique fora ou Continuar dispensam lote apresentado; um POST idempotente, sem nova leitura. Backend conserva pendências se rede falhar. Histórico anterior à migration 0026 marcado visto; sem enxurrada retroativa. Preservação administrativa de item já usado também não notifica. Grants novos por doação, indicação ou escolha por indicação ficam pendentes.

Testes: `bun test tests/reward-notifications.test.ts` (motivo/ordem/metas); `node scripts/check-reward-notifications.mjs` (ciclo do hook, requests, contas, abort, offline). Contrato: [[customization-api]].

## Relacionado

- [[customization-api]] — camada de dados
- [[personalizacoes]] — CRUD do catálogo (ativo/inativo, cor, textura)
- [[html-components#BuildingManageDialog.tsx]] — painel que vai ganhar cadeado
