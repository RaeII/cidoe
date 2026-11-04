---
title: Sistema de Design
tags:
  - cidoe
  - design-system
  - ui
aliases:
  - Design System
  - DS
---

# Sistema de Design

Regra visual de toda interface HTML do Cidoe (cena pública + `/dale`). Fonte: `Cidoe Design System.html` nesta pasta (v1.0, out 2026). Seções do arquivo: 01 Princípios · 02 Cor · 03 Tipografia · 04 Assinatura de jogo · 05 Imagem · 06 Componentes · 07 Interface sobre a cidade · 08 Redes sociais. Número entre parênteses nesta página (ex.: 6.6) = subseção do arquivo. Cena 3D fora do escopo: canvas pinta próprio céu/chão.

> [!abstract] Ideia em uma linha
> Clareza de app financeiro (confiança) + detalhe pequeno e preciso de videogame 8 bits. Dinheiro sério, jogo = recompensa. Cidade 3D protagonista; interface só emoldura.

> [!important] Onde mora
> Tokens + utilitários: `src/index.css`. Primitivos: `src/components/ui/`. Ícones em pixel, gato/cachorro, carregando: `src/components/ui/pixel-icon.tsx`. Foto na moldura: `src/components/ui/photo.tsx`. Avatar: `src/components/ui/avatar.tsx`. Barra em blocos: `src/components/ui/block-bar.tsx`. Cursor de pata + padrão de pegadas: `src/assets/ui/`. Fontes: `index.html`.

## Princípios

| | Regra | Na prática |
|---|---|---|
| A · Confiança primeiro | Dinheiro sério. Jogo = recompensa. | Valor, ONG, recibo em texto limpo, número grande. Pixel só em borda e ícone — nunca na letra. |
| B · Plano, sem truque | Cor chapada, sombra sólida, zero degradê. | Profundidade = bisel de cor sólida na base (degrau de fliperama). Nunca desfoque. |
| C · Pequeno detalhe de jogo | Canto em pixel, cursor ▸, barra em blocos. | Tempero, não prato. Borda, ícone, progresso. |

## Cor

Três cores, cada uma com trabalho. Tom claro/escuro só para bisel, fundo de seleção e texto.

| Papel | Nome | Hex | Token Tailwind | Uso | Peso |
|---|---|---|---|---|---|
| Principal | Verde Praça | `#4E6B45` | `verde` / `primary` | Marca, botão primário, ONG verificada, bloco de progresso | 70% |
| Base | Papel | `#F2EEE3` | `papel` / `background` | Fundo, placa sobre cena, superfície | 25% |
| Auxiliar | Âmbar Moeda | `#E3A33B` | `ambar` / `ring` | XP, conquista, foco, alerta. Só quando algo é conquistado | 5% |

Tons de apoio:

| Token | Hex | Uso |
|---|---|---|
| `tinta` | `#1E2A1B` | Texto e contorno (verde a 15% de luz) |
| `tinta-2` | `#4A5446` | Texto secundário (`muted-foreground`) |
| `verde-700` | `#3A5134` | Bisel verde, estado pressionado, texto ghost |
| `verde-hover` | `#5A7B50` | Hover do botão primário |
| `verde-100` | `#DCE4D5` | Seleção, hover, prefixo de campo (`accent`, `secondary`) |
| `papel-claro` | `#FBF9F3` | Card, popover, campo (`card`) |
| `papel-300` | `#D9D3C2` | Bisel claro (`edge`), bloco vazio (`muted`), hairline (`border`) |
| `ambar-700` | `#B47D22` | Bisel da moeda, borda de erro |
| `ambar-800` | `#7D5414` | Texto de erro (`destructive`) — 5,7:1 sobre papel |
| `ambar-100` | `#F6E3BF` | Fundo de campo com erro, botão destrutivo |
| `ambar-hover` | `#EBB257` | Hover do botão âmbar |

> [!warning] Sem vermelho
> Erro = borda âmbar escura + `<ErrorMark />` ("!" âmbar sobre tinta) + frase clara em `text-destructive`. Atenção sem alarme, coerente com causa de cuidado. `destructive` aponta para âmbar, não vermelho.

**Proibido:** `white`, `black`, hex solto, paleta padrão do Tailwind (`emerald-*`, `red-*`, `sky-*`…), opacidade sobre branco/preto (`bg-white/10`, `bg-black/60`). Use token.

**Escuro** (só `/dale`, `.dark` no `<html>`): mesmas três cores, chão vira `tinta`, card `#2B3828`, contorno `#0B110A`. Cena pública sempre clara.

Contraste medido: tinta/papel 12,9 · papel/verde 5,2 · tinta-2/papel 6,8 · tinta/âmbar 6,8 · verde-700/verde-100 6,7. Exceção conhecida: papel sobre `verde-hover` 4,1 (só no hover).

## Tipografia

Sans firme e aberta para tudo que precisa ser lido e acreditado; mono para placar, rótulo, contador. **Nenhuma fonte pixel** — pixel fica na forma, não na letra.

| Fonte | Token | Papel |
|---|---|---|
| Manrope 400–800 | `font-sans` (padrão do body) | Leitura, valor, botão, título |
| JetBrains Mono 400–600 | `font-mono` / `mono-label` | Rótulo de campo, kicker, contador, selo, dica, HUD |

Fontes **self-hosted**: woff2 variável do Google Fonts em `public/fonts/` (Manrope 200–800, JetBrains Mono 100–800; subset `latin` + `latin-ext` por `unicode-range`), `@font-face` com `font-display: swap` no topo de `src/index.css`. `index.html` faz preload só de `manrope-latin.woff2`. Nada de `fonts.googleapis.com` (CSS externo bloqueava o 1º paint). Peso novo dentro da faixa variável não baixa arquivo extra.

| Nível | Spec | Exemplo |
|---|---|---|
| Display de página | `clamp(44px,7vw,96px)` · 600 · `leading-[0.98]` · `tracking-[-0.025em]` · `max-w-[14ch]` · `text-balance` | Título da home |
| Abertura | 22px · 400 · `leading-normal` · `max-w-[46ch]` · `muted-foreground` | Texto sob o display |
| Título de seção | 44px · 600 · `leading-[1.05]` | "Doações na cidade" |
| Intro de seção | 19px · `leading-[1.55]` · `max-w-[60ch]` · `muted-foreground` | Parágrafo sob título de seção |
| Display | 48px · 600 · `tracking-[-0.02em]` | `R$ 12.480` |
| Título | 26–30px · 600 · `leading-[1.15]` | Nome da ONG, título de modal (`DialogTitle` = 26px) |
| Citação | 20px · 500 · `leading-[1.45]` | Depoimento |
| Texto | 15–18px · 400 · `leading-relaxed` | Corpo |
| Botão | 14px · 700 · `tracking-[0.04em]` | Ação |
| Kicker | mono 13px · `tracking-[0.06em]` · verde | "O projeto" |
| Rótulo | `mono-label` (12px mono, `tracking-[0.04em]`) | "Valor da contribuição" |
| Selo/meta | mono 11px | "ONG verificada", "312 edifícios" |
| HUD | mono 28px (placar) · mono 16px (contador) | "Nível 07", "#12.847 · +50 XP" |

Regras:
- Mono: mínimo 12px na tela (selo 11px tolerado; nunca 10px). 28px em vídeo 1080p. Só texto curto — nunca parágrafo, valor de doação ou termo legal.
- Número: `tabular-nums` global (body). Valor em Manrope, nunca mono.
- Título: `font-semibold`, tracking levemente negativo.

## Assinatura de jogo

Cinco detalhes formam a identidade. Com moderação — juntos, fazem a tela parecer Cidoe.

### 1 · Canto em pixel — `pixel`

Borda de 3px que pula o canto, como sprite. **Substitui `border` + `rounded` em tudo.** Raio do tema zerado (`rounded-*` = 0); `rounded-full` só para coisa realmente redonda (raro).

```html
<div class="pixel bg-card">…</div>          <!-- 3px tinta -->
<div class="pixel pixel-thin bg-card">…</div> <!-- 2px: campo, selo, controle pequeno -->
<div class="pixel pixel-ink-verde">…</div>   <!-- cor da borda -->
```

> [!caution] Borda fica fora da caixa
> Desenhada com `box-shadow`: não mexe no layout, mas `overflow-hidden/auto` do pai corta. Dentro de área com scroll, dê respiro (`p-1`/`p-2`). Nunca junte `pixel` com `shadow-*` ou `ring-*` (brigam pelo `box-shadow`).

### 2 · Bisel sólido — `bevel-*`

Faixa de 4px no tom escuro na base dá volume. Soma com `pixel`.

| Superfície | Classes |
|---|---|
| Placa/card de papel | `pixel bevel-edge bg-card` |
| Bloco verde | `pixel bevel-verde-700 bg-primary text-primary-foreground` |
| Bloco âmbar | `pixel bevel-ambar-700 bg-ambar text-tinta` |
| Modal | `pixel bevel-edge bevel-w-6 bg-background` |

Altura: `bevel-w-3` (pequeno), padrão 4, `bevel-w-6` (modal). Compense o bisel no padding de baixo (`pb-1` a mais) para o conteúdo ficar centrado na área visível.

Botão soma **sombra dura** na diagonal (`raised`, luz do canto superior esquerdo) e **afunda ao pressionar** (`press`: anda 4px, sombra zera, bisel não muda). Só botão usa `raised`/`press`.

### 3 · Cursor de menu ▸ — `menu-cursor`

Seta ▸ marca opção ativa/destacada em lista, menu, select. `menu-cursor` + `pl-6` no item; aparece em `:hover`, `data-highlighted`, `data-state=checked`, `aria-current=page`, `aria-selected`. Ícone avulso: `PixelArrow`.

Aba: utilitário `tab` (bold, ativa = régua verde de 4px embaixo, foco por dentro). Reconhece `data-state=active` (Radix) e `data-active=true` (aba feita à mão). Tamanho da fonte no chamador (`text-[13px]`). Some `menu-cursor pl-6` para ▸.

### 4 · Barra em blocos — `<BlockBar>`

Todo progresso contado em blocos. Cheio = verde, **próximo bloco a conquistar acende em âmbar**, vazio = `muted`.

```tsx
<BlockBar value={6} max={10} label="Nível 7" />            // moldura + blocos 18px
<BlockBar value={8} max={12} blocks={12} size="sm" label="Meta da ONG" /> // HUD, sem moldura
```

> [!note] Meta de ONG
> No DS a barra de meta (cartão 6.6: 12 blocos, gap 3px, 10px de altura) **não** acende bloco âmbar — dinheiro arrecadado não é conquista do usuário. Hoje `BlockBar` sempre acende o próximo; ao implementar meta, adicionar opção para desligar.

Carregando sem progresso conhecido: `<BlockLoader />` (três blocos acendem em sequência). **Nada de spinner girando** (`animate-spin`).

### 5 · Ícones em pixel

Grade 8×8, uma ou duas cores da marca. `pixel-icon.tsx`: `PixelClose`, `PixelCheck`, `PixelChevronDown`, `PixelArrow`, `PixelHeart`, `PixelPaw`, `PixelBuilding`, `PixelCoin` (sempre âmbar), `CidoeLogo` (exceção: logo oficial em `<img>`, verde-oliva no claro / branca no `.dark`), `ErrorMark` ("!" de erro), `PixelPhoto` (foto indisponível). Gato/cachorro (`PixelCat`, `PixelDog`) usam pelagem real — mascote espiando por cima de modal/card, só onde o pai não tem `overflow` (senão corta).

Lucide segue onde não há ícone pixel; terminação reta via CSS global (`.lucide`).

### Extras globais (automáticos)

- **Cursor de pata** em tudo clicável (`src/assets/ui/paw-cursor.svg`, 31×28, ponto ativo `16 2`, igual ao DS).
- **Foco de teclado** = contorno âmbar 3px, offset 4px. Fora de `@layer`: vence `outline-none`. Campo `field` mostra foco pela moldura verde. Item dentro de `overflow` (lista/aba rolável): `focus-inset` desenha o contorno por dentro.
- **Seleção de texto** em âmbar.
- **Padrão de pegadas** no papel: `bg-background pattern-paws` em toda superfície de página fora da cena — `/dale` e home `donation-info`. Pegada `#E7E2D3` sobre papel, ladrilho 420px (`src/assets/ui/paw-pattern.svg`, idêntico ao DS). Escuro: sem padrão. Placa/card por cima continua opaca (`bg-card`/`bg-background`).
- **Link em texto**: `Button variant="link"` = `verde-700`, sublinhado 2px, offset 3px; hover verde sobre `verde-100`.
- `checkbox`, `radio`, `range`, `color`, `select` nativos já saem no estilo do DS (quadrado, borda pixel, verde marcado).

## Imagem

Seção 05 do DS. Três tipos, cada um com papel. Moldura sempre a mesma: canto em pixel das placas.

| Tipo | Papel | Regra | Proporção |
|---|---|---|---|
| A · Foto real | Prova que ONG existe | Animais e gente da ONG, cor natural. Sem filtro, sem pixel, sem montagem | 3:2 · 4:5 · 1:1, moldura 3px |
| B · Cena da cidade | Mostra recompensa | Captura da cena 3D. Sangra até a borda no HUD e no vídeo; moldura só dentro de página | 16:9 · 9:16 |
| C · Sprite em pixel | Tempero, nunca protagonista | Bicho/objeto em grade 8×8 ou 16×16. Escala só inteira (×2 ×3 ×4 ×6 ×8, nunca ×1,5), sem suavização: SVG `shapeRendering="crispEdges"`, raster `image-rendering: pixelated` | — |

Mascotes do app já em escala inteira: `PixelCat` ×3, `PixelDog` ×4, `PixelCoin` ×2, `PixelPhoto` ×4. Ícone de interface (seção 04) segue tamanho do DS.

### Proporções (5.2)

Só cinco — `Photo ratio=`:

| `ratio` | Exporta | Uso |
|---|---|---|
| `16/9` | 1920×1080 | Cena da cidade, HUD, vídeo |
| `3/2` | 1200×800 | Cartão de ONG, página da causa, imagem do edifício |
| `4/5` | 1080×1350 | Retrato de animal, feed |
| `1/1` | 1080×1080 | Avatar, logo de ONG, carrossel, foto da home |
| `9/16` | 1080×1920 | Stories, Reels |

Ponto focal: olhar do animal no terço superior, nunca coberto por placa ou selo.

### Moldura (5.3)

```tsx
<Photo ratio="3/2" src="/foto.jpg" webp="/foto.webp" alt="Cadela caramelo recebendo vacina" />
<Photo ratio="1/1" src={url} alt="…" className="pixel-thin" /> // menos de 120px de largura
```

1. **Borda** — `pixel` 3px tinta, canto vazado. Abaixo de 120px de largura: `pixel-thin` (2px).
2. **Canto** — sempre reto. Nada de `rounded-*` nem círculo — nem em avatar.
3. **Selo** — no máximo um, `absolute left-3 top-3` (12px do canto superior esquerdo). Nunca sobre rosto do animal.
4. **Legenda** — mono 11–12px, 10px abaixo da moldura (`mt-2.5`), crédito + ano: "Foto · Abrigo Quatro Patas, Curitiba · 2026".
5. **Sombra** — nenhuma, nem `bevel`. Sombra dura só em imagem clicável.
6. **Espera** — fundo `muted` (papel 300) enquanto carrega.

`Photo` verifica `complete`/`naturalWidth` no ref de montagem: imagem já carregada antes da hidratação sai da espera sem depender de um novo evento `load`. Trocar `src` reinicia a espera; falha mantém o estado de erro da moldura.

`Photo` = moldura + `object-cover` + estados de [[#Estados (5.7)]]. `webp` opcional vira `<picture>` com `src` (JPG) de reserva. Trocar `src` volta a "carregando". Resto das props vai para o `<img>` (`width`, `height`, `loading`).

### Tratamento (5.4)

- **Natural** (padrão) — toda foto real entra assim. Só exposição, branco e recorte.
- **Duotone Praça** — só quando foto vira fundo (atrás de placa, Stories verde): verde 700 nas sombras, papel nas luzes. Receita do DS: container `bg-verde-700 isolate`, foto `grayscale contrast-110 mix-blend-screen`, camada `bg-papel mix-blend-multiply` por cima. Não usado no app — criar utilitário no primeiro uso.
- **Pode** — exposição e contraste leves; balanço de branco para pelagem real; recorte nas cinco proporções.
- **Não pode** — saturação extra, filtro de app; pixelizar, dithering, efeito 8-bit em foto real; vinheta, desfoque, véu, degradê; preto e branco puro (use Duotone).

### Texto sobre imagem (5.5)

Texto sempre numa **placa de papel sólido** presa a um canto, 16–20px da borda: `absolute left-[18px] bottom-5 max-w-[62%] pixel bevel-edge bg-background px-4 pt-3 pb-4`, kicker mono 11px verde + título 17px 600. Lê sobre qualquer imagem.

Nunca texto direto na foto com véu escuro, degradê ou `text-shadow` — some em cena clara e quebra a cor chapada.

### Avatares e logos (5.6)

| Tamanho | `<Avatar size>` | Uso no app |
|---|---|---|
| 72 | `lg` | Perfil (`ProfilePanel`) |
| 48 | `default` | Listas, cartão de pessoa (`ReferralPerson`), cabeçalho do `GameMenu` |
| 32 | `sm` | HUD, barra lateral do `/dale` (`AppSidebar`, `MobileNav`) |
| 26 | `sm` + `data-[size=sm]:size-6.5` | Botão do usuário (`AuthMenu`): cabe nos 36px do botão `h-10` com 3px de respiro; botão `pl-1.25 pr-3`, avatar colado à esquerda. Mudar tamanho exige o prefixo `data-[size=…]:` — `size-*` solto perde para a regra do `Avatar` |
| 96 | — | Logo de ONG: `pixel-thin bg-card p-2` + `object-contain` |

Quadrado, moldura 2px (`pixel-thin`), espera `muted`. Sem foto: iniciais em mono sobre `verde-100` (`AvatarFallback`: 11/14/20px por tamanho) ou bichinho do doador. Não sobrescreva tamanho nem cor do fallback no chamador.

Logo de ONG (e imagem de holograma no [[html-components#BuildingCustomizer.tsx|personalizador]]): inteiro, 8px de respiro (`p-2`), `object-contain`, nunca recortado.

### Estados (5.7)

| Estado | Visual |
|---|---|
| Carregando | `muted` + barra de 10 blocos enchendo (`animate-fill`, 320ms por bloco, recomeça). Sem spinner nem brilho deslizante. Movimento reduzido: barra parada vazia |
| Indisponível | `bg-card` + `PixelPhoto` 32px + mono 11px "Foto indisponível". Moldura fica, layout não pula |
| Clicável | `raised press hover:pixel-ink-verde`: sombra dura dos botões, borda verde no hover, anda 4px ao pressionar |

`Photo` cobre carregando e indisponível sozinho. Clicável = classes no `<button>` que envolve a imagem (ex.: seletor de imagem em [[html-components#BuildingProfileForm.tsx]]).

### Direção de foto (5.8)

| Faça | Evite |
|---|---|
| Animal em primeiro plano, câmera na altura dos olhos dele | Sofrimento, ferimento, grade em destaque — culpa afasta, confiança aproxima |
| Luz natural, de dia, cor real da pelagem | Banco de imagem genérico — se não é da ONG, não entra |
| Gente da ONG cuidando: banho, vacina, colo, passeio | Texto, logo ou marca d'água gravados na foto |
| Um assunto por foto, respiro em volta para recorte | Esticar, espelhar, cortar animal pela metade |

| Formato | Resolução | Peso | Texto alternativo |
|---|---|---|---|
| WebP com JPG de reserva (`webp` do `Photo`). PNG só para sprite | 2× tamanho exibido; mínimo 1200px no lado maior | Até 300 KB na interface; 1 MB nas redes | Obrigatório. Animal + ação: "Cadela caramelo recebendo vacina". `alt=""` só quando o nome já está ao lado (avatar) |

## Componentes

| Componente | Spec | Arquivo |
|---|---|---|
| Botão | Ver tabela abaixo | `ui/button.tsx` |
| Campo | `field`: papel claro, borda 2px. Foco: borda verde 3px + fundo branco + bisel verde-100. Erro (`aria-invalid`): borda `ambar-700` + fundo `ambar-100` + linha "!" | `ui/input.tsx`, `field` no CSS |
| Rótulo | `mono-label` **acima** do campo, gap 8px. Sem label flutuante | `Input label=` |
| Prefixo | Grupo `field` com `R$` em `bg-secondary text-secondary-foreground font-mono` à esquerda; input interno sem moldura | — |
| Checkbox | 22px quadrado, borda 2px, marcado = verde + check papel | nativo |
| Radio / opção | 20px quadrado; marcado = quadrado verde 10px no centro. Opção em card: `px-3.5 py-3`, rótulo 17px 600 + meta 14px `muted-foreground` à direita; selecionada = `bg-secondary` + `pixel pixel-thin pixel-ink-verde` | nativo |
| Switch | Trilho 52×26, respiro 4px, bloco 18px. Desligado = trilho `muted` + bloco tinta; ligado = trilho verde + bloco papel. Estado em mono 11px à direita (opcional) | `ui/switch.tsx` |
| Valor rápido | Botões lado a lado (`flex-1 min-w-16`, gap 6px) `pixel pixel-thin bevel-edge`, 13px bold, `pt-3 pb-[15px]`, sem sombra dura; ativo = verde com `bevel-verde-700` | — |
| Quantidade | Grupo `pixel pixel-thin`: botões −/+ 48px `bg-secondary` + número 24px 600 em `bg-card` (72px). **Não implementado** — hover do DS (`#C9D5C0`) não tem token; criar antes de usar | — |
| Abas | `tab text-[13px]` (+ `menu-cursor pl-6` para ▸); lista sem fundo, `border-b` | `tab` no CSS |
| Linha de erro | `<p role="alert" class="flex gap-2 text-sm text-destructive"><ErrorMark />frase</p>` | `ui/pixel-icon.tsx` |
| Selo | `Badge`: mono 11px, borda 2px. `default` verde, `secondary` papel, `reward` âmbar, `muted` verde-100 sem borda | `ui/badge.tsx` |
| Dica | Tooltip tinta, mono 12px papel, rabicho em degrau | `ui/tooltip.tsx` |
| Feedback | Toast = placa `pixel bevel-edge bg-card` `p-4 pb-[18px]` + quadrado sólido 44px com ícone + texto 16px. Sucesso verde, erro "!" âmbar sobre tinta | `ui/toast.tsx` |
| Conquista | Placa `pixel bevel-ambar-700 bg-ambar` `p-4 pb-[18px]` + `PixelCoin` + kicker mono 12px + texto 18px 600 | — |
| Nível/XP | Linha mono 12px ("Nível 7" + `muted-foreground` "600/1000 XP" à direita) sobre `<BlockBar>` | `ui/block-bar.tsx` |
| Card | `pixel bevel-edge bg-card`, padding com +4px embaixo | `ui/card.tsx` |
| Foto | `<Photo ratio>`: moldura 3px, `object-cover`, espera e falha do DS. Ver [[#Imagem]] | `ui/photo.tsx` |
| Avatar | Quadrado, `pixel-thin`, `sm` 32 · `default` 48 · `lg` 72; iniciais mono sobre verde-100. Ver [[#Avatares e logos (5.6)]] | `ui/avatar.tsx` |
| Modal | `pixel bevel-edge bevel-w-6 bg-background`, overlay `bg-tinta/72`, título 26px. Base com `max-h-[calc(var(--viewport-height,100dvh)-2rem)] overflow-y-auto`: altura/centro seguem área visível acima do teclado. Ver [[html-components#Teclado no mobile]]. Fluxo com etapas: `DialogKicker` (barra verde + rótulo mono + fechar). Detalhe em [[#Modal de contribuição (6.7)]] | `ui/dialog.tsx` |
| Menu/Select | Popover `pixel bg-popover`, item com `menu-cursor` | `ui/select.tsx`, `ui/dropdown-menu.tsx` |

### Botão

| Variante | Visual | Quando |
|---|---|---|
| `default` | Verde, texto papel, bisel verde-700, sombra dura | Ação principal. Uma por tela |
| `outline` / `secondary` | Papel claro, bisel papel-300, hover verde-100 | Ação secundária, cancelar |
| `reward` | Âmbar, texto tinta, bisel âmbar-700 | Resgatar/conquistar. Só moeda |
| `destructive` | Âmbar claro, bisel âmbar-700 | Excluir, sair de algo irreversível |
| `ghost` | Sem moldura, texto verde-700, hover verde-100 | Ação terciária, ícone em barra |
| `link` | Verde sublinhado 2px, hover verde-100 | Link em texto |

Tamanhos: `xs` 28, `sm` 32, `default` 40, `lg` 48 (px de altura; DS ≈ 51 — ver [[#Desvios conscientes]]). Estados: hover clareia, pressionado anda 4px, foco âmbar, desabilitado 45%.

## Interface sobre a cidade

HUD ocupa só os cantos. **Placa de papel sólido** garante leitura sobre qualquer trecho da cena — nada de vidro escuro, `backdrop-blur` ou transparência.

| Peça | Spec |
|---|---|
| Placa de HUD | `pixel bevel-edge bg-background` (ou `bg-card`), `px-4 py-2.5 pb-3` |
| Nível/XP | `CidoeLogo` + `mono-label` + `BlockBar size="sm"` |
| Contador | Placa + ícone pixel + número em mono 14px |
| Info de edifício | Placa: kicker mono verde ("Edifício #12.847"), título 20px 600, meta `text-muted-foreground` |
| CTA principal | Botão `default` `size="lg"` com ícone pixel, canto inferior |
| Dica sobre cena | Tooltip tinta |

Overlay só com `pointer-events-auto` na placa; o resto `pointer-events-none` para não roubar arrasto da câmera.

## Composição de página

Página fora da cena (home `donation-info`, telas cheias do `/dale`) segue a página do DS. Referência no app: [[html-components#DonationInfoSection.tsx]].

| Peça | Spec |
|---|---|
| Fundo | `bg-background pattern-paws` |
| Container | `max-w-[1240px]`, lateral 40px (`sm:px-10`; 24px no mobile), `pt-24 pb-[120px]` |
| Hero | kicker mono 13px → display de página → abertura 22px; gap 32px (`mt-8`) |
| Cabeçalho de seção | `PixelPaw` + número mono 13px verde (gap 8px) + título 44px; gap 18px; alinhado na base |
| Conteúdo da seção | 36px (`mt-9`) abaixo do cabeçalho. Com intro: intro 19px a 16px, conteúdo 40–48px abaixo |
| Ritmo | 112px entre seções (88px após o hero). Sem hairline: só espaço |
| Grade | colunas de texto `gap-x-14 gap-y-12`; cards 20–24px |
| Rodapé | `mt-[120px]`, frase 28px 600 `max-w-[24ch]` `leading-[1.2]` à esquerda + mono 12px `muted-foreground` à direita, base alinhada |

## Cartão de ONG (6.6)

`relative pixel bevel-edge bg-card`. `PixelDog` espia em `absolute -top-[47px] right-8` (pai sem `overflow`).

1. Foto 180px de altura no topo, `object-cover`, sem moldura própria (a do cartão basta).
2. Corpo `px-5 pt-5 pb-6`, gap 14px (`gap-3.5`).
3. Linha: selo `ONG verificada` + local mono 11px `muted-foreground`.
4. Nome 26px 600 `leading-[1.15]`; descrição 16px `muted-foreground`.
5. Meta: barra 12 blocos (gap 3px, 10px, sem âmbar) + linha 15px "**R$ 8.420** de R$ 12.000" e mono 11px "312 edifícios" à direita.
6. Botão `default` largura total.

No app (home): sem foto, descrição, selo e meta — `Ong` da API só tem `id` + `nome`. Mostra cidades, nome, edifícios e **Ver na cidade**.

## Modal de contribuição (6.7)

| Peça | Spec |
|---|---|
| Placa | `bg-background` + bisel 6px; `PixelCat` espia em `absolute -top-[45px] right-[60px]` |
| Topo | `DialogKicker`: "Contribuição · Passo 1 de 2" |
| Corpo | `px-6 pt-6 pb-[30px]`, gap 20px |
| Título | 28px 600 + linha 16px `muted-foreground` com ONG em `strong` tinta |
| Prévia do edifício | `bg-secondary px-4 py-3.5`: ícone + kicker mono 11px `verde-700` + nome 17px 600 + selo âmbar mono 12px "+N XP" à direita |
| Ações | à direita, gap 16px: `outline` cancelar + `default` com valor |
| Confiança | mono 11px `muted-foreground`: "Pagamento seguro · CNPJ verificado · Recibo por e-mail" (DS usa 10px; app mínimo 11px) |
| Sucesso | ícone, título 32px 600 `leading-[1.1]`, texto 17px `muted-foreground`, `BlockBar` 14px sem moldura, botão **Ver na cidade** |

Fluxo real: [[html-components#ContributeDialog.tsx]].

## Desvios conscientes

App diverge do arquivo do DS só aqui. Mudar qualquer linha = decisão explícita; registrar nesta tabela.

| Item | DS | App | Motivo |
|---|---|---|---|
| Altura do botão | padding 14/22/18 ≈ 51px; CTA ≈ 62px | `default` 40, `lg` 48 | densidade de painel/HUD |
| Resumo de Meus edifícios | contorno pixel + bisel, cantos retos | cantos de 14 px e contorno fino, sem bisel | pedido explícito: card menos quadrado, compacto e afastado da borda no mobile; exceção restrita ao resumo de `MyBuildingsNavigation` |
| Campo | 18px, ≈ 50px, rótulo a 10px | `h-11` (44px), 16px (14px ≥ `md`), rótulo a 8px | densidade de formulário |
| Gato no modal de contribuição | `PixelCat` espiando | ausente | `DialogContent` tem `overflow-hidden` e altura máxima; precisa de 45px livres acima |
| Cartão de ONG | foto, descrição, selo, meta | nome, cidades, edifícios | API sem esses dados |
| Título da home | até 96px | até 72px | divide linha com foto; "contribuição" não cabe |
| Escuro com pegadas | pegada `#36452F` sobre `#2E3A2B` (fundo do 6.7) | sem padrão | escuro só no `/dale` |
| Skeleton | — | `animate-pulse` em `bg-muted` (`/dale`) | placeholder de layout; não é spinner |
| Foto da home | foto da ONG, mín. 1200px, legenda com crédito e ano | `cat_dog.jpeg`/`.webp` de banco de imagem, 1024px, sem legenda | ainda sem foto de ONG; crédito desconhecido — não inventar. Trocar quando houver |
| Aviso de pré-lançamento na cena | placa de papel sólido, sem `white`/blur | texto `papel` sem placa nem desfoque, rodapé | pedido explícito: aviso mínimo, sem borda nem fundo; exceção restrita a [[html-components#Aviso de pré-lançamento (CitySceneEditor.tsx)]] |
| Imagem enviada pelo usuário | WebP, mín. 1200px | JPEG; edifício 800px, perfil 400px (`resizeImage`) | backend do perfil só aceita JPEG/PNG; Safari não gera WebP em `canvas`; JSON limitado a 1 MB |

**Hex permitido** (exceção ao "tokens only"): logo de terceiros na cor oficial (Google em `AuthDialog`; WhatsApp, Facebook, LinkedIn em `ShareDialog` — X usa tinta), pelagem dos mascotes, valores de cor da cena 3D nos painéis de controle (dado do material, não estilo). Logo oficial = PNG/WebP em `public/` (`logo.webp`, `logo-branca.webp`, `favicon-32.png`); admin usa via `CidoeLogo`.

**Fora do app:** templates de redes sociais (seção 08 do DS: 1080×1920, 1080×1080, 1920×1080, zonas seguras) vivem só no arquivo HTML.

**E-mail do código de acesso** (backend `cidoe-back`, `src/modules/auth/auth.email.sender.ts`): mesmo visual — placa `pixel bevel-edge`, kicker verde, código em bloco verde com bisel, "!" âmbar sobre tinta, logo em pixel. Tokens copiados em hex (`DS`) porque e-mail não lê CSS: mudou token em `src/index.css` → mudar lá também.

## Copy

- Regras do `CLAUDE.md` (UI copy enxuta) valem acima de exemplo do DS.
- Fluxo de contribuição: **"Contribuir"**, **"Erguer edifício"**, **"Aumentar edifício"**. Nunca "Doar", "Construir", "prédio" — em toda UI, inclusive painel de controle da cena. Exemplos do arquivo do DS usam esses termos; traduzir: "Doar e construir" → "Contribuir", "+1 prédio erguido" → "+1 edifício erguido", "Ana doou" → "Ana contribuiu".
- Erro: frase clara do que fazer ("Faltou o domínio — ex.: ana@email.com"), sem alarme.

## Proibido

- `rounded-*` (exceto `rounded-full` em círculo real), `border` cinza fina como contorno principal → `pixel`.
- `shadow-*`, `drop-shadow-*`, `backdrop-blur-*`, `bg-gradient-*`/`bg-linear-*`.
- Vermelho, `white`, `black`, hex solto, paleta padrão do Tailwind.
- Fonte pixel. Mono em parágrafo ou valor.
- `animate-spin` → `BlockLoader`.
- Âmbar decorativo: âmbar = moeda/conquista/foco/alerta.
- Imagem: canto redondo ou círculo (avatar incluso), proporção fora das cinco, filtro (`saturate-*`, `sepia`, `blur-*`, `grayscale` puro), véu ou degradê sobre foto, texto direto na foto, `<img>` solto sem moldura em página, sprite em escala não inteira.

## Checklist — componente novo

1. Superfície = token (`bg-background`, `bg-card`, `bg-primary`…). Nada de hex.
2. Contorno = `pixel` (+ `pixel-thin` se pequeno). Volume = `bevel-*`.
3. Botão = `<Button>` com variante; não reinvente.
4. Campo = `<Input>` ou `field`; rótulo `mono-label` acima.
5. Progresso = `BlockBar`; carregando = `BlockLoader`.
6. Opção ativa em lista = `menu-cursor`.
7. Dentro de scroll: respiro para a borda em pixel não cortar.
8. Foco visível sem fazer nada (global). Não esconda com `outline-none` em elemento sem outro sinal de foco. Não some `focus-visible:ring-*`: contorno âmbar global já cobre, e `ring` apaga a borda `pixel`.
9. Erro = `ErrorMark` + frase em `text-destructive`. Nunca vermelho.
10. Página fora da cena = `bg-background pattern-paws` + [[#Composição de página]].
11. Mascote só em pai sem `overflow`; posição do DS (`-top-[47px] right-8` cachorro, `-top-[45px] right-[60px]` gato).
12. Imagem = `<Photo ratio>` (uma das cinco) ou `<Avatar size>`; `alt` com animal + ação; texto por cima só em placa. Ver [[#Imagem]].
13. Divergiu do arquivo do DS? Registre em [[#Desvios conscientes]].

Ver também: [[html-components]], [[three-components]], [[index]].
