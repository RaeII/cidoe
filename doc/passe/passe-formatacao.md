---
title: Passe · Formatação do Requisito
tags:
  - passe
  - lib
aliases:
  - passe-formatacao
  - unlock-lib
---

# Passe · Formatação do Requisito

**Arquivo:** [`src/lib/unlock.ts`](../../src/lib/unlock.ts)

Fonte **única** que traduz requisito e progresso em texto. Admin e cena importam daqui.

## Por que existe

Regra de produto mais fácil de quebrar: **nunca mostre o eixo que não é exigido**. Ninguém pode ler "R$ 30 de doação e 0 indicações".

Se cada tela montasse a frase sozinha, uma esqueceria. Módulo único = regra vira código, não lembrança.

## Como a regra é aplicada

Função interna `parts()` monta lista só com eixo não-nulo:

```ts
function parts(rule: NonNullable<UnlockRule>): string[] {
  const out: string[] = [];
  if (rule.donationMin != null) out.push(formatBRL(rule.donationMin));
  if (rule.referralMin != null) out.push(formatReferrals(rule.referralMin));
  return out;
}
```

Eixo `null` nunca entra na lista → nunca chega na tela. Regra vira estrutura de dados, não `if` espalhado.

Mesmo princípio em `formatUnlockRemaining`: eixo **já cumprido** também some. Só o que falta é informação. Em `mode: "any"`, atingir uma meta já devolve `null`; antes disso, alternativas aparecem ligadas por `ou`.

## API

| Função | Devolve |
| --- | --- |
| `formatUnlockRequirement(rule)` | Badge curto: `Grátis` · `R$ 50` · `3 indicações` · `R$ 50 + 3 indicações` · `R$ 50 ou 3 indicações` |
| `formatUnlockCta(rule)` | Frase do usuário: `Doe R$ 50 e faça 3 indicações para liberar` · variante `ou` em `any` |
| `meetsUnlock(rule, progress)` | Progresso já satisfaz? |
| `formatUnlockRemaining(rule, progress)` | `Faltam R$ 20 e 1 indicação` · `null` quando já bate |
| `formatBRL(v)` | `R$ 50` (inteiro) · `R$ 49,90` (com centavo) |
| `parseMoney(raw)` | `"50,90"`/`"50.90"` → `50.9`; vazio, zero, texto → `null`. Usado no [[passe-admin-ui#Dialog de liberação\|UnlockDialog]] e no [[html-components#ContributeDialog.tsx\|ContributeDialog]] |
| `formatReferrals(n)` | `1 indicação` · `3 indicações` |

Tipos `UnlockRule` e `UnlockProgress` também saem daqui — `customizationApi.ts` e `admin.types.ts` importam, não redeclaram.

## Detalhes

- **Centavo zero some.** `R$ 50`, não `R$ 50,00`. Badge fica limpo; valor quebrado ainda mostra `R$ 49,90`.
- **Plural correto.** `1 indicação` vs `3 indicações`.
- **Regra vazia cai em grátis.** Backend serializa grátis como `null`, mas se vier objeto com dois nulos, `formatUnlockRequirement` devolve `Grátis` em vez de string vazia.
- **Sem tratamento de zero.** Backend recusa. Se um dia aparecer, é bug de backend, não de exibição.

## Onde é usado

| Consumidor | Função |
| --- | --- |
| [[passe-admin-ui\|Admin · badge da linha]] | `formatUnlockRequirement` |
| [[passe-admin-ui\|Admin · preview do dialog]] | `formatUnlockCta` |
| [[passe-admin-ui\|Admin · visão Passe]] | `formatUnlockRequirement` |
| [[passe-cena\|Cena · cadeado]] | `canUseCustomization` + `formatUnlockCta` |

Preview do admin usar a **mesma** `formatUnlockCta` da cena é o que garante que admin e usuário nunca leem coisas diferentes.

## Relacionado

- [[customization-api]] — de onde vêm `rule` e `progress`
- [[passe-front]] — índice do módulo

## Direito permanente

`canUseCustomization(rule, progress, granted, isAdmin)` combina grátis, progresso e grant. `granted` inclui passe e [[primeiros-inscritos]]; não depende do progresso atual. `progress = null` mantém item pago bloqueado, salvo grant/admin.
