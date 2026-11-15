---
title: SEO e descoberta por IA
tags:
  - seo
  - pesquisa
  - ia
aliases:
  - SEO
  - GEO
---

# SEO e descoberta por IA

Auditoria: **3 de novembro de 2026**. Escopo: frontend, conteúdo público, build e Nginx do repositório. Referência: [[index]], [[html-components]] e [[termos-e-privacidade]]. Sem servidor, navegador, deploy ou acesso às contas de busca.

> [!important] Resultado esperado
> Conteúdo acessível, coerente e elegível para pesquisa. Indexação, posição e citação por IA dependem dos buscadores; nenhuma tag garante aparição.

## Diagnóstico e implementação

| Área | Antes | Agora |
|---|---|---|
| HTML inicial | Loading; explicação restrita ao `noscript` | Apresentação real da home no HTML; loading preservado na primeira viewport |
| Texto durante falhas | Seção pública aguardava API, catálogo e cena | Seção montada independentemente de `booted`; erro de dados não esconde apresentação/links |
| Documentos legais | Corpo e metadados após JavaScript | Corpo completo e metadados próprios no HTML de cada URL |
| Identidade | Marca; responsável só nos documentos | `/sobre`, autoria visível, contato e relação explícita com o projeto |
| Dados estruturados | `WebSite` isolado | Grafo `WebSite`, `Organization` e `WebPage`; `AboutPage` e `Person` na página Sobre |
| Rotas inexistentes | SPA com HTTP 200 e redirecionamento para home | Nginx responde 404; página própria e `noindex`; React também mostra erro |
| Administração | HTML público da home; `Disallow` | Entrada própria `admin.html`, `noindex` no HTML e cabeçalho HTTP |
| Sitemap | Home e documentos | Cinco URLs públicas, incluindo `/sobre` e `/video` |
| Bots de IA | Permissão implícita por `*` | Permissão explícita no mesmo grupo; sem perder restrições da API |
| Atualização de buscadores | Sitemap | Sitemap + comando IndexNow com verificação da chave publicada |

Google recomenda conteúdo disponível em texto, links rastreáveis e renderização estática quando adequada: nem todo bot executa JavaScript. Mesma apresentação React usada no build e no cliente; sem selecionar conteúdo pelo User-Agent. Fonte: [SEO para JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Arquivos e manutenção

- `src/lib/seo.ts`: domínio, títulos, descrições, canonical, previews e JSON-LD. Fonte única para Vite, build estático e navegação.
- `src/components/RouteMetadata.tsx`: atualiza head a cada rota, inclusive volta à home; remove canonical e schema público em páginas não indexáveis.
- `src/seo/render.tsx`: entrada exclusiva do build. Renderiza `AppContent` com `renderToString` e `StaticRouter`, preservando marcadores de hidratação e IDs do React. Cena/admin lazy ficam externos ao bundle do prerender e não são executados nesse processo.
- `src/main.tsx`: `hydrateRoot` em produção quando existe HTML no root; `createRoot` no dev e no admin vazio. `AppContent` começa com `clientReady=false` no build e no cliente; após o primeiro paint monta sessão da cena, cookies e toaster. `SceneFallback` mantém texto/links/imagens enquanto o editor baixa. Documentos públicos usam imports diretos para corresponder ao HTML inicial.
- `scripts/prerender.mjs`: usa esbuild já instalado pelo Vite, sem dependência nova; temporário em `node_modules/.tmp`, removido ao terminar. Analytics desativado nesse processo Node. Sem API ou dados de contas.
- `npm run build`: TypeScript → Vite → HTML público. Não publicar somente a saída de `vite build`, pois faltariam os documentos estáticos.
- `dist/index.html`, `dist/sobre/index.html`, `dist/termos/index.html`, `dist/privacidade/index.html` e `dist/video/index.html`: páginas públicas.
- `dist/admin.html`: casca da administração, sem schema público; `dist/404.html`: erro estático. Arquivos auxiliares acessados internamente pelo Nginx.
- `docker/nginx.conf`: páginas públicas exatas; fallback SPA restrito a `/dale`; 308 das variantes `/sobre/` e `/sobre/index.html` para `/sobre`, equivalente nos documentos e em `/video`. Query preservada; canonical exclui parâmetros de indicação/campanha.
- `.dockerignore`: inclui o script necessário no build da imagem. Sem backend novo.

Novas páginas indexáveis exigem rota React, entrada `SEO_PAGES`, renderização, sitemap e localização Nginx. `check:seo` verifica correspondência entre páginas e sitemap. Não emitir `lastmod` com data de cada build: usar somente data real de alteração significativa. `priority` e `changefreq` omitidos. Fontes: [canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Palavras e intenção

Seleção baseada no produto e nas dúvidas respondidas; **sem medição de volume, dificuldade ou posição**. Hipóteses para validar com consultas reais no Search Console.

Home: **Cidoe | Doação para ONGs de proteção animal em uma cidade 3D**. Revisão de linguagem em **4 de novembro de 2026**: metadados das páginas públicas, apresentação da home, H1/H2, perguntas de Sobre e `noscript` usam termos simples. Open Graph/Twitter e JSON-LD recebem os mesmos títulos e descrições de `src/lib/seo.ts`.

| Intenção | Termos | Aplicação |
|---|---|---|
| Marca | Cidoe, o que é Cidoe | Home, Sobre, nomes consistentes |
| Doação | doação para ONG, doar para ONGs, cidade 3D | Título, descrição, H1 e apresentação da home; Sobre |
| Causa | ajudar animais, ajudar cães e gatos, ONG de animais, proteção animal | Descrição da home e explicação da causa em Sobre |
| Funcionamento | como funciona o Cidoe, como doar para uma ONG, personalizar meu prédio | Título e perguntas de Sobre; explicação da cidade virtual |
| Autoria | Cidoe Israel Zeferino, quem criou o Cidoe | Seção de autoria e descrição de Sobre |
| Confiança | termos de uso, regras para doações, privacidade, dados pessoais, cookies | Metadados dos documentos próprios; contato verificável em Sobre |

H1 da home: **Cidoe: doação para ONGs em uma cidade 3D.** H2 **Doações na cidade** para os totais; seção de ONGs mantém o contexto de cada branch. Sobre responde **Como funciona a doação para uma ONG?**, **As doações já são reais?** e **Como personalizar meu prédio?**. Metadados permanentes da marca preservados entre branches; corpo informa situação operacional. Nesta branch: ONGs fictícias, contribuição simulada e nenhum pagamento real. Não prometer repasses, adoção, resgates realizados, benefícios fiscais ou parceiros não comprovados.

“Doação” substitui “contribuição” e “prédio” substitui “edifício” nas explicações públicas quando isso melhora a leitura. Nomes reais de comandos, como **Simular contribuição** e **Meus edifícios**, permanecem nas instruções. Títulos de Termos de Uso e Política de Privacidade continuam descritivos; suas descrições usam doações, pagamentos, cadastro, dados pessoais e cookies. Cláusulas e avisos operacionais preservados. Textos alternativos continuam descrevendo as imagens; marca Cidoe e autoria de Israel Zeferino preservadas.

Sem `meta keywords`, listas escondidas, repetição de variantes ou densidade-alvo. Palavras entram em frases úteis; sinônimos não exigem páginas separadas. Fonte: [guia de SEO do Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Conteúdo da página Sobre

Revisão sincronizada em **15/11/2026**; mesmo `src/pages/About.tsx` nas duas branches. H1 **Sobre o Cidoe: apoio a ONGs de animais**. Introdução identifica projeto independente de apoio à proteção animal e autoria. Texto explica doação para ONG, prédio novo/aumento, filtros e papel da plataforma; Cidoe não é ONG.

Na edição `launch`, detalha Pix pela Woovi diretamente à ONG, passos de **Contribuir**, conferência de recebedor e comprovante bancário. Link `/termos#contribuicoes` leva às condições existentes, sem alterar cláusulas ou versão legal. Orienta consultar canais oficiais e atuação da organização; distingue doação registrada de comprovação de impacto. Sem parceiros, credenciais, auditoria, repasses ou resgates inventados. Blocos de teste permanecem condicionais: `beta` informa simulação local e personalização de qualquer edifício sem conta; passos de Pix só na `main`. Tags compartilhadas preservadas.

Conteúdo útil para dúvidas reais sobre apoio a ONGs de animais; termos em frases naturais, sem repetições artificiais ou promessa de posição no Google. Base: [conteúdo útil](https://developers.google.com/search/docs/fundamentals/creating-helpful-content). Mesmo componente React no cliente e no HTML inicial; `check:seo` verifica paridade e existência da seção legal vinculada. [[html-components#Página Sobre (About.tsx)]].

## Israel Zeferino

Identificar criador ajuda transparência e atribuição. Google incentiva autoria verdadeira quando relevante; isso **não transforma o nome em fator garantido de ranking**. `/sobre#israel-zeferino` mostra criador, responsabilidade pelos dados e contato já público. JSON-LD liga `WebSite.creator` e `Organization.founder` a `Person`. Sem inventar formação, premiações, perfis sociais ou credenciais. Nome fora do título principal da home e sem repetição em todas as páginas. Fonte: [conteúdo útil e autoria](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

Perfis fornecidos pelo criador: [LinkedIn](https://www.linkedin.com/in/dev-israel-zeferino/) e [Instagram](https://www.instagram.com/rael.zeferino/). Botões com ícones na seção de autoria; URLs compartilhadas com `Person.sameAs` em `CREATOR_SOCIAL_PROFILES`. Perfis pertencem à pessoa, não à organização Cidoe. Menu de palavras oferece Sobre, Termos e Privacidade apenas no início da seção HTML abaixo da cena, à direita, inclusive sem JS; [[html-components#Menu público (PublicPageNav.tsx)]].

`Organization` representa o projeto Cidoe, sem afirmar personalidade jurídica ou condição de ONG. Somente nome, URL e logo; Sobre acrescenta fundador e contato visíveis. Sem CNPJ, endereço, avaliações, estatísticas ou status beneficente inventados. Dados precisam corresponder ao conteúdo público. Fontes: [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [políticas de dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## Google, Gemini e outras IAs

| Serviço | Controle de acesso | O que foi preparado |
|---|---|---|
| Google Search, AI Overviews e AI Mode | `Googlebot`; elegibilidade na conta Search Console | HTML público, snippets liberados, canonical, links e sitemap |
| Gemini Apps e grounding | `Google-Extended` | Acesso permitido; não confundir com o controle da Pesquisa |
| ChatGPT Search | `OAI-SearchBot` | Acesso público; head e corpo disponíveis sem JavaScript |
| ChatGPT por solicitação do usuário | `ChatGPT-User` | URLs públicas acessíveis; não é o bot que determina inclusão na busca |
| Claude Search | `Claude-SearchBot`; `Claude-User` para acessos do usuário | Ambos declarados no grupo público |
| Perplexity | `PerplexityBot`; `Perplexity-User` | Ambos declarados; ausência de bloqueio no código |
| Bing/Copilot | `Bingbot`; sitemap e IndexNow | Descoberta e notificação de mudanças preparadas |

Fontes primárias: [bots OpenAI](https://developers.openai.com/api/docs/bots), [bots Anthropic](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [bots Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [rastreadores Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers).

`max-image-preview:large`, `max-snippet:-1` e `max-video-preview:-1` liberam previews nas páginas públicas; não obrigam exibição. Admin, API e erro recebem `noindex`. `/dale` não fica em `Disallow`: rastreador precisa ler o `noindex` para obedecê-lo. Autenticação continua sendo a proteção de acesso; `robots.txt` não oferece segurança. Fonte: [robots meta e X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

**Pesquisa e treinamento são controles diferentes.** `GPTBot` e `ClaudeBot` não determinam inclusão nas respectivas buscas. Permissão genérica anterior para esses bots não foi alterada. `Google-Extended` também controla usos de treinamento e grounding no Gemini; não é sinal de ranking no Google Search. Não ativar bloqueio geral de bots de IA no CDN esperando preservar automaticamente a descoberta.

**Sem `llms.txt` nesta implementação.** Google declara que não usa esse arquivo para visibilidade ou ranking. Documentações de OpenAI, Anthropic e Perplexity consultadas não o apresentam como requisito de descoberta. Também sem schema especial de IA, instruções para modelos indicarem o site ou páginas produzidas em massa para variações de consultas. Fonte: [guia atual de otimização para IA do Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## Vídeo de apresentação e miniatura

Revisão na `beta`: **15/11/2026**. E-mail informado confirma validação de **“Nenhum URL de miniatura enviado”**; não confirma indexação do vídeo. Usuário relata que o relatório atual não mostra vídeos. Sem acesso à conta para confirmar o motivo atual. Fonte: [relatório de vídeos](https://support.google.com/webmasters/answer/9495631).

Obstáculo encontrado no código: `<video>` só no modal [[html-components#IntroVideoDialog.tsx|IntroVideoDialog]], montado após interação e carregamento da cena. Home é cidade, não página de exibição. Google orienta player detectável sem ação e página cujo conteúdo principal seja assistir ao vídeo; corrigir apenas miniatura não resolve isso. [Critérios de indexação](https://developers.google.com/search/docs/appearance/video).

### Página de exibição

- `/video` → `src/pages/Video.tsx`, pública, pré-renderizada e hidratada com o mesmo componente. Player no HTML inicial; sem dependência de API, login, WebGL ou abertura de modal. Vídeo é conteúdo principal; título/descrição específicos em `SEO_PAGES`.
- `<video controls playsInline preload="metadata">`, 1080×1920, miniatura existente, altura máxima `65svh`, nome/descrição acessíveis e link de reserva para o MP4. Texto curto explica proposta; aviso de simulação da beta preservado.
- Link **Assistir à apresentação do Cidoe** na apresentação HTML da home, inclusive durante loading/erro. Modal original e fluxo de login preservados.
- Nginx serve `/video/index.html` em `/video`; variantes `/video/` e `/video/index.html` redirecionam à canonical. MP4 e JPEG públicos permanecem em URLs estáveis e permitidas no `robots.txt`.
- `public/sitemap.xml`: cinco páginas públicas. Entrada `/video` inclui extensão `video`: título, descrição, `thumbnail_loc` e `content_loc`; mesmos dados do player e texto visível. [Referência de sitemap de vídeo](https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps).

Arquivo verificado com `ffprobe`: MP4 H.264, 1080×1920, áudio AAC, duração **15,1 s**; animação apresenta prédios, apoio a ONGs de animais, indicação e pré-lançamento. Arquivo preservado. `poster="/video-cidoe-poster.jpg"` no player e no modal: JPEG opaco 720×1280, extraído do vídeo aos 14 s; `thumbnail_loc` usa a mesma URL absoluta. O `og:image` do site continua sendo logo; não substitui a miniatura do vídeo.

Sem data original de publicação verificada no arquivo. Sitemap usa campos obrigatórios sem data opcional; nenhum `lastmod` ou `publication_date` presumido. `VideoObject` exige `uploadDate` real para a elegibilidade documentada pelo Google; não inventar essa data nem tratar data de build/commit como publicação. [Propriedades do vídeo](https://developers.google.com/search/docs/appearance/structured-data/video).

### Verificação e publicação

`npm run build`, `npm run lint`, `npm run check:seo` e `npm run seo:submit -- --dry-run`. Check verifica player no HTML, controles, ausência de loading/modal, MP4 e JPEG emitidos, miniatura válida, link de descoberta, canonical e consistência do sitemap. Sem servidor, navegador ou requisição aos buscadores.

Após publicar **build e Nginx juntos**:

1. Conferir `/video`, `/video-cidoe.mp4` e `/video-cidoe-poster.jpg` acessíveis sem sessão; tipos `text/html`, `video/mp4` e `image/jpeg`. MP4 deve aceitar leitura parcial (`Range`). Conferência HTTP real pendente.
2. Search Console: inspecionar `https://cidoe.com.br/video`, conferir player no HTML renderizado e solicitar indexação da página; reenviar `/sitemap.xml` atualizado se necessário.
3. Depois do novo rastreamento, acompanhar detecção/indexação do vídeo nessa URL. Página precisa ser indexada antes do vídeo; sua presença no índice, por si só, não garante indexação de vídeo. Validar somente problemas ainda ativos; o e-mail já confirmou a correção da miniatura. [Relatório de vídeos](https://support.google.com/webmasters/answer/9495631).

Conta Search Console, respostas HTTP de produção e decisão de indexação não verificadas nesta alteração. Página preparada para descoberta/elegibilidade; indexação depende do Google.

## Estratégias além das tags

1. **Conteúdo próprio e verificável.** Depois do lançamento real, publicar regras claras de destinação, identificação das ONGs participantes, datas, comprovantes e impacto verificável. Dados simulados nunca viram prova de impacto. Dar contexto a cada estatística.
2. **Páginas úteis por entidade.** Futuras páginas de ONG/cidade só com parceria real, conteúdo suficiente, dados atualizados e endereço estável. Não gerar milhares de páginas vazias a partir do IBGE nem indexar cada combinação de filtro. Usuários continuam com dados privados fora do sitemap.
3. **Menções legítimas.** Site/portfólio do criador, repositório oficial e organizações realmente participantes podem explicar e linkar o projeto com a marca consistente. Buscar cobertura editorial e relatos reais; evitar compra de links e depoimentos fictícios. Nenhuma mensagem enviada nesta tarefa.
4. **Mídia original.** Vídeo de demonstração e imagens existentes complementam texto. Página dedicada `/video` tem o player como conteúdo principal; `VideoObject` só com thumbnail, duração e data reais. Não inventar datas para habilitar rich results. [Orientações de vídeo](https://developers.google.com/search/docs/appearance/video).
5. **Experiência real.** Cena 3D permanece lazy; HTML informativo não espera WebGL. Logo/foto públicos são emitidos com URL, dimensões e lazy loading nativo; avatares também independem de `booted`. `Photo` reconhece imagens já carregadas antes da hidratação. `/sobre` explica simulação, personalização, limite e armazenamento local com os rótulos reais da interface. Core Web Vitals de campo continuam pendentes: referências LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no percentil 75. Não considerar a tela de loading como prova de que a cidade ficou utilizável. [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals).
6. **Dados de decisão.** Comparar consultas com e sem marca, URLs indexadas, impressões, CTR, cadastro e, no lançamento, contribuições concluídas. Separar desempenho real de citações ocasionais em prompts. [Medição de IA no Bing](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/).

## Publicação e contas externas

> [!warning] Preparado no repositório; não configurado nas contas
> DNS, proxy HTTPS, CDN/WAF, Search Console, Bing Webmaster Tools e indexação atual não foram acessados. Build local não comprova a resposta HTTP de produção.

1. Publicar **build e Nginx juntos**, pela imagem atualizada. Configuração antiga ainda devolveria home/HTTP 200 nos endereços desconhecidos.
2. Conferir origem oficial HTTPS sem `www`; variantes HTTP/host devem redirecionar no proxy externo, sem loops. Não adicionar redirecionamento HTTPS interno que brigue com terminação TLS do proxy.
3. Google Search Console: conferir propriedade de domínio por DNS; enviar `/sitemap.xml`; inspecionar as cinco páginas. Validar canonical selecionada, ausência de `noindex` público, acesso às imagens e resposta real 404.
4. **Settings → Search generative AI:** manter inclusão dos links e conteúdo habilitada; conferir herança de propriedades pai/filhas. Esse controle de conta não pode ser definido por tag neste repositório. [Documentação do controle](https://support.google.com/webmasters/answer/16908024).
5. Consultar relatório de desempenho em IA; ausência pode significar impressões insuficientes. Não mede todo uso do domínio por todas as IAs. [Relatório do Google](https://support.google.com/webmasters/answer/16984139).
6. Bing Webmaster Tools: verificar propriedade pelo método **Arquivo XML** — `public/BingSiteAuth.xml` (baixado da conta) sai na raiz, `https://cidoe.com.br/BingSiteAuth.xml`. Após deploy, abrir a URL, conferir HTTP 200 com o código do usuário e clicar **Verify** na conta. Manter o arquivo: remoção derruba a verificação. Trocar de conta = substituir o arquivo pelo novo download. [Verificação no Bing](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b). Depois: enviar sitemap e acompanhar AI Performance. IndexNow avisa Bing, Yandex, Seznam, Naver e Yep na hora em que URLs mudam, sem esperar rastreamento; Google não participa. Chave na opção recomendada do protocolo: `public/{chave}.txt` na raiz, conteúdo = própria chave, sem `keyLocation`. Prova pública de controle, não segredo. Trocar chave = renomear arquivo e conteúdo juntos. `deploy.sh` do back roda `seo:submit` após subir imagens; falha só avisa, não desfaz deploy. Script confirma arquivo em produção e envia somente URLs canônicas do sitemap. HTTP 200/202 = aceite, não indexação; 403 chave ausente, 422 URL fora do host, 429 envio frequente demais. Não substitui Google Search Console. [Protocolo IndexNow](https://www.indexnow.org/documentation).
7. CDN/WAF: permitir bots legítimos nas páginas públicas sem captcha/challenge; conferir IPs nas listas oficiais atualizadas. Não confiar só no User-Agent para liberar acesso privilegiado. Não alterar autenticação nem firewall da API.
8. Pós-deploy autorizado: validar Rich Results/Schema Markup Validator, URL Inspection e PageSpeed; conferir cabeçalhos, cache e compressão na origem/CDN. Revalidar depois de trocar domínio, proxy ou regras de bots.

Favicon declarado no HTML: `public/favicon-96.png`, derivado 96×96 do `logo.webp` verde-oliva existente (192×192). Mantém identidade, formato quadrado e URL estável, acima da recomendação visual de 48×48. `favicon-32.png` antigo continua disponível para caches. Logo do schema segue no WebP original. [Requisitos de favicon](https://developers.google.com/search/docs/appearance/favicon-in-search).

### Verificações na conta após publicar

- **Inspeção de URL:** inspecionar home e `/sobre`, comparar HTML renderizado com o texto esperado e conferir recursos/erros de JavaScript. A canonical escolhida pelo Google aparece nos dados indexados; o teste ao vivo não prevê a escolha nem garante indexação. [Inspeção de URL](https://support.google.com/webmasters/answer/9012289?hl=pt-BR).
- **Desempenho:** comparar consultas de marca e outras consultas, por página e dispositivo, acompanhando impressões, cliques e CTR. Rever após mudanças relevantes e mensalmente; não concluir melhora por posição média isolada. [Relatório de desempenho](https://support.google.com/webmasters/answer/7576553?hl=pt-BR).
- **Core Web Vitals:** usar dados de campo e investigar o uso real dos controles no celular. Nova renderização e lazy loading precisam de medição após deploy; checks locais não substituem esses relatórios.

## Verificação local

```bash
npm run build
npm run lint
npm run check:seo
node scripts/check-branding.mjs
node scripts/check-donation-info.mjs
node scripts/check-consent.mjs
node scripts/check-analytics.mjs
npm run seo:submit -- --dry-run
```

`check:seo`: HTML emitido sem JS, paridade com `AppContent`, H1, imagens lazy, favicon 96×96, head único, schema, autoria, rotas privadas/erro, metadados entre rotas, player público, miniatura, sitemap de vídeo e bots. Inclui `check-public-startup.mjs`: seleção de hidratação versus root vazio, vídeo fechado na entrada (desktop/mobile/com indicação), abertura por botão, login solicitado e foto já carregada antes da hidratação. IndexNow validado apenas em modo local. Não executa navegador, servidor, hidratação em DOM real ou métricas de campo.

Validação adicional desta alteração: jsdom temporário fora do repositório, sem nova dependência no projeto. Home, Sobre, Termos, Privacidade e 404 hidrataram sem avisos e reaproveitaram o H1 original; cena pendente manteve apresentação, foto e links. Sem GPU, servidor ou navegador. Imports diretos dos documentos públicos aumentaram o JS inicial de aproximadamente 111 para 139 KB gzip no build local; é o custo da primeira renderização compartilhada nesta implementação. Medir experiência real após deploy.
