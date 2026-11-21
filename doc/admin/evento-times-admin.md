---
title: Administração do evento dos times
tags:
  - admin
  - evento
  - telao
aliases:
  - evento-times-admin
  - Admin times
---

# Administração do evento dos times

Menu **Evento dos times** → `/dale/times`. Página `src/pages/admin/Clubs.tsx`; sessão do painel, `RequireAdmin`. Shell igual [[ongs]]: `SidebarProvider`, `AppSidebar`, cabeçalho, cards, `MobileNav`. Entrada única em `src/lib/nav.ts` (celular: drawer "Menu"). Evento em si: [[evento-times]]. Back: `admin/club-event` (`cidoa-back/doc/modulos/club/club.md#Painel (admin)`).

## Card Evento

- Switch **Ligado/Desligado** → `PUT /admin/club-event`. Desligado: link `?time=` não abre (modal fecha sem aparecer e limpa a URL), ninguém escolhe/troca (`403` no back), **Trocar time** some do telão. Quem já tem time mantém as imagens.
- Números: **Participantes** (com time), **Trocas usadas**, **Na lista** (ativo **e** com imagem = o que o público vê). Celular: uma linha por número.
- **Copiar link da lista**: `https://cidoe.com.br/?time=` (sem time → lista).

## Card Times

- Todos os times (inativos e sem imagem inclusive), ordem alfabética pt-BR. Busca instantânea por nome ou slug (sem acento).
- Linha: miniatura da 1ª imagem, nome, `slug · N torcedores · N imagens`, badges **Ativo/Inativo** + **Sem imagem** (fora do público). Switch ativa/desativa na hora. Ícones: copiar link (`?time=<slug>`, `SITE_URL`), editar, excluir.
- **Excluir**: confirmação com nome e torcedores ("N torcedores ficam sem time"). Back limpa telões na transação; torcedor volta a escolher com troca zerada. Recarrega números.
- Desativar × excluir: desativar só tira da lista/link (quem torce mantém, imagens seguem públicas no telão). Tirar imagem do ar = remover imagem ou excluir time.

## Editor de time (dialog)

- **Adicionar time**: nome + link (`?time=` + slug, sugerido do nome sem acento até editar; formato `^[a-z0-9]+(-[a-z0-9]+)*$`; **não muda depois**) + ativo. Salvar cria e o dialog vira edição (imagens só com time criado).
- **Editar**: nome e ativo (Salvar fecha). Link na descrição + **Copiar link**.
- **Imagens** (`N/12`): grade 3 colunas, 1ª com selo **Capa** (miniatura da lista do modal). Cada ação grava na hora:
  - **Adicionar imagem**: aceita várias, enviadas uma por vez na ordem; para no primeiro erro. Desabilita em 12.
  - **Trocar**: mesmo número → telões que usam a imagem mostram a nova (cena em ≤5 min, cache da API; painel/modais na hora pelo `?v=`).
  - **Remover**: lixeira → confirmação inline (**Remover**/**Cancelar**). Sai de todos os telões. Números não renumeram: capa passa para a primeira que sobrou.
- Arquivo: JPG, PNG ou WebP até 10 MB, até 5000 px. `encodeClubImage` (`src/lib/image.ts`): recorte central quadrado (telão estica em 64×64 LEDs) → 256 px + miniatura 96 px, WebP pelo canvas (navegador sem encoder WebP manda PNG). Sem dependência de imagem no back; back confere assinatura × tipo e teto (300 KB / 60 KB).
- Busy: fieldset desabilitado, sem fechar durante gravação.

## API

`src/api/admin/admin.routes.ts`: `getClubEvent`, `setClubEventActive`, `createClub`, `updateClub`, `deleteClub`, `addClubImage`, `replaceClubImage`, `deleteClubImage` → `/admin/club-event`. Tipos `AdminClub`, `AdminClubImage`, `ClubEventOverview`, `CreateClubInput`, `ClubImageInput` em `admin.types.ts`. Mutação devolve o time atualizado → lista atualiza sem recarregar.

Cópia: `copyText` (`src/lib/clipboard.ts`, também no `SharePanel`): Clipboard API, fallback textarea (HTTP em IP da rede local).

> [!important] Migrations antes do backend
> `0033_club_catalog.sql` + `0034_club_images.sql` no `cidoa-back` antes de subir backend e front. Front novo não tem mais `public/clubes`: imagens vêm da API.

## Verificação

`node scripts/check-admin-clubs-ui.mjs` (dev server + Chrome; API do painel simulada com as regras do back; `MOBILE=1`, `SHOTS=pasta`): números, menu, liga/desliga, busca, copiar link (área de transferência real), ativar/desativar, criar com slug sugerido e slug inválido, várias imagens (PNG 600×300 sai 256×256 + 96×96 WebP), trocar, remover com confirmação, arquivo falso barrado no navegador, renomear, excluir com aviso de torcedores, sem rolagem lateral, console limpo. `node scripts/check-club-event.mjs` confere slug, key do telão e teto de imagens iguais ao back.
