---
title: IBGE (Admin)
tags:
  - cidoe
  - admin
  - ibge
  - geografia
aliases:
  - IBGE
  - Vincular IBGE
---

# IBGE

Página admin (`/dale/ibge`) pra **vincular** no banco o catálogo geográfico do IBGE — regiões, estados e municípios do Brasil. Serve pra doações e ONGs apontarem pra uma cidade real. Base de UI em [[componentes-html]]; auth e shell em [[area-admin]].

> [!info] Backend
> Front só chama as rotas. Busca no IBGE, normalização e upsert moram no **cidoe-back**, submódulo `ibge` (`POST /api/admin/ibge/sync`, `GET /api/admin/ibge/status`). Ambas exigem sessão admin (`token_admin`). Detalhe do backend: `cidoa-back/doc/modulos/admin/ibge.md`.

---

## Rota & navegação

- Rota lazy em `src/App.tsx`, dentro de `<RequireAdmin>` (só sessão do painel). Path `/dale/ibge`.
- Item na sidebar/bottom-bar vem de `src/lib/nav.ts` (ícone `MapPinned`) — fonte única, [[componentes-html#Componentes reutilizáveis|AppSidebar + MobileNav]] leem de lá.
- Página: `src/pages/admin/Ibge.tsx`. Mesmo shell do [[area-admin#Dashboard|Dashboard]]: `SidebarProvider` + `AppSidebar` + conteúdo rolável + `MobileNav`.

---

## Status

Ao montar, busca `getIbgeStatus()` → mostra se catálogo já foi vinculado (`linked`) + contagem de regiões/estados/municípios. Loading = `Skeleton`; erro = mensagem + botão "Tentar de novo" (mesmo padrão do [[area-admin#Dashboard|Dashboard]]). setState só em callback async (regra `set-state-in-effect`).

`linked` decide o texto: **"Dados vinculados"** (ícone check, cor accent) vs **"Não vinculado"** (ícone tracejado). Backend calcula `linked = 5 regiões + 27 UFs + ≥5000 municípios` — distingue sync real do seed de teste.

---

## Vincular / Ressincronizar

Botão único. Sem input. **Idempotente** — rodar de novo só atualiza (upsert por código IBGE no backend). Enquanto roda, botão vira "Sincronizando…". Sucesso: atualiza as contagens pela resposta (`linked = true`) e mostra `Vinculado: N regiões, N estados, N municípios`. Falha vira `ApiError` → mensagem inline.

O texto do botão muda com o estado: **"Vincular dados do IBGE"** quando não vinculado, **"Ressincronizar"** depois.

```ts
await syncIbge(); // POST /admin/ibge/sync (sem body)
// → { regions, states, cities }
```

---

## Camada de API

`src/api/admin/admin.routes.ts` (mesmo axios `http` compartilhado, cookie httpOnly):

| Função | Rota | Retorno |
| --- | --- | --- |
| `getIbgeStatus()` | `GET /admin/ibge/status` | `{ linked, regions, states, cities }` |
| `syncIbge()` | `POST /admin/ibge/sync` | `{ regions, states, cities }` |

Tipos em `src/api/admin/admin.types.ts` (`IbgeStatus`, `IbgeCounts`).

---

## Onde mexer?

| Objetivo | Arquivo |
| --- | --- |
| UI da página (status/vincular) | `src/pages/admin/Ibge.tsx` |
| Chamadas de API | `src/api/admin/admin.routes.ts` |
| Item da sidebar/nav | `src/lib/nav.ts` |
| Rota | `src/App.tsx` (dentro de `<RequireAdmin>`) |

---

## Relacionado

- [[area-admin]] — auth, shell admin, API admin
- [[edificios-teste]] — outra página admin de ação
- [[componentes-html]] — base de UI (shadcn, nav)
- [[index]] — visão geral + cena 3D
