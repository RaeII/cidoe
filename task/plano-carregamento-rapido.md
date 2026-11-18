# Plano — carregamento rápido da cidade (`main` + `beta` + API)

Data: 2026-11-18. Front `beta` `dbd9b3f`, `main` `e075351`; API `main` `983e6f8`.
Objetivo: reduzir o tempo até a **cidade utilizável** (loading fora, órbita e clique livres) sem mudar edifícios, posições, aparência nem filtros.
Complementa [[plano-carregamento-cidade]] (plano do dono) — avaliação item a item na seção 4.
Evidência: 3 investigações paralelas — medição em produção, pipeline de render, pesquisa web. Método, destino de cada recomendação e fontes na seção 8.
**Status: Fases 0, 1, 3 e 4 implementadas; Fase 2 parcial (ver nota). Nada commitado.** Resultados na seção 7.

## 1. Linha de base medida (produção = `beta`, Chrome headless, mediana)

| Marco (ms desde navegação) | Desktop frio | Desktop quente | Mobile frio (CPU 4×, 9 Mbps, RTT 150) |
|---|---:|---:|---:|
| FCP / LCP (HTML pré-renderizado) | 200 / 236 | 108 / 176 | 474 / 668 |
| Chunks da cena: início → fim | 245 → 309 | 172 → 178 | 665 → 1159 |
| Snapshot: início → fim | 521 → 554 | 445 → 475 | 1228 → 1434 |
| Primeiro desenho WebGL | 579 | 505 | 1355 |
| **Cena pronta (`booted`)** | **1093** | **971** | **3278** |
| Saída do loading começa | 4812 | 4721 | 5091 |
| **Loading some** | **5728** | **5619** | **6017** |

Bytes frios: 2,52 MB. Texturas + imagens 1,74 MB (69%). JS 500 KB gz. Tarefa longa da montagem: 105 ms desktop, 340–415 ms mobile.
Cascata mobile: chunks 665→1159; snapshot só depois (1228). Fachadas em 3 ondas por pasta — cor 1301–2216, rugosidade/metal 1595–2834, deslocamento 1842–3108. Normal do topo 1644→3135: maior download (772 KB, 31% dos bytes). Desktop: ~210 ms ociosos entre chunk e montagem (inferido: throttle do Suspense).
Perfil de CPU mobile: montagem 339–415 ms (geometria dos formatos, `toNonIndexed`/`clone`, clone de material por formato); upload `texSubImage2D` 156 ms; compilação de shader ~135 ms; GC 71 ms.
Snapshot público: 0 doações, 165 KB JSON / 54 KB gz — **99,7% é a lista inteira de 5.571 municípios**.

## 2. Onde o tempo vai (evidência)

1. **Loading segura a cidade pronta.** `InitialLoading.tsx:96-122`: barra só anda após 1,1 s, máximo 40 %/s, segura 1 s no fim, depois ~0,9 s de saída. Piso ≈ 4,6 s. Desktop: cidade pronta em 1,1 s, visível em 5,7 s.
2. **Revelação espera todas as texturas.** `createCitySceneRuntime.ts:847` libera só sem nenhum download (`DefaultLoadingManager`). Inclui roughness/metalness/bump e o normal do topo `Concrete024_NormalGL.webp` (789 KB, near-lossless de propósito — `scripts/encode-webp.mjs:34`). `facadeTextureLoader.ts:105-128`: cada pasta baixa cor → depois os outros mapas (2–3 idas por pasta).
3. **Tudo começa depois do chunk da cena.** Snapshot e catálogo só saem quando `CitySceneEditor` monta (`App.tsx:37-41`, `useDonations.ts`).
4. **Beta baixa e descarta.** `useDonations.ts:89-116`: doações e personalizações do banco jogadas fora (seeds 480 fixos). Usa só `ongs` + espera `/donation/customizations` à toa. `CitySceneEditor.tsx:230` espera o catálogo, mas a beta usa pool fixo.
5. **Snapshot carrega lista de cidades inteira.** `donation.database.ts:282` (`SELECT … FROM city`). Front tem `/location/cities` próprio pros formulários; snapshot só precisa das cidades com edifício. Filtro de cidade hoje lista 5.571 cidades sem edifício (`DonationFilterBar.tsx` diz "UFs presentes no dataset").
6. **Nginx apaga o cache da API.** `docker/nginx.conf:22` `expires -1` herdado no `/api` reescreve `Cache-Control` para `no-cache` (conferido em produção: snapshot, customizations, catalog). Fonte: código do `ngx_http_headers_filter_module`.
7. **Main: imagem do holograma em toda carga.** `hologramImage` (data URL até 1 MB, `donation.schema.ts:125`) vai em todas as personalizações: no `custom` do snapshot (front ignora) e em `/donation/customizations` (sem cache, toda visita). Mesmo motivo que já tirou o perfil do snapshot (`donation.controller.ts:243`).
8. **Main: personalização reaplicada custa O(N) cada.** `createDonationManager.ts:3725-3731`: toda chamada sem troca de formato roda `applyInstanceColors()` (O(N) + compactação), mesmo sem mudar cor. Troca de filtro/upsert reaplica todas → O(N·C).
9. **Main: catálogo tardio reconstrói a cidade.** `setFacadeTexturePool` (manager:3350-3359) faz `rebuildFacadeGroups` + rebuild total se o pool chega depois do `setDonations`.

## 3. Fases (ordem = ganho ÷ esforço)

Legenda: **[ambas]** muda arquivo compartilhado (aplicar em `beta` e `main`); **[beta]**, **[main]**, **[API]**.

### Fase 0 — Medir igual antes/depois
- [x] `scripts/measure-city-load.mjs` [ambas]: Chrome via CDP, frio/quente/mobile (CPU 4×, 9 Mbps, RTT 150). Imprime marcos da tabela 1, bytes por tipo, tarefas longas. `URL=` aponta pra produção ou `vite preview`. Linha no `doc/index.md`.
- [x] `performance.mark` em 3 pontos [ambas]: dados prontos, doações aplicadas, `booted`. Script e celular (adb + CDP) leem as mesmas marcas.

### Fase 1 — Loading sai quando a cidade fica pronta [ambas]
- [x] `InitialLoading.tsx`: barra começa quando aparece (0,9 s, antes 1,1 s), teto 40 → 250 %/s (segue progresso real, nunca volta), pausa final 1 s → 0,45 s (pulo do gato completo). Saída em blocos mantida, já com `pointer-events-none`. Movimento reduzido: 0,5 → 0,2 s. Ajuste fino = 3 constantes no mesmo arquivo.
- [x] `scripts/check-initial-loading.mjs` sem suposição de tempo: segue válido.
- Meta: desktop frio ≤ 1,5 s até loading sair; mobile ≤ booted + 0,4 s.

### Fase 2 — Revelar com o essencial, detalhe depois [ambas]
- [x] `facadeTextureLoader.ts`: mapas opcionais da pasta saem junto com a cor. Check: `check-mobile-performance.mjs`.
- [ ] **Movido para condicional.** Revelar só com cores exige aplicar o set em 2 etapas (`loadFacadeTextureSet` só resolve com todos os mapas; `applyFacadeMaterial` liga defines de uma vez) → recompilação de shader com a cidade visível (loop pausa o desenho enquanto compila). Além disso celular real é `IS_LOW_TIER` (texturas 512: ~0,5 MB, normal do topo 192 KB, não 789 KB). Ganho real < medição em desktop limitado.

### Fase 3 — Dados chegam antes e menores
- [x] [API] Snapshot só com cidades que têm doação ativa (filtra pelos `cityId` já carregados no build; zero SQL novo). Produção: 165 KB → <1 KB.
- [x] [API] `/donation/me` devolve a cidade junto (`city`), pra edifício recém-pago em cidade nova ter nome antes do snapshot renovar. [main] `upsertDonations` mescla a cidade.
- [x] [ambas] Nginx: `expires off;` no `location /api` (sem nginx/Docker local: conferir com `curl -sI` após deploy) → volta `max-age=30` do snapshot, `max-age=60` do catálogo, 1 dia das cidades.
- [x] [API] `/donation/customizations`: `no-cache` em vez de `no-store` (dado público; sempre revalida, 304 economiza bytes).
- [x] [ambas] Buscar snapshot assim que a home carrega (`main.tsx`, só na rota `/`), em paralelo ao chunk da cena; `useDonations` consome a mesma promessa na 1ª carga. Retry busca de novo.
- [x] [beta] Sem `/donation/customizations` e sem esperar catálogo pra liberar o loading (pool fixo `SEED_FACADE_TEXTURES`).
- [x] [main] `setDonations` só depois do catálogo (pool definido) → sem 2º rebuild total.

### Fase 4 — Main aguenta crescer
- [x] [API] Imagem do holograma fora das cargas em lote: lista traz `/api/donation/:id/hologram.{ext}?v=<updated_at ms>` (cache imutável); PUT com essa URL mantém a imagem gravada deste edifício. [main] `createHologramMesh` detecta GIF pela extensão. Validado no banco local (200 `image/gif`, 404 sem imagem, 400 `svg`, PUT conserva).
- [x] [API] Tirar `custom` do snapshot (v6, ETag `W/"6:…"`) (front das duas branches não lê; personalização vem de `/donation/customizations`).
- [x] [ambas] Manager: cor só recalculada quando muda; fila de personalizações faz **uma** passada de cor no fim do lote, não uma por edifício.

### Condicionais (só com medida que justifique)

| Item | Gatilho | Abordagem |
|---|---|---|
| Montagem por quadras ("primeiros e depois o resto") | `setDonations` > 50 ms no Redmi (estimado a partir de ~20 mil doações) | Ordem por valor já põe maiores no centro; publicar quadras do enquadramento primeiro, resto em fatias de 4 ms, IDs originais preservados |
| Protótipos de formato fatiados | tarefa de montagem > 200 ms no Redmi após Fases 1–3 (hoje 339–415 ms no mobile limitado: geometria + clone de material por formato) | construir 1 protótipo (formato × fachada) por fatia, ou aquecer enquanto espera a rede |
| Acessório só perto da câmera | acessórios > ~500 no boot | criar letreiro/topo/LED só dentro dos 80 un. já usados no cull |
| Pool de 8 luzes do LED criado no init | perfil mostra recompilação de todos os programas no boot | número de luzes estável desde o 1º frame |
| Brotli pré-comprimido (assíncrono) | snapshot > ~300 KB gz | gzip na hora, brotli q11 em `zlib.brotliCompress` depois (−16% em 100k linhas) |
| UI pós-boot fora do grafo da cena | JS da cena > 400 KB gz | `rewardNotifications`, `dropdown-menu`, `select` lazy |
| Revelar com cores, mapas depois | textura ainda for o maior trecho em celular real (adb) | aplicar mapas com textura 1×1 desde o início (define estável) e trocar a imagem quando chegar |
| Pool de fachadas da `main` menor na abertura | `main` mobile: 2,1 MB de fachadas (pool = catálogo inteiro) segura `cidade pronta` em 4,5 s no teste limitado | abrir com as pastas das maiores doações; demais entram depois |
| Fotos de ONG fora do snapshot | ONGs ganharem foto (data URL dentro de `ongs`) e snapshot > 100 KB | mesma técnica do holograma (`/api/ong/:id/image.{ext}?v=`) |
| Acessórios reposicionados, não recriados | rebuild > 50 ms no Redmi com centenas de letreiros/LEDs (`main` em escala) | `syncSigns`/`syncEdgeLights`/`syncScreens` (manager:2380-2383) destroem e recriam tudo a cada rebuild; boot da beta rasteriza 13 letreiros e monta 4 LEDs 2×. Atualizar posição/altura; recriar só o que mudou |
| `setDonations` com personalizações numa passada | troca de filtro/upsert na `main` > 50 ms no Redmi | hoje fila + 1 passada de cor por lote (Fase 4) já corta o O(N·C) da cor; passo seguinte = acessórios em lote no mesmo rebuild |
| Compilação de shader enxuta | perfil no Redmi com compilação > 100 ms antes de revelar | `compileAsync` hoje cobre todo objeto (ocultos inclusive) × alvo do cubo, a cada chegada de textura (preparer:89-124). Uma passada após texturas + fila; só visíveis; variantes do cubo depois de revelar |
| Textura única por URL | memória de GPU apertada no celular | Facade001 e Facade002 têm rugosidade/metal/deslocamento iguais byte a byte → mesma URL no build, 2 texturas na GPU (as duas no pool da beta). Cache por URL no `facadeTextureLoader` |
| Editor fora do throttle do Suspense | painel Performance confirmar os ~210 ms ociosos entre chunk e montagem (React 19 segura revelação ~300 ms após o fallback) | importar o chunk fora do `lazy`/`Suspense`, montar quando resolver |
| Chunks da cena mais cedo | LCP com folga em campo e ganho medido no Redmi | hoje 2 rAF + `import()` (mobile 665→1159 ms). `modulepreload` no HTML ou `import()` logo após FCP. Disputa banda com o LCP no mobile — motivo do `afterPaint` |
| Snapshot por script inline no `<head>` | snapshot voltar a pesar (> 100 KB gz) | sai ~300 ms antes do entry no mobile; hoje <1 KB e chega antes do chunk → ganho zero |
| Brotli nos assets estáticos | JS virar trecho maior no celular real | JS 500 KB gz servido só gzip; imagem nginx oficial sem `ngx_brotli` → pré-comprimir no build + módulo |
| Beta: preferências locais antes do 1º rebuild | usuário logado com preferências salvas mostrar 2º rebuild (inferido, `useLocalCity.ts:43-60`) | aplicar preferências antes do 1º `setDonations` |

### Descartado (com motivo)
- **Service Worker / IndexedDB do snapshot**: visita quente já transfere 4 KB (ETag); tempo é CPU + animação.
- **Formato binário / parse em worker**: `JSON.parse` de 100k tuplas = 6–9 ms (M4); montagem custa mais.
- **Normal map lossy**: WebP lossy é 4:2:0, apaga o relevo (motivo registrado em `encode-webp.mjs`). Celular (tier baixo) já baixa a versão 512 de 192 KB.
- **`checkShaderErrors=false` em produção**: já é (`createCitySceneRuntime.ts:164`, só DEV).
- **HDRI menor pro PMREM**: já usa fonte separada de 1K; céu 4K desktop / 2K tier baixo (`loadEnvironment.ts:27-30`).
- **Lighthouse/PSI como métrica**: WebGL roda em SwiftShader (CPU) → TBT inflado; `<canvas>` não é candidato a LCP. Métrica = marcas próprias + script + celular.
- **`preload as=fetch` + axios**: Safari ignora com cabeçalho próprio → download duplo. `fetch` no entry resolve igual.
- **Importar a cena antes do 1º paint**: LCP hoje 236/668 ms; o `afterPaint` protege isso.
- **SWR de dias no snapshot**: visitante voltaria vendo cidade velha até recarregar.
- **103 Early Hints**: HTML estático, sem tempo de servidor pra esconder.
- **BatchedMesh**: problema de FPS em órbita ([[relatorio-desempenho-edificios]]), não de carregamento.

## 4. Plano do dono ([[plano-carregamento-cidade]]) — dá pra implementar?

| Item | Veredito | Motivo |
|---|---|---|
| 1. Marcas `performance.mark` + Resource Timing | **Sim** (Fase 0) | 3 marcas + script CDP |
| 1. Nginx respeitar `Cache-Control` da API | **Sim** (Fase 3) | `expires off;` no `/api` |
| 1. Cronometrar rebuild do snapshot no backend | **Condicional** | hoje 0 doações; medir com 10k/100k de teste antes de mexer em SQL/compressão |
| 2. Main: usar `custom` do v5 e reconciliar `/customizations` depois | **Adiado** | ganho < 100 ms (chamada paralela, ~70 ms); risco de corrida com edição/sessão. Se voltar: recolocar `custom` compacto (sem imagem) |
| 2. Beta: gerar seeds na montagem | **Sim, por outro caminho** | com cidades filtradas o snapshot da beta cai pra <1 KB e sai do entry; chega antes do chunk da cena (desktop ~250 ms, chunk ~309 ms) |
| 2. Beta: rota nova `GET /donation/ongs` | **Não** | mesmos bytes do snapshot filtrado, rota/ETag/reconciliação a mais |
| 3. Revelar no 1º quadro útil, detalhe depois | **Sim** (Fases 1–2) | portão de texturas + loading |
| 3. Buscar snapshot junto do import do editor | **Sim** (Fase 3) | busca no entry |
| 4. Montagem por quadras visíveis | **Condicional** | 480 seeds = ~3 ms; vale só com dezenas de milhares |
| 4. Representação compacta (cidades necessárias, sem imagens) | **Sim, parte** (Fases 3–4) | cidades filtradas + holograma por URL |
| Critérios de aceite (p50/p75, integridade visual, tarefas > 50 ms) | **Sim** | usados na verificação abaixo |

## 5. Verificação por fase
- `npm run build`, `npm run lint`, checks existentes: `check-initial-loading`, `check-scene-stats`, `check-building-textures`, `check-mobile-performance`, `check-prelaunch`, `check-building-management`, `check-donation-info`. API: `bun run build`, `bunx tsc --noEmit`, `bun test`.
- `scripts/measure-city-load.mjs` antes/depois (mesma build de referência, 3 rodadas). Aceite: ganho maior que variação entre rodadas; integridade visual (mesma cidade final, mesmos IDs/posições/aparência).
- Cabeçalhos: `curl -sI` em `/api/donation/snapshot`, `/customizations`, `/customization/catalog` depois do deploy.

## 6. Ordem de entrega
1. API compatível primeiro (cidades filtradas, `city` no `/me`, cabeçalho, holograma por URL com PUT aceitando URL atual). Front antigo continua funcionando.
2. Front `beta` (produção hoje), depois `main` com os mesmos itens [ambas] + [main].
3. Docs: [[html-components]] (InitialLoading), [[scene-textures]], [[scene-runtime]], [[scene-managers]], [[donation-api]], `doc/index.md`; API `doc/modulos/doacoes/doacoes.md`.

## 7. Resultados (2026-11-18, local: `vite preview` + API local, Chrome headless, mediana de 3)

`node scripts/measure-city-load.mjs` — base = commit atual de cada branch, mesma API.

| Marco (ms) | beta base | beta nova | main base | main nova |
|---|---:|---:|---:|---:|
| Snapshot começa — desktop | 389 | **46** | 397 | **40** |
| Snapshot começa — mobile | 1244 | **521** | 1232 | **519** |
| Cidade clicável (saída do loading) — desktop frio | 4681 | **1814** | 4675 | **1804** |
| Cidade clicável — desktop quente | 4676 | **1805** | 4674 | **1802** |
| Cidade clicável — mobile frio (CPU 4×, 9 Mbps) | 5058 | **3915** | 5724 | **4975** |
| Loading some — desktop frio | 5597 | 2733 | 5591 | 2737 |
| Tarefa mais longa — mobile | 345 | 335 | 203 | 207 |

- Desktop: −2,9 s nas duas branches. Mobile: −1,1 s (beta) e −0,75 s (main).
- Restante no mobile limitado = bytes de textura no tier desktop (beta 1,7 MB; main 3,0 MB, pool = catálogo inteiro). Celular real baixa 512 px; medir via adb antes de mexer (condicionais acima).
- Produção (beta, antes): loading sumia em 5,7 s desktop / 6,0 s mobile; snapshot 165 KB → <1 KB com o v6.

### Checks
- Front (beta e main): `npm run build`, `npm run lint`, `check-building-management` (sandbox ganhou `performance`/`catalogReady`), `check-mobile-performance` (+ mapas junto com a cor, + cor uma vez por rajada — os dois falham no código antigo), `check-scene-stats`, `check-donation-info`, `check-contribution`, `check-building-draw-calls`; beta: `check-prelaunch`, `check-project-status`, `check-led-screen`.
- Já falhavam antes (commit base, sem relação): `check-building-textures` (`residential` indefinido), `check-horizon` (`window.setTimeout`), `check-public-startup` (`onClick`).
- API: `bun test` (181 ok), `bunx tsc --noEmit`, `check-donation-customization.ts` (+ URL própria aceita, URL alheia/svg/sem versão recusadas).

## 8. Investigações de apoio (2026-11-18)

Três agentes em paralelo, só leitura (nenhum arquivo do repo mexido; rascunhos apagados).

| Investigação | Método | Sustenta |
|---|---|---|
| Medição em produção (`cidoe.com.br`, beta) | Chrome headless via CDP, perfil novo por rodada fria; desktop frio/quente ×3, mobile ×2 (CPU 4×, 9 Mbps, RTT 150) + 2 perfis de CPU | seção 1, causas 1–3, 6; base da seção 7. Virou `scripts/measure-city-load.mjs` |
| Pipeline de render (código + build) | leitura de `beta` e `main` com linha; build medido; sem trace (API local parada) | causas 2–5, 7–9; Fases 2–4; condicionais |
| Pesquisa web | fonte primária (spec, código nginx/Chromium/Bun/three r183, MDN/BCD) + bench local (M4, 100k tuplas sintéticas) | nginx, prefetch, descartes, brotli |

### Recomendação → destino

| Recomendação | Origem | Destino |
|---|---|---|
| Loading acompanha progresso real, sem pausa longa | medição, pipeline | **Feito** (Fase 1) |
| `expires off;` no `/api` | pesquisa | **Feito** (Fase 3) |
| Snapshot sai no entry, junto do chunk | as três | **Feito** via `fetch` no `main.tsx`; script inline no `<head>` → condicional |
| Beta: seeds na montagem, sem customizations nem portão do catálogo | pipeline | **Feito** por outro caminho (snapshot filtrado + prefetch) |
| Mapas da pasta em paralelo com a cor | medição, pipeline | **Feito** (Fase 2) |
| Cor só quando muda / 1 passada por lote | pipeline | **Feito** (Fase 4) |
| Pool definido antes do 1º `setDonations` (main) | pipeline | **Feito** (Fase 3) |
| Revelar só com cores, resto em streaming | medição, pipeline | Condicional (recompila shader com cidade visível; celular real é tier baixo) |
| `modulepreload` / `import()` antes do React | pesquisa, pipeline | Condicional (disputa banda com LCP) |
| Shader: 1 passada, só visíveis, luzes estáveis, cubo depois | pipeline, pesquisa | Condicional |
| Acessórios reposicionados em vez de recriados; lote no `setDonations` | pipeline | Condicional |
| Construção progressiva (caixas → formatos perto da câmera) | pesquisa, pipeline | Condicional (montagem por quadras; 480 seeds = ~3 ms) |
| Brotli q11 assíncrono no snapshot | pesquisa | Condicional (snapshot > ~300 KB gz) |
| UI pós-boot fora do grafo da cena | pipeline | Condicional |
| SWR de 7 dias + refetch `no-cache` | pesquisa | Descartado (cidade velha até recarregar) |
| Normal do topo lossy/menor | medição, pipeline | Descartado (relevo); tier baixo já 192 KB |
| `checkShaderErrors=false`; HDRI 1K pro PMREM | pesquisa | Já estava no código |
| BatchedMesh por material | pesquisa | Descartado (FPS, não carga) |
| Binário / parse em worker | pesquisa | Descartado (parse 6–9 ms) |

### Fontes (pesquisa web, lidas 2026-11-18)

| Afirmação | Fonte |
|---|---|
| `expires` herdado reescreve `Cache-Control` de resposta proxied (200/304…); negativo = `no-cache` + `Expires` passado; `expires off` no filho anula | `ngx_http_headers_filter_module.c` (master); nginx.org/en/docs/http/ngx_http_headers_module.html |
| `preload as=fetch`: Chrome reaproveita pra axios; Safari ignora com cabeçalho próprio (download duplo); Firefox só se cacheável — **uma fonte só** | HTML/Fetch spec; chromium `resource.cc`; nawfelbgh.github.io/blog/preload-as-fetch-in-practice |
| `fetch()` já sai com prioridade alta | web.dev/articles/fetch-priority |
| 103 Early Hints: só navegação, HTTP/2+, Safari só preconnect | developer.chrome.com/docs/web-platform/early-hints |
| SWR: Chrome 75, Firefox 68, Safari 14. Cache API funciona sem SW. Safari apaga storage após 7 dias sem interação | MDN BCD; developer.mozilla.org/en-US/docs/Web/API/Cache; webkit.org/blog/10218 |
| `JSON.parse` 2,2 MB = 6 ms Node / 9 ms Bun (M4); celular médio 3–4× mais lento (estimado) | bench local; v8.dev/blog/cost-of-javascript-2019 |
| Worker devolvendo objeto = clone do mesmo tamanho; só `ArrayBuffer` transferido sai de graça | surma.dev/things/is-postmessage-slow |
| brotli q11 −16% vs gzip-6 (2,4 s em 100k linhas); q5–q9 ≈ gzip. `brotliCompress` assíncrono do Bun roda no pool de threads; `*Sync` trava o servidor | bench local; Bun `node_zlib_binding.rs`; caniuse.com/brotli |
| zstd sem suporte universal (Safari parcial) | caniuse.com/zstd |
| Tarefa > 50 ms = fatiar; `scheduler.yield` sem Safari → `setTimeout`/rAF | web.dev/articles/optimize-long-tasks; MDN BCD |
| `<canvas>` não é candidato a LCP | web.dev/articles/lcp |
| Lighthouse/PSI desenha WebGL em SwiftShader → TBT inflado (comunidade) | discourse.threejs.org t/94734 |
| `compileAsync` usa `KHR_parallel_shader_compile` (sem Firefox); só materiais, textura sobe no 1º render | three r183 (código); MDN BCD |
| BatchedMesh: culling/ordenação na CPU por frame; sem multi-draw no Firefox → 1 draw por instância | three r183 (código); discourse t/81221 (comunidade) |
| Vite injeta preload dos deps do chunk só quando `import()` roda | vite.dev/guide/features |

Não verificado: estimativa de parse no celular, comportamento de preload em Safari/Firefox (blog único), magnitude da recompilação de shader e do throttle do Suspense. Medir no Redmi (adb + CDP) antes de agir.

