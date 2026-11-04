---
title: Admin · Recompensas por indicação
tags: [cidoe, admin, passe]
aliases: [Benefícios de cadastro, Primeiros inscritos]
---

# Recompensas por indicação

Página `/dale/primeiros-inscritos` · `src/pages/admin/EarlySignups.tsx`. Menu desktop e mobile via `src/lib/nav.ts`; rota lazy protegida por `RequireAdmin`.

Etapas por meta de cadastros indicados. Indicado não precisa contribuir. Cada etapa: usuário escolhe **um** item. Não escolhidos seguem regra do [[passe-front|passe]] — lá indicação só conta com contribuição do indicado.

## Administrar

1. **Limitar aos primeiros inscritos** (switch). Desligado = todo cadastro comum participa. Ligado = primeiros N (1–1.000.000), contando desde início da plataforma.
2. **Adicionar etapa** (até 10). Cada etapa: meta de cadastros indicados (inteira, única) + itens oferecidos (modelo, textura, cor, topo, LED, letreiro, holograma).
3. Ativar **Distribuir benefícios** e salvar.

Exemplo: etapa 2 → Loftifício ou Varanda Gourmet; etapa 5 → Yatchcasa ou Residencial. Usuário com 5 indicações escolhe duas vezes.

> [!important] Meta = total de indicações
> Meta compara com total histórico do usuário, nunca com indicações novas. Escolheu na meta 2, admin cria meta 3 → falta **1**. Usuário com indicações antigas alcança meta nova na hora. Campo **Total de indicações**; botão `Etapa N · X no total`; texto abaixo calcula exemplo com as duas menores metas do rascunho.

Cards: estado salvo, usuários com escolha, posições restantes (ou "Sem limite"). Botões de etapa alternam grade de itens. Item grátis ou inativo desabilitado (só desmarca). Aviso de alteração pendente; erro mantém formulário.

Card de confirmação permanece acima dos indicadores dos checkboxes durante a rolagem (`z-20` no card, `z-10` nos indicadores).

## Visualizar modais

Seção **Exemplos de notificações**, acima da configuração. **Ver conquista desbloqueada** mostra animação com item, motivo e próxima meta. **Ver escolha por indicação** usa metas do rascunho (`goals`): escolha na menor meta, "faltam" até a seguinte pelo total (metas 2 e 3 → falta 1). Sem meta válida: 2 e 3. Confirmar mostra conquista escolhida. Exemplos locais, sem salvar formulário ou criar indicações/recompensas. Mesmos componentes da cena; também disponíveis no [[passe-admin-ui#Exemplos de notificações|Passe]].

## Regras

- Ativação exige etapa, itens ativos e com regra no passe. Padrões `default`/`none` não entram. Rascunho pausado aceita itens inativos.
- Meta identifica etapa: remover e recriar mesma meta não renova escolhas.
- Pausar esconde ofertas; escolhas feitas permanecem. Reduzir limite não revoga.
- Opção usada em etapa não pode ser excluída do catálogo; remover da etapa primeiro.
- Recompensa = liberação de uso, não cria edifício nem aplica visual.

## Integração

`getEarlySignupSettings` / `saveEarlySignupSettings` em `src/api/admin/admin.routes.ts`; tipos `EarlySignupInput` (`userLimit: number | null`, `tiers`) / `EarlySignupSettings` em `admin.types.ts`.

| Método | Endpoint | Uso |
| --- | --- | --- |
| GET | `/api/admin/early-signups` | Configuração, etapas e contagens |
| PUT | `/api/admin/early-signups` | Salvar etapas, limite e ativação |
| POST | `/api/customization/me/rewards/choose` | Escolha do usuário na cena |

Cena: `/customization/me` traz `signupRewards`; `RewardDialog` abre escolha. Backend recalcula oferta e recusa item/etapa forjados — front nunca é autoridade. Ver [[customization-api#Escolha por indicação]] e [[html-components#RewardDialog.tsx]].

## Verificação

`npm run build`, `npm run lint`, `node scripts/check-reward-notifications.mjs`. Backend: `bun test tests/reward-notifications.test.ts tests/early-signups.test.ts`.

Exemplos admin: `node scripts/check-reward-examples.mjs` (sem servidor/navegador/API). Escolha com cards ampliados, sem textos de regras/tipo/troféu; **Ver em 3D** abre modelo, topo ou LED com giro/zoom no mesmo modal. Botão **Desbloquear recompensa**. `node scripts/check-signup-reward-dialog.mjs` verifica seleção, prévia, envio, erros e descarte do contexto.
