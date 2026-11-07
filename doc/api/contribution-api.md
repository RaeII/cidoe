---
title: Contribuições — Pré-lançamento
tags: [cidoe, api, beta]
---

# Contribuições no pré-lançamento

`beta`: simulação local. API de cobrança Pix removida do frontend; sem `createPixCharge`, `getChargeStatus`, `getPendingCharge`, `PixCharge` ou `ChargeStatus`.

## Contratos

`Contribution`: novo `{ donationId: null, ongId, cityId, value }`; aumento `{ donationId, ongId, value }`. Valor em reais com duas casas. `BuildingProfile`: `{ name: string | null, description: string | null, image: string | null }`.

| Função | Destino | Uso |
|---|---|---|
| `simulateContribution(userId, contribution, city?)` | localStorage da conta | Confirmação explícita; retorna ID negativo. Mínimo R$ 5, máximo 3 edifícios locais. Aumento exige edifício da própria simulação; acumula beneficiárias e valor em centavos. |
| `fetchBuildingProfile(id, signal?, userId?)` | Perfil local primeiro (navegador, depois conta antiga); `GET /donation/:id/profile` para ID público sem edição local | Card e formulário. ID negativo nunca consulta backend. |
| `saveBuildingProfile(id, profile)` | localStorage do navegador (`guest`), sem conta | Salva nome, descrição e imagem somente no navegador. Nenhum PUT. |

## Interface

`ContributeDialog`: formulário → pagamento simulado → confirmação. Exige login antes de confirmar. ONG/cidade selecionadas nos catálogos existentes; aumentar mantém cidade. Sem QR, Copia e Cola, recebedor, consulta periódica ou retomada de cobrança no backend.

`Flow` em memória, associado a `userId`. Fechar confirmação libera nova simulação; fechar etapa de pagamento preserva somente essa etapa em memória. Reload preserva edifícios confirmados, não pagamento pendente. Falha de armazenamento mantém etapa de pagamento e exibe erro; não confirma criação.

`BuildingProfileForm` conserva limites de nome/descrição, validação e redimensionamento de imagem. Erro local exibido no formulário; dados de perfil da conta continuam usando API real de usuário.

## Verificação

`node scripts/check-contribution.mjs`: centavos/máscara, transição local, falha de armazenamento e ausência de sessão. `node scripts/check-prelaunch.mjs`: criação/aumento, isolamento, reload, perfil/aparência e nenhuma mutação HTTP.

Relacionado: [[index#Pré-lançamento]], [[donation-api]], [[html-components]].
