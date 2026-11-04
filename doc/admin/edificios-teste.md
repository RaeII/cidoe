---
title: Edifícios de Teste (Admin)
tags:
  - cidoe
  - admin
  - testing
aliases:
  - Edifícios de Teste
  - Test Buildings
---

# Edifícios de Teste

Página admin (`/dale/edificios-teste`) pra gerar/excluir edifícios fictícios em massa. Edifício = doação — a cena desenha cada doação como prédio. Serve pra testar render e velocidade de carga com muitos prédios. Base de UI em [[componentes-html]]; auth e shell em [[area-admin]].

> [!info] Backend
> Front só chama as rotas. Lógica (geração aleatória, seed de cidade/ONG, senha destrutiva) mora no **cidoe-back**, submódulo `test-buildings` (`POST`/`DELETE /api/admin/test-buildings`). Ambas exigem sessão admin (`token_admin`).

---

## Rota & navegação

- Rota lazy em `src/App.tsx`, dentro de `<RequireAdmin>` (só sessão do painel). Path `/dale/edificios-teste`.
- Item na sidebar/bottom-bar vem de `src/lib/nav.ts` (ícone `Blocks`) — fonte única, [[componentes-html#Componentes reutilizáveis|AppSidebar + MobileNav]] leem de lá.
- Página: `src/pages/admin/TestBuildings.tsx`. Mesmo shell do [[area-admin#Dashboard|Dashboard]]: `SidebarProvider` + `AppSidebar` + conteúdo rolável + `MobileNav`.

---

## Total atual

Ao montar, busca `getDashboardStats().donations.count` (mesma rota do dashboard, sem endpoint novo) → mostra total. Depois atualiza otimista pela resposta de cada operação (criar devolve `total_active`; excluir zera). setState só em callback async (regra `set-state-in-effect`, igual [[area-admin#Dashboard]]).

---

## Criar

Input de quantidade (1..200000) + botão. **Acumulativo** — cada chamada soma. Valida faixa no cliente antes de chamar; backend revalida (400 fora da faixa). Sucesso mostra `+N criados. Total: X`.

> [!tip] Textura dos prédios de teste
> Doação de teste não carrega textura: quem varia a fachada é a **cena**. Com `randomPerBuilding` ligado (padrão, aba **texturas**), cada prédio sorteia uma entre todas as texturas **ativas do catálogo** ([[personalizacoes]]) — cidade de teste sai com fachadas variadas, não uma só. Sorteio é determinístico pelo id da doação. Ver [[scene-textures#Sorteio por edifício]].

```ts
await createTestBuildings(count); // POST /admin/test-buildings { count }
// → { inserted, total_active }
```

---

## Excluir todos (destrutivo)

> [!danger] Irreversível
> Apaga **TODAS** as doações do banco (não só as de teste). Trava dupla no backend: `confirm: true` + senha `TEST_BUILDINGS_DELETE_PASSWORD` do `.env` do cidoe-back.

Fluxo de confirmação usa o primitivo [[componentes-html#shadcn/ui — primitivos|`Sheet`]] (já vendorizado, sem lib nova):

1. Botão destrutivo "Excluir todos os edifícios" abre o `Sheet`.
2. `Sheet` pede a senha (input `type=password`). Botão "Excluir tudo" desabilitado até digitar.
3. Enter ou clique → chama a rota. Senha errada = **403** → mantém aberto pra nova tentativa. Sucesso → fecha, zera total, mostra `N excluídos`.

```ts
await deleteAllBuildings(password); // DELETE /admin/test-buildings { confirm: true, password }
// → { deleted }
```

> [!important] Front não é a defesa
> A senha e o `confirm` são validados no **servidor**. O `Sheet` é só UX (evita clique acidental). Ver [[area-admin#RequireAdmin|defesa em profundidade]].

---

## Camada de API

`src/api/admin/admin.routes.ts` (mesmo axios `http` compartilhado, cookie httpOnly):

| Função | Rota | Retorno |
| --- | --- | --- |
| `createTestBuildings(count)` | `POST /admin/test-buildings` | `{ inserted, total_active }` |
| `deleteAllBuildings(password)` | `DELETE /admin/test-buildings` | `{ deleted }` |

Tipos em `src/api/admin/admin.types.ts` (`CreateTestBuildingsResult`, `DeleteAllBuildingsResult`). `DELETE` manda body via `{ data: {...} }` do axios.

---

## Onde mexer?

| Objetivo | Arquivo |
| --- | --- |
| UI da página (criar/excluir) | `src/pages/admin/TestBuildings.tsx` |
| Chamadas de API | `src/api/admin/admin.routes.ts` |
| Item da sidebar/nav | `src/lib/nav.ts` |
| Rota | `src/App.tsx` (dentro de `<RequireAdmin>`) |

---

## Relacionado

- [[area-admin]] — auth, shell admin, API admin
- [[componentes-html]] — base de UI (shadcn, `Sheet`, nav)
- [[index]] — visão geral + cena 3D
