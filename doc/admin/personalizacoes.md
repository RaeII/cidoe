---
title: Admin · Personalizações
tags:
  - admin
  - customization
aliases:
  - personalizacoes
---

# Admin · Personalizações

Página de gestão do catálogo de personalizações da cena. Rota `/dale/personalizacoes`.

**Arquivo:** [`src/pages/admin/Customizations.tsx`](../../src/pages/admin/Customizations.tsx) · client em [`src/api/admin/admin.routes.ts`](../../src/api/admin/admin.routes.ts).

## O que faz

Carrega a árvore completa (`GET /admin/customization`, inclui inativas). Atalho **Configurar Passe** abre `/dale/passe`: página dedicada com trilha visual de recompensas, documentada em [[passe-admin-ui]].

Mostra **uma** categoria top-level por vez — `Select` shadcn no topo escolhe qual (rótulo + `(inativa)` quando desligada). Sem scroll longo. Estado = `selectedId`; fallback pro primeiro top-level (`sortOrder`) quando nada escolhido. **Customização** aninha subcategorias (Letreiro/Topo/LED/Holograma), renderizadas dentro da escolhida.

Por opção:
- **Ativa/Inativa** — `Switch` shadcn controlado. Abre confirmação antes do `PUT /admin/customization/options/:id`; cancelar preserva estado. Desativada some da cena.
- **Ações** — botão vertical de três pontos abre `DropdownMenu` shadcn.
  - **Editar** — dialog: label + value (hex, se Cor/Textura).
  - **Definir liberação** — dialog do requisito do passe. Ver [[passe-admin-ui]].
  - **Excluir** — ação destrutiva, só se **não** presa a código (`DELETE`). Presas a código (🔒 Formato/Topo/LED) não exibem essa ação.
- **Badge de requisito** — na sublinha, junto da key. Ver [[passe-admin-ui#Badge do requisito]].

Por categoria:
- **Ativa/Inativa** — `Switch` shadcn controlado. Abre confirmação antes do `PUT /admin/customization/categories/:id`; cancelar preserva estado. Serve pra ligar/desligar features (Letreiro/Holograma) e categorias inteiras.
- **Adicionar opção** — só em categoria extensível. **Cor** = dialog com hex.
- **Definir liberação** — só em categoria `feature` (Letreiro/Holograma), que não tem lista de opções onde guardar a regra. Ver [[passe-admin-ui]].

## Preview 3D: Formato, Topo e LED

Essas três categorias mostram o modelo, não só o nome — admin reconhece de relance.

- **Miniatura** — quadrado 48px na linha da opção, renderizada com a **mesma geometria da cena** ([[three-components#CustomizationPreview.tsx|CustomizationThumb]]). Um render por opção, depois cache.
- **Clique na miniatura** — dialog com o modelo inteiro: arrastar gira, scroll aproxima, auto-rotate parado quando o usuário assume.

| Categoria | Key da categoria | O que aparece |
|---|---|---|
| Formato | `shape` | o edifício do formato |
| Topo | `rooftop` | prédio baixo com o acessório no telhado |
| LED de arestas | `edge_light` | prédio alto com o LED aceso, fundo noturno |

Opção `none` (Nenhuma/Desligado) não tem miniatura — não há o que renderizar. Key sem builder no front (`resolveSubject`, ver [[three-components#CustomizationPreview.tsx]]) = linha normal, sem miniatura — nada quebra.

three.js entra por import dinâmico: as outras páginas do admin dividem o mesmo chunk e não podem pagar ~600 kB por isso. Por isso a página **não** importa nada de `scene/` fora de `import type`.

Miniaturas passam pelo componente compartilhado `CustomizationImage`, também usado em [[passe-admin-ui]]. Cor mostra amostra; textura mostra preview da pasta. Formato/topo/LED preservam botão de preview interativo.

## Textura: cadastradas × não-cadastradas

Categoria **Textura** não usa dialog de digitar caminho. Compara pastas do repo (`FACADE_TEXTURE_FOLDERS`, ver [[scene-textures]]) com o catálogo:

- **Cadastrada** = já é opção → usuário seleciona; admin controla (toggle/editar/excluir).
- **Não-cadastrada** = pasta no repo sem opção → linha tracejada + botão **Cadastrar** (`POST /admin/customization/options`, `value` = pasta, key = slug). Vira dado puro (`isCodeBound=false`) → depois dá pra excluir.

Textura nova = dropar pasta em `src/assets/texture/` + `npm run textures:webp` → aparece como não-cadastrada, sem editar código. Backend não valida asset (front só oferece pasta existente).

Textura cadastrada aparece em dois lugares: seletor **global** da cena ([[html-components#TextureControls.tsx|TextureControls]]) e seletor **por edifício** ([[html-components#BuildingManageDialog.tsx|BuildingManageDialog]], aba Aparência → Fachada).

## Regra-chave

Opção **presa a código** (`isCodeBound`) tem key travada a um builder do front — admin não cria/deleta, só toggle/edita label. Só **Cor** (e Textura-URL) é dado puro (`isExtensible`), CRUD livre.

Liberação por doação/indicação = módulo à parte: [[passe-admin-ui]] (tela) · [[passe-front]] (índice).

Backend + tabelas: [[personalizacoes|Módulo Personalizações (backend)]]. Consumo na cena: [[customization-api]].
