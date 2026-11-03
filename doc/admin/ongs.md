---
title: Administração de ONGs
tags:
  - admin
  - ongs
---

# Administração de ONGs

Menu **ONGs** → `/dale/ongs`. Página dedicada `src/pages/admin/Ongs.tsx`; sessão do painel, protegida por `RequireAdmin`. Shell igual [[usuarios]]: `SidebarProvider`, `AppSidebar`, cabeçalho, card central, `MobileNav`. Entrada única em `src/lib/nav.ts` atende desktop e mobile.

## Operações

- Lista todas, inclusive inativas. Busca por nome, 20 por página, loading, vazio, erro e retry.
- **Adicionar ONG** / **Editar**: nome obrigatório (até 255), imagem opcional, status. Dialog preserva foto/status existentes; erro mantém formulário aberto.
- Imagem: JPG, PNG ou WebP até 10 MB; `resizeImage` valida e reduz para até 400 px, envia JPEG base64. Preview com `Avatar` do DS; **Remover imagem** envia `null`. Backend valida bytes e reencoda antes de salvar.
- Switch por linha ativa/desativa. Inativa continua editável no admin, sai do catálogo público após atualização do snapshot.
- **Excluir** exige confirmação com nome. Sem doações vinculadas: exclusão definitiva. Com doações: backend responde 409, orienta desativar e preserva histórico.

## API e catálogo público

`src/api/admin/admin.routes.ts`: `listOngs`, `createOng`, `updateOng`, `deleteOng` → `/admin/ongs`. Tipos `AdminOng`, `OngInput`, `OngPage` em `admin.types.ts`; imagem em `profile_image`, status em `is_active`.

Snapshot v5: `ongs: [id, nome, imagemOuNull][]`. Parser aceita terceiro campo ausente para compatibilidade com backend antigo. Cartões de [[html-components#DonationInfoSection.tsx]] exibem foto cadastrada; ausência/erro → iniciais. Catálogo só inclui ativas. Mudanças chegam ao cache do backend em até 30 s; página pública já aberta precisa recarregar os dados.

> [!important] Migration antes do backend
> Aplicar `0022_ong_profile_image.sql` no `cidoe-back` antes de subir o backend atualizado. Adiciona `ong.profile_image`, sem alterar ONGs existentes. Esta alteração não aplica migration nem modifica registros no banco.

## Verificação

`npm run build`, `npm run lint`, `node scripts/check-admin-ongs.mjs`, `node scripts/check-donation-info.mjs`. Formulário real com API/hooks simulados: criação, edição, preservação/remoção de foto, status, falha de gravação e upload pendente. Sem servidor/navegador.
