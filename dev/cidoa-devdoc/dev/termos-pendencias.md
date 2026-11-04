### Pendências dos Termos e da Política (levantadas em 18/10/2026)

O texto dos Termos de Uso e da Política de Privacidade já promete os itens abaixo, mas o projeto ainda não faz. Detalhes e motivos: `doc/legal/termos-e-privacidade.md` (seção "Pendências fora do texto").

### Antes de ativar o Pix real (Woovi)

- [ ] Recebedor do Pix = conta da ONG na Woovi (hoje o simulado mostra `receiverName: "Cidoe"`; a tabela `ong` não tem conta nem chave Pix)
- [ ] Enviar à Woovi só valor, ONG e código da cobrança (sem nome, e-mail ou CPF)
- [ ] Descartar nome e CPF do pagador que vierem no webhook (não gravar nem logar)
- [ ] Cancelar na Woovi a cobrança substituída ao gerar novo código; se um código antigo for pago mesmo assim, registrar a contribuição
- [ ] Devolução e MED por webhook → reduzir ou remover o edifício
- [ ] Corrigir cobrança paga com edifício apagado aparecendo "expirada" e pagamento com destino inválido
- [ ] Exclusão de conta não pode apagar o registro da contribuição (`purgeUser` faz `DELETE FROM donation`): guardar anonimizado e ajustar a retenção na Política
- [ ] Validar com advogado: arrependimento de 7 dias (CDC art. 49) e Decreto 7.962 art. 2 (CPF/CNPJ e endereço do fornecedor)
- [ ] Contrato com as ONGs: devolução em até 7 dias quando pedida

### Backup

- [ ] Criar rotina automática (`pg_dump` agendado) com rotação de 90 dias, destino no Brasil e restauração testada. A Política já promete cópias por até 3 meses, apagadas automaticamente
- [ ] Corrigir o runbook `cidoa-back/dev/prod/server/006-escalabilidade-operacao.md`: `-mtime +14` → `+90`; cópia externa fora do Brasil (S3/B2/Drive) → manter no Brasil ou declarar na Política

### Aviso no site

- [ ] Faixa global na cidade para avisos (da publicação até a data de vigência). Precisa existir antes da primeira mudança relevante nos documentos e antes do fim do pré-lançamento (os dois com 15 dias de antecedência)
- [ ] Bloco "O que mudou" no topo das páginas `/termos` e `/privacidade`
- [ ] Ao publicar a versão `2026-10-18`: aviso de 15 dias no site para quem aceitou a `2026-10-16-beta` e para contas sem `terms_version` (antes da migration 0021)

### Conta e dados do usuário

- [ ] Prova do aceite some com a conta (CASCADE): guardar 5 anos após a exclusão (CDC art. 27) com `SET NULL` + hash do e-mail, e ajustar a retenção na Política
- [ ] Opcional: botão "Excluir conta" no Perfil (hoje só por e-mail, o admin executa em até 15 dias)
- [ ] Opcional: exportar os dados pela interface
- [ ] Holograma sem reencode (pode levar EXIF/GPS)
- [ ] Back: trocar o comentário "reaceite" da migration 0021 e a descrição Swagger de `POST /api/user/me/terms` (a beta não usa reaceite)

### Dados de teste

- [ ] `POST /admin/test-buildings`: trava de ambiente e marca de teste
- [ ] `DELETE` de teste não pode apagar contribuições reais
- [ ] ONGs fictícias do seed não podem somar em "Total arrecadado"
- [ ] main: campo de contribuição visível a qualquer visitante (a beta já restringe a admin)

### Confirmar (dono)

- [ ] Onde ficam guardadas as mensagens de `contato@cidoe.com.br` (MX → `inbound-smtp.sa-east-1.amazonaws.com`) e se chegam a alguém. Se ficarem fora do Brasil, declarar em "Transferência para fora do Brasil"
- [ ] Hospedagem realmente no Brasil (a Política afirma)
- [ ] Item que sai do catálogo continua aparecendo nos edifícios em que foi aplicado (os Termos prometem)
- [ ] Recompensas do pré-lançamento continuam valendo no lançamento (os Termos prometem)
- [ ] Prazo dos logs do proxy HTTPS do host
- [ ] Console do Google: e-mail de suporte; URLs `https://cidoe.com.br/`, `/privacidade` e `/termos` depois do deploy
- [ ] Validar com advogado: decretos citados (12.975/2026 e 12.976/2026) e o risco de o ECA Digital (Lei 15.211/2025) enquadrar o Cidoe como de "acesso provável" por menores (exigiria avaliação de risco)

### Rotina (o texto promete)

- [ ] Responder contato em até 5 dias úteis
- [ ] Responder pedido do titular e excluir conta em até 15 dias
- [ ] Analisar denúncia em até 30 dias; responder a quem denunciou pelo contato da denúncia
- [ ] Imagem íntima sem autorização: remover com prioridade máxima
- [ ] Abuso infantil: remover e comunicar às autoridades
- [ ] Remoção por ordem judicial: comunicar o motivo ao autor (Marco Civil art. 20)
- [ ] Responder contestação em até 30 dias
- [ ] Corrigir registro de contribuição em até 10 dias úteis
- [ ] Encaminhar à ONG pedido de devolução (e de menor que contribuiu)
- [ ] Guardar mensagens até 1 ano depois de fechar o assunto
- [ ] Incidente de segurança: comunicar ao titular e à ANPD
- [ ] Não prometer aviso por e-mail nos textos enquanto não existir rotina de envio (o único e-mail da app é o código de acesso)
