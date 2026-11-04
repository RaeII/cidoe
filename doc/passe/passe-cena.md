---
title: Passe · Cena 3D
tags: [passe, cena]
aliases: [passe-cena]
---

# Passe · Cena 3D

`useCustomizationCatalog` carrega catálogo público 1× e conquistas `/customization/me` por sessão. `isUnlocked` resolvido por `canUseCustomization` em `src/lib/unlock.ts`.

| Situação | Acesso |
| --- | --- |
| Item grátis | Disponível, inclusive sem login |
| Grant no ledger | Disponível, mesmo se requisitos atuais aumentaram |
| Progresso satisfaz requisitos | Disponível |
| Sem sessão, carregando ou falha de `/me` | Item com requisito continua bloqueado |
| Conta admin logada na cena | Catálogo disponível para prévia (sessão do painel não conta) |

Presentes dos [[primeiros-inscritos]] entram no mesmo ledger do passe. Podem incluir itens grátis, portanto ausência/presença no ledger não substitui verificar `unlock === null`.

`BuildingManageDialog` usa `BuildingCustomizer` na aba Aparência: opções bloqueadas visíveis, cadeado, botão desabilitado e requisito no cartão. Letreiro/holograma exibem requisito e desabilitam seus campos. Feature consulta `unlockedCategoryKeys`, opção consulta `unlockedOptionIds`.

Troca de usuário cancela request anterior; benefícios só usados se ID coincide com sessão atual. Catálogo não mistura dados de sessões. Mudanças feitas no admin após carregamento são refletidas ao reabrir/recarregar a cena.

> [!warning] Persistência do visual
> Escolhas ainda vivem na cena local. Backend concede direitos permanentemente, mas `user_building_customization` continua sem endpoint de escrita. Quando existir, precisa validar posse e liberação no backend.

Verificação: `node scripts/check-customization-access.mjs`. Ver [[customization-api]], [[passe-formatacao]] e [[html-components]].
