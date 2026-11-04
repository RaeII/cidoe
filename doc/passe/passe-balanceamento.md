---
title: Passe · Balanceamento inicial
tags:
  - passe
  - balanceamento
---

# Passe · Balanceamento inicial

Configurado em 12/09/2026 no banco local: 41 alvos analisados; trilha ativa com 37 recompensas, 5 gratuitas e 32 conquistas. Quatro modalidades distribuídas: 7 doação, 6 indicação, 9 AND, 10 OR.

## Critério de ordenação

`src/lib/pass.ts`: grátis primeiro; depois esforço estimado. Uma unidade editorial = R$ 40 ou 2 indicações. Doação usa `D/40`, indicação `R/2`, AND soma, OR usa menor alternativa configurada. Eixo ausente não participa. Empates mantêm ordem do catálogo. Peso de indicação é hipótese de design, não valor financeiro ou conversão comprovada.

R$ 40 deriva de R$ 480 anuais ÷ 12, mediana reportada pelo [IDIS em 2024](https://www.idis.org.br/wp-content/uploads/2025/08/InfograficoDigital_PDB_2024.pdf). Não representa contribuição mensal observada. Sem histórico local de doações vinculadas/indicações, balanceamento permanece inicial.

Faixas editoriais: Inicial até 0,5 unidade; Comum até 1,5; Incomum até 3; Rara até 6; Épica até 12; Lendária acima de 12. Faixas documentam a configuração; não existe novo atributo de raridade no banco. Trilha informa dificuldade estimada.

## Exemplos

| Personalização | Regra |
| --- | --- |
| Grafite | R$ 5 |
| Terracota | 1 indicação |
| Azul Vidro | R$ 10 ou 1 indicação |
| Bronze | R$ 40 + 1 indicação |
| Torre torcida | R$ 120 ou 6 indicações |
| Chrysler | R$ 240 ou 12 indicações |
| Taipei 101 | R$ 480 ou 24 indicações |
| Helicóptero | R$ 480 + 12 indicações |
| One Trade | R$ 600 ou 30 indicações |
| Yachthouse | R$ 720 + 18 indicações |
| Holograma | R$ 960 + 24 indicações |

Valores acumulados; desbloqueios não consomem saldo. Estados padrão continuam gratuitos. Concrete024 mantém status inativo. Grants anteriores permanecem.

[Análise completa, todas as regras e simulações no backend](../../../cidoa-back/doc/modulos/passe/passe-balanceamento.md). Plano aplicado e snapshot anterior estão na mesma pasta do documento do backend.

Ver [[passe-admin-ui]], [[passe-formatacao]] e [[passe-front]].
