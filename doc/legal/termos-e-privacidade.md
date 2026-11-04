---
title: Termos de Uso e Política de Privacidade
tags:
  - cidoe
  - legal
  - lgpd
  - auth
aliases:
  - Termos de Uso
  - Política de Privacidade
  - Aceite dos termos
---

# Termos de Uso e Política de Privacidade

Envio de códigos: **Zoho CPaaS / ZeptoMail** substitui Resend como operador ativo. Política informa processamento fora do Brasil sem presumir região da conta Zoho. Versão `2026-10-25` (beta `2026-10-25-beta`). Backend preserva Resend desativado; reativação exige atualizar política e versão antes do deploy.

Duas páginas públicas + aceite somente no cadastro + aviso separado de cookies. Base: lei brasileira (LGPD, Marco Civil, CDC) e requisito do Google para login (link da política na home, mesmo domínio). Texto revisado por agentes (ver [[#Agentes]]), **não** por advogado — validar antes de escalar.

> [!important] Fonte única
> Edição, versão, data, controlador, e-mail e caminhos: `src/lib/legal.ts`. Texto: `src/pages/legal/Terms.tsx` e `src/pages/legal/Privacy.tsx`. Layout: `src/pages/legal/LegalPage.tsx`.

---

## Duas edições

Mesmo código nas duas branches; só `LEGAL_EDITION` (`src/lib/legal.ts`) muda:

| Branch | `LEGAL_EDITION` | `LEGAL_VERSION` | Texto |
|---|---|---|---|
| `beta` (produção hoje, pré-lançamento) | `"prelaunch"` | `2026-10-25-beta` | Texto definitivo **+** avisos de pré-lançamento: pagamento inativo, simulação só no navegador, seção "Pré-lançamento: tudo é teste" |
| `main` (lançamento) | `"launch"` | `2026-10-25` | Texto definitivo: Pix via **Woovi** direto para a conta da ONG (Cidoe não recebe nem repassa dinheiro), edifício público, devolução encaminhada à ONG |

- **Texto definitivo nas duas**: beta já descreve lançamento real (Woovi, edifício público, ONG recebe Pix). Quem aceita na beta não aceita outra versão no lançamento.
- `IS_PRELAUNCH` só **acrescenta** aviso (`IS_PRELAUNCH && …`, `...(IS_PRELAUNCH ? [secao] : [])`). Nunca `IS_PRELAUNCH ? … : …` escondendo cláusula de lançamento. Nada de "no lançamento estes termos mudam".
- Paridade: toda cláusula da main existe na beta (ex.: 18+ em Termos "Resumo"/"Conta" e Política "Menores de idade"). Conferir com `diff` entre worktrees.
- Mudança relevante depois: aviso **só no site** 15 dias antes de valer (sem e-mail); discordou → encerra conta sem custo; continuou usando → vale. Sem modal de reaceite.
- Edição faz parte da versão registrada no cadastro. O login não compara versões nem solicita novo aceite.
- Merge `main → beta` mantém a linha da beta (só a beta mexe nela). Nunca commitar `"prelaunch"` na main.
- Documentos valem só para **usuários** (com ou sem conta, e quem escreve ao contato). ONGs terão termos próprios quando o cadastro de ONGs abrir.

> [!danger] main não vai ao ar antes da integração Woovi
> O texto `launch` afirma que o Pix é gerado pela Woovi direto para a conta da ONG. Hoje a main só tem `PIX_SIMULATED` (nunca em produção) com `receiverName: "Cidoe"`. Publicar a main antes da integração = texto falso.

---

## Rotas

| Rota | Arquivo | Sessão |
|---|---|---|
| `/termos` | `src/pages/legal/Terms.tsx` | nenhuma — fora do `AuthProvider` |
| `/privacidade` | `src/pages/legal/Privacy.tsx` | nenhuma — fora do `AuthProvider` |

Imports diretos em `src/App.tsx`; build e primeira renderização compartilham `AppContent`, preservando documentos completos na hidratação. Nginx serve cada URL pública exata; fallback SPA reservado ao admin, demais URLs desconhecidas recebem 404. `LegalPage` rola no próprio `<main>`. [[seo]].

Links:
- HTML inicial: apresentação real da home e documentos completos sem JavaScript. `noscript` esconde o loading e mantém aviso, links públicos e explicação existente dos dados do login com Google.
- Placa da marca na cena ([[html-components#Placa da marca (CitySceneEditor.tsx)|placa]]): só marca, sem links (decisão do dono).
- Rodapé da home ([[html-components#DonationInfoSection.tsx|DonationInfoSection]]) — exigência do Google: política linkada na página inicial.

### Página inicial — requisitos do Google

Fonte: [Requisitos da página inicial do app](https://support.google.com/cloud/answer/13807376?hl=pt-BR). Domínio oficial **`cidoe.com.br`** (verificado no Search Console por TXT). Outros domínios não devem ser usados em console, texto ou configuração.

| Requisito | Onde atende |
|---|---|
| Identifica app/marca | Placa da cena (**Cidoe**, sem logo), `<title>`, `favicon-96.png` |
| Descreve funcionalidade | Hero da `DonationInfoSection` no HTML estático + página `/sobre` |
| Explica finalidade dos dados do Google | `/privacidade#google`; parágrafo existente em `noscript` preservado. Corpo normal da home sem esse parágrafo |
| Link fácil para política (mesma URL do console) | Rodapé da home (seta da cena leva até ele), aviso de cookies, `<noscript>` |
| Visível sem login | `/` pública; nada atrás de `AuthProvider` |
| Domínio verificado, sem redirecionar | Console usa `https://cidoe.com.br` exato — `www.` e `http://` redirecionam (301), não cadastrar |
- Caixa de aceite (`TermsConsent`) — abre em **nova aba**: prova do e-mail do cadastro vive só no estado React, sair da aba perderia o cadastro.
- Entre os dois documentos (menu lateral do `LegalPage`).

`LegalPage` = DS de página fora da cena: `bg-background pattern-paws`, kicker mono com a versão, título display, índice de seções (sticky no desktop), texto em placa `pixel bevel-edge bg-card`. Corpo em Manrope (DS proíbe mono em termo legal).

---

## Aceite no cadastro

```mermaid
flowchart TD
  A[AuthDialog: e-mail/código ou Google] -->|conta existe| B[sessão aberta]
  A -->|conta nova| C[perfil: nome + username + caixa de aceite]
  C -->|caixa marcada| D["POST /auth/register/complete { termsVersion }"]
  D --> E[versão e data registradas no cadastro]
  B --> F[cena / onboarding opcional]
  E --> F
```

- **Caixa** (`src/components/TermsConsent.tsx`): "Tenho 18 anos ou mais, aceito os Termos de Uso e li a Política de Privacidade." Nunca pré-marcada. Links em nova aba preservam o cadastro em andamento. Aceite gravado (`user_terms_acceptance`) = prova da declaração de idade, sem coluna nova.
- **Cadastro**: botão **Criar conta** desabilitado até marcar; `handleProfileSubmit` também valida o aceite. `completeRegistration({ …, termsVersion: LEGAL_VERSION })` vale para e-mail e Google. O backend mantém a validação obrigatória e registra versão, data e histórico `signup`.
- **Login**: conta existente entra diretamente. Não há modal de reaceite, comparação com `user.terms_version`, migração ou aceite automático de contas antigas.
- **Pós-login**: indicação e onboarding mantêm suas regras de prioridade, sem bloqueio por versão dos termos.

## Aviso de cookies

- `src/components/CookieNotice.tsx`, montado globalmente após a hidratação em `App.tsx`, independente da sessão e do aceite dos termos. A primeira renderização não depende de storage; evita divergência com o HTML do build.
- Vídeo de apresentação sob demanda: `cidoe:intro-video-seen` deixou de ser usado e foi retirado da tabela de armazenamento; chaves antigas não são apagadas. Sem finalidade nova de tratamento de dados.
- Banner discreto: **Usamos cookies essenciais para o site funcionar. Se você aceitar, também usamos o Google Analytics para medir o uso do site.** Link para `/privacidade#cookies` em nova aba; botões **Recusar** e **Aceitar**, mesmo tamanho. `?ref=` sai do `page_location` enviado ao GA (`analytics.ts`). Sem overlay, captura de foco ou bloqueio da navegação; fica acima da navegação móvel e abaixo dos diálogos.
- Escolha: `localStorage["cidoe:analytics-consent"] = "granted" | "denied"`. `readProjectStorage` preserva a decisão legada e o Analytics recebe revogações de abas anteriores ao deploy. Valor ausente/inválido mostra banner; `cidoa:cookie-notice = acknowledged` antigo não concede consentimento. Storage bloqueado: escolha vale na visita atual.
- Política inclui **Preferências de cookies**, que dispara `cidoe:cookie-preferences` e reabre o banner, e **Desativar cookies opcionais**, que salva `denied`, interrompe novos envios e confirma por toast. Evento `storage` sincroniza revogação entre abas. Cookies existentes podem ser apagados pelo navegador.
- Política documenta análise, dados, finalidade por consentimento, compartilhamento com Google, `_ga` / `_ga_*` (até 2 anos, renovados com uso) e chave local. Versão atualizada em **18/10/2026**; aceite dos termos permanece exclusivo do cadastro.
- Verificação: `node scripts/check-consent.mjs` e `node scripts/check-analytics.mjs`, `npm run build`, `npm run lint`; sem servidor ou navegador.

## Google Analytics

- `src/lib/analytics.ts`: Google tag **G-GEHP0ENSCR**, sem dependência nova. `main.tsx` restaura escolha antes de montar React; inicialização fora dos efeitos evita duplicação por StrictMode.
- Só `import.meta.env.PROD`. Modo básico do Consent Mode v2: sem carregar `gtag.js` ou enviar dados ao Analytics antes do aceite. Outros serviços Google (login/fontes) continuam independentes.
- Após aceite: `consent default` nega análise e publicidade → `consent update` concede apenas `analytics_storage` → `js` → `config` → script assíncrono no `<head>`. `config` uma vez por carregamento; pageview inicial automático, sem evento manual duplicado.
- `allow_google_signals: false` e `allow_ad_personalization_signals: false`; `ad_storage`, `ad_user_data`, `ad_personalization` sempre negados. Sem envio explícito de nome, e-mail ou identificadores da conta.
- Recusa/revogação: `ga-disable-G-GEHP0ENSCR = true` antes do update de consentimento; bloqueia novos cookies e envios da propriedade. Novo aceite reativa sem duplicar script.
- Rotas React usam History API; medição automática depende da opção no GA4: **Administrador → Fluxos de dados → Web → Medição otimizada → Visualizações de página → Configurações avançadas → Carregamentos de página + Alterações na página com base em eventos do histórico do navegador**. Conferir ambas ativas. Não adicionar pageviews manuais junto desse modo.
- Após deploy, validar **Tag Assistant** e **DebugView**: tag encontrada após aceite, um `page_view` inicial, um por mudança de rota, sem envios após recusa. Painel GA4 e transmissão real não foram verificados pelos checks locais.
- Fontes oficiais: [Google tag](https://developers.google.com/tag-platform/gtagjs), [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent), [básico × avançado](https://support.google.com/analytics/answer/10000067), [SPA](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [controles de privacidade](https://developers.google.com/tag-platform/security/guides/privacy), [cookies](https://support.google.com/analytics/answer/11397207).

## Backend (`cidoe-back`)

| Peça | O quê |
|---|---|
| Migration `0021_user_terms_acceptance.sql` | `user.terms_version` + `user.terms_accepted_at` (último aceite, checagem rápida) e `user_terms_acceptance` (histórico só de inclusão: versão, `method` `signup`/`reaccept`, IP, user-agent, data; CASCADE com a conta) |
| `termsVersionSchema` (`user.schema.ts`) | `YYYY-MM-DD` + sufixo opcional `-[a-z]{1,8}` (edição); back não conhece versão vigente — grava a que o front mostrou |
| `completeRegistrationSchema` | `termsVersion` obrigatório |
| `POST /user/me/terms` | Rota ainda disponível no backend; não é chamada pelo frontend, que registra o aceite somente no cadastro |
| `PublicUser` | expõe `terms_version`, `terms_accepted_at` |

> [!warning] Deploy junto
> `termsVersion` obrigatório no back + `.strict()`: front antigo (sem o campo) não cadastra; back antigo recusa campo desconhecido. Ordem: migration 0021 → back → front, na mesma janela.
>
> **Produção hoje = front `beta`.** Subir a beta com estas páginas e o aceite junto com o back (beta antiga não envia `termsVersion` → nenhum cadastro funciona). Sem isso o Google também não acha a política.

---

## Mudar os termos

1. Editar texto em `Terms.tsx` / `Privacy.tsx`.
2. Mudança relevante (dado novo, terceiro novo, finalidade nova, regra nova) → nova data em `LEGAL_DATE` + `LEGAL_UPDATED_AT`. A nova versão é registrada nos próximos cadastros, sem modal no login. Contas existentes: aviso no site 15 dias antes de valer (texto promete; sem e-mail). Correção de digitação → sem versão nova.
3. Rodar `revisor-termos` (ver [[#Agentes]]) antes de publicar.

---

## Agentes

Definidos em `.claude/agents/` (carregam em sessão nova do Claude Code):

| Agente | Papel |
|---|---|
| `auditoria-termos` | Varre front (main + beta) e back; acha dado coletado, terceiro, cookie, retenção e risco de exibição errada/remoção/teste, com `arquivo:linha` + cláusula sugerida |
| `pesquisa-legal` | LGPD, Marco Civil, CDC, ANPD, requisitos do Google; checklist com fonte primária; o que é nulo |
| `revisor-termos` | Confere textos contra pedidos do dono, lei, Google e código; veredito + correções |
| `pesquisa-idade` | Idade mínima: lei (CC, LGPD art. 14, ECA Digital) + prática de Vakinha e afins; diz se vai na caixa de aceite |
| `benchmark-termos` | Lê termos de Vakinha, Apoia.se, Catarse, Benfeitoria, Kickante, Abrace uma Causa, GoFundMe; lista o que adotar/melhorar, sem copiar e sem promessa por e-mail |

Rodar de novo quando: feature nova coleta dado, entra terceiro (PSP, analytics), muda retenção, ou antes de sair do pré-lançamento.

---

## Idade mínima

Decisão 18/10/2026 (`pesquisa-idade`): **18+ para conta e contribuição**, declarado na caixa de aceite.

- Lei não obriga site de doação a exigir 18. Mercado: Vakinha, Apoia.se, Catarse, Kickante, GoFundMe exigem 18 para conta (regra fica no texto ou em data de nascimento; Vakinha escreve "você declara que é maior de 18" junto ao botão).
- Por quê 18: aceite e doação de menor são nulos (<16) ou anuláveis (16–17) — CC arts. 104, 166, 171. Com 18, LGPD art. 14 sai de cena; abrir para menores traz ECA Digital inteiro (Lei 15.211/2025, vigente desde 17/03/2026).
- Por quê na caixa: CC art. 180 — menor de 16–17 não invoca idade se "declarou-se maior no ato de obrigar-se". Sem atrito extra. Data de nascimento = dado a mais e pouco confiável (ANPD).
- Autodeclaração permitida: ECA Digital art. 9º §1º proíbe só para conteúdo impróprio a menores. Login Google não prova 18 (conta Google no Brasil: 13+). Menor consegue pagar Pix.
- ⚖️ Risco aberto: ANPD pode ver o Cidoe como de "acesso provável" por menores (cidade 3D aberta sem conta) → avaliação de risco e avisos dos arts. 5º–8º mesmo com regra de 18. Validar com advogado.

## Pendências fora do texto

Achados de `auditoria-termos` + `pesquisa-legal` (15/10/2026) que o texto contorna mas o produto ainda deve resolver:

- **Integração Woovi (antes de ativar Pix real)** — o texto da main já promete:
  - recebedor do Pix = conta da ONG na Woovi (hoje o simulado mostra `receiverName: "Cidoe"`);
  - enviar à Woovi só valor, ONG e código da cobrança (sem nome, e-mail ou CPF) e **descartar** nome/CPF do pagador que vierem na confirmação;
  - cancelar na Woovi a cobrança substituída ("gerar novo código invalida o anterior"); se um código antigo for pago mesmo assim, registrar a contribuição;
  - devolução e MED por webhook → reduzir ou remover o edifício;
  - corrigir cobrança paga com edifício apagado aparecendo "expirada" e pagamento com destino inválido.
- Dono decidiu não publicar documento (CPF) na página.
- **Sem promessa por e-mail (dono, 18/10/2026)**: único e-mail da app = código de acesso. Avisos só **no site**: mudança relevante dos documentos (15 dias antes), fim do pré-lançamento (15 dias antes), encerramento do Cidoe (30 dias). Motivo de remoção só **a pedido** (usuário escreve ao contato). Não reintroduzir aviso por e-mail no texto sem rotina de envio pronta.
- **"Aviso no site" sem lugar fixo**: hoje só existe `CookieNotice`. Antes da 1ª mudança relevante ou do fim do pré-lançamento: faixa global na cidade (publicação → data de vigência) + bloco "O que mudou" no `LegalPage` (sugestão `benchmark-termos`, 18/10/2026).
- **Remoção por ordem judicial** (Marco Civil art. 20): lei manda comunicar o motivo ao autor quando houver contato → responder pelo e-mail da conta nesses casos, mesmo sem promessa no texto.
- **Sem suspensão de conta** no back (só editar edifício ou excluir usuário) → Termos não prometem suspensão; medida = retirar conteúdo ou excluir conta.
- **Benchmark (18/10/2026)**: aplicados aviso contra golpe, uso do dinheiro decidido pela ONG, MED só para golpe/falha, ITCMD/IR, sigilo do denunciante, denúncia contra ONG (`ong.is_active`), conteúdo público copiável, Pix não anônimo para ONG, exclusão em até 15 dias, robôs, cópia dos dados se o Cidoe fechar. Não adotados: taxas, foro fixo, arbitragem, teto de responsabilidade, licença perpétua, títulos em pergunta.
- **Versão `2026-10-18`**: quem cadastrou com `2026-10-16-beta` aceitou texto que anunciava nova versão no lançamento → cobre com o aviso de 15 dias **no site** ao publicar. Contas com `terms_version` NULL (antes da 0021): mesmo aviso.
- **Exclusão apaga contribuições** (`purgeUser` → `DELETE FROM donation`): com Pix real, registro vale como prova → guardar anonimizado e ajustar retenção.
- **Catálogo**: Termos prometem item retirado do catálogo continuar nos edifícios onde aplicado ou equivalente. Confirmar no render.
- **Decreto 7.962 art. 2** (CPF/CNPJ + endereço do fornecedor) e **CDC art. 49** (arrependimento 7 dias, dinheiro com a ONG): avaliar com advogado antes de ativar Pix; pôr devolução em 7 dias no contrato com ONGs.
- **Dados de teste em produção**: `POST /admin/test-buildings` sem trava de ambiente e sem marca de teste; `DELETE` apaga doações reais; ONGs do seed são fictícias e somam em "Total arrecadado".
- **main**: campo "doar"/"gerar" visível a qualquer visitante (beta já restringe a admin).
- **Holograma** sem reencode (pode levar EXIF/GPS); foto do Google guardada como URL.
- ~~**Terceiros em todo acesso**~~ resolvido: fontes self-hosted (`public/fonts`) e GIS só baixa ao abrir login (ou ponteiro no "Entrar") — ver [[html-components#Carregamento inicial (casca)]]. Visitante que não loga não fala com Google (exceto Analytics após aceite).
- **Titular**: sem exclusão/exportação pela interface (hoje por e-mail, admin executa); exclusão não limpa `email_suppression` (declarado na política).
- **Operacional** (promessas do texto): confirmar denúncia e analisar em até 30 dias; responder ao denunciante pelo contato da denúncia; imagem íntima com prioridade máxima; comunicar às autoridades conteúdo de abuso infantil; dar o motivo de remoção/suspensão/exclusão a pedido; responder contestação em até 30 dias; responder contato em até 5 dias úteis; corrigir registro em 10 dias úteis; encaminhar pedido de devolução à ONG; responder titular em 15 dias; guardar mensagens até 1 ano após o assunto fechar; aviso no site: encerramento com 30 dias, mudança relevante e fim do pré-lançamento com 15 dias; comunicar incidente à ANPD; beta: Pix pago por engano → pedir devolução a quem recebeu e acompanhar. Relatório anual de denúncias **não** foi prometido (vinha de decreto não confirmado).
- **Prova do aceite** some com a conta (CASCADE). Guardar 5 anos após exclusão (CDC art. 27) exige `SET NULL` + hash do e-mail e mudar a retenção da política.
- **Validar com advogado** os decretos citados pela pesquisa (Decreto 12.975/2026 → arts. 16-E/20-A do Decreto 8.771; Decreto 12.976/2026).
- **Caixa `contato@cidoe.com.br`**: Política cita "provedor de e-mail" genérico (MX → `inbound-smtp.sa-east-1.amazonaws.com`). Confirmar provedor e país onde as mensagens ficam; fora do Brasil → declarar em "Transferência".
- **Fatos do dono já no texto**: hospedagem no Brasil; controlador pessoa física sem documento na página.
- **Backup ainda não existe (18/10/2026)** — política já promete: cópias por até 3 meses, mais antigas apagadas automaticamente, dados no Brasil. Antes de guardar dado real de contribuição: rotina automática (`pg_dump` agendado) com rotação de 90 dias, destino no Brasil, restauração testada. Sem rotina, conferir texto de "Por quanto tempo guardamos".
- **Runbook de backup contradiz a política** (`cidoa-back/dev/prod/server/006-escalabilidade-operacao.md`): usa `-mtime +14` (14 dias) → passar para `+90`; sugere cópia externa em S3/B2/Drive (fora do Brasil) → manter no Brasil ou declarar a transferência na política.
- **Caixa `contato@cidoe.com.br`**: provedor e país (se fora do Brasil, declarar em "Transferência para fora do Brasil").
- **Recompensas do pré-lançamento**: texto da beta diz que continuam valendo no lançamento (tela promete recompensa — CDC art. 30). Confirmar.
- **Dono**: prazo dos logs do proxy HTTPS do host; e-mail de suporte no console do Google (conta Google ou grupo administrado); URLs `https://cidoe.com.br/`, `/privacidade`, `/termos` no console depois do deploy (domínio autorizado: `cidoe.com.br`). Caixa `contato@cidoe.com.br`: MX aponta para recebimento da Resend (`inbound-smtp.sa-east-1`) — confirmar que chega a alguém.

---

Ver também: [[index]], [[html-components]], [[area-admin]], [[desingn-system-index]].

## Duração do cookie administrativo

Política de Privacidade: `token_admin` dura 30 dias ou até sair. Mesmo prazo do JWT administrativo, fixado no código do backend, sem variável de ambiente. Sessão administrativa exige novo login para receber novo prazo.

## Marca e SEO

Marca pública e domínio: **Cidoe**, `https://cidoe.com.br/`. SEO permanente, idêntico em `beta` e `main`: doação para ONGs de proteção animal em uma cidade 3D. Descrições usam termos simples sobre doações, pagamentos, cadastro, dados pessoais e cookies; títulos e cláusulas legais preservados. Nenhuma fase/versão nos títulos, descrições, metadados sociais, JSON-LD ou apresentação `noscript`; lançamento não exige troca. Avisos operacionais da simulação e cláusulas legais da `beta` preservados.

`/termos`: **Termos de Uso · Cidoe**. `/privacidade`: **Política de Privacidade · Cidoe**. Descrições e schema em `src/lib/seo.ts`; `RouteMetadata` aplica head em navegação. HTML inicial já contém corpo completo, canonical e previews corretos de cada documento. Sitemap: home, Sobre e dois documentos. `npm run check:seo` verifica HTML emitido e navegação entre páginas; `check-branding` inclui esse check. Autoria pública em `/sobre`, sem mudar controlador, versão ou cláusulas legais. Ver [[seo]].
