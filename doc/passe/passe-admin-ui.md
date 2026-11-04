---
title: Passe · UI do Admin
tags:
  - passe
  - admin
  - ui
aliases:
  - passe-admin-ui
---

# Passe · UI do Admin

Página própria: `/dale/passe`. Entrada **Passe** na sidebar e navegação mobile. Catálogo/CRUD continua em `/dale/personalizacoes`, com atalho pro Passe.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/pages/admin/Pass.tsx` | Carregar árvore admin, montar recompensas, prévia pública, abrir edição |
| `src/components/pass/PassTrack.tsx` | Trilha horizontal ou grade responsiva; uma recompensa por cartão |
| `src/components/customization/CustomizationImage.tsx` | Miniatura compartilhada entre catálogo e passe |
| `src/components/admin/UnlockDialog.tsx` | Editar requisito; usado nas duas páginas |
| `src/components/admin/RewardExamples.tsx` | Exemplos locais dos modais reais de conquista e escolha |
| `src/lib/pass.ts` | Contrato visual `PassReward`, ordenação e mapa de preview |
| `src/lib/adminUnlock.ts` | Alvos de edição por opção/categoria |

## Visão Passe

Cartões lado a lado, imagem grande, categoria, nome e requisito. Linha conecta posições numeradas. Requisitos iguais mantêm cartões separados.

Cartões não exibem badges no topo. Recompensas gratuitas mostram apenas um indicador verde de desbloqueado, sem o texto **Grátis** ou **Disponível para todos**; conquistas não exibem o antigo badge com troféu.

Ordenação: **grátis primeiro → esforço estimado**. Doação pesa `D/40`; indicação pesa `R/2`. AND soma os esforços; OR usa a alternativa mais fácil. Empates preservam ordem do catálogo. Peso editorial e balanceamento em [[passe-balanceamento]]. Posição representa ordenação visual; não exige conquistar cartão anterior.

O botão no topo alterna entre a trilha horizontal e a grade. A grade mostra quatro personalizações por linha no desktop, duas em telas médias e uma em telas pequenas. Na trilha, há rolagem horizontal nativa, snap, botões anterior/próximo e região focável por teclado; o movimento respeita `prefers-reduced-motion`. Layout claro/escuro pelos tokens existentes.

Clique, Enter ou Espaço em qualquer cartão abre um modal amplo com nome, categoria, preview completo ampliado e metas em linhas verticais limpas, sem caixa: doação com `HandCoins`, indicação com `Users` e divisor **e/ou** quando ambas existem. O botão **Configurar** continua abrindo somente o editor administrativo.

| Personalização | Visual |
| --- | --- |
| Formato, topo, LED | `CustomizationThumb`: mesma geometria da cena, PNG cacheado, import lazy |
| Cor | Amostra da cor cadastrada |
| Textura | Imagem de preview da pasta, sem sufixo `_…`; mapas KTX2 não servem pra `<img>` |
| Letreiro / holograma | Ícones ilustrativos |
| Sem imagem cadastrada | Placeholder |

Opções base `default` e `none` ficam fora: estado inicial do edifício, não recompensa. Features usam requisito da categoria; demais usam requisito da opção.

## Prévia do usuário

Trilha só monta personalização **ativa** — opção inativa, categoria inativa e categoria com ancestral inativo ficam de fora nos dois modos. Ativar/desativar continua no catálogo ([[personalizacoes]]).

Switch **Prévia do usuário** remove botões de edição; resto do cartão é igual.

`PassTrack` recebe `rewards: readonly PassReward[]`, `layout: "track" | "grid"` e callback opcional `onConfigure`. Sem callback, somente leitura. Sem import de API/admin/auth. Outro consumidor pode fornecer recompensas do catálogo público. Prévia não carrega progresso individual; integração com conquistas continua em [[passe-cena]].

## Exemplos de notificações

Seção no topo de `/dale/passe` e `/dale/primeiros-inscritos`, disponível mesmo com catálogo carregando ou falhando. `RewardExamples` monta `RewardDialog` real sob demanda; Motion, miniaturas, teclado e layout iguais à cena.

- **Ver conquista desbloqueada**: Loftifício após R$ 50 acumulados; cartão ampliado, motivo curto, confete Realistic Look e **Ver em 3D**. Próximas metas em texto simples. **Continuar** encerra exemplo; na cena confirma lote inteiro de avisos.
- **Ver escolha por indicação**: 2 cadastros indicados, escolha entre Loftifício e Varanda Gourmet. Confirmar abre conquista do item escolhido, motivo por cadastro e próxima meta em 3 indicações no total (falta 1). Prop `goals?: number[]` (padrão `[2, 3]`); [[primeiros-inscritos]] passa metas do rascunho.
- Fechar, continuar ou escolher depois encerra exemplo. Reabrir reinicia; escolhas só alteram estado local. Nenhum request de progresso, escolha, confirmação ou gravação. Miniaturas podem carregar assets visuais.

Itens ilustrativos fixos; não concedem itens. Escolha por indicação celebra abertura com confete Canvas (movimento reduzido respeitado), usa cards ampliados e **Ver em 3D** (giro/zoom) para modelos, topos e LEDs; **Desbloquear recompensa** confirma item selecionado ou exibido na prévia. Mesma seção em [[primeiros-inscritos]].

## Dialog de liberação

Botão **Configurar** no cartão abre `UnlockDialog`. Catálogo mantém atalhos por opção/feature, usando mesmo diálogo.

| Eixo | Significa |
| --- | --- |
| Exigir doação | Soma de tudo que usuário já doou |
| Exigir indicações | Total histórico de quem entrou pelo código dele |

Dois ligados mostram **Como liberar**: **Doação + indicação** (`all`, ambas necessárias) ou **Doação ou indicação** (`any`, basta uma meta). Regras antigas abrem em `all`. Switch desligado envia `null`, nunca zero. Ligado sem valor positivo bloqueia salvar.

- Preview da frase via `formatUnlockCta` ([[passe-formatacao]]).
- `unlockedCount > 0`: aviso de acesso permanente pra quem já conquistou.
- **Tornar grátis**: desliga ambos.
- Dinheiro aceita `50`, `50,90`, `1.234,56` e `50.5`.
- Envia `unlockDonationMin`, `unlockReferralMin` e `unlockMode`: `null` limpa eixo; somente um eixo ou grátis envia `all`.
- Salvar recarrega catálogo e reposiciona recompensa automaticamente.
- Falha de carregamento mostra erro + tentar novamente; lista vazia tem estado próprio.

## Badge do requisito

Catálogo mantém `Grátis`, `R$ 50`, `3 indicações`, `R$ 50 + 3 indicações`, `R$ 50 ou 3 indicações` ou `Padrão`. Trilha destaca valor acumulado e indicações separadamente, com `+` ou `ou` conforme regra. Eixo não exigido nunca aparece.

## Regras-chave

- Ativo ≠ liberado. Desativar remove da cena e do passe; conquista fica registrada.
- Conquista permanente: subir requisito não remove acesso existente.
- `option_list`/`group` não recebem regra de categoria; editar opções.
- Backend invalida cache após escrita.

## Verificação

`node scripts/check-pass.mjs`: grátis, doações, indicações, centavos, empates, cartões individuais e entrada imutável; AND/OR, limites, legado, permanência e formatação. Sem servidor/navegador. `npm run build` + `npm run lint` verificam integração.

`node scripts/check-reward-examples.mjs`: abertura, duas opções, confirmação para cada item, próxima conquista distinta, fechar/reabrir, integração nas páginas e isolamento da API.

## Relacionado

- [[passe-front]] — mapa do módulo
- [[passe-formatacao]] — texto dos requisitos
- [[personalizacoes]] — catálogo e preview 3D
- [[html-components#PassTrack.tsx]] — contrato reutilizável
