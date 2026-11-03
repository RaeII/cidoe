import { Link } from "react-router-dom";
import { IS_PRELAUNCH, LEGAL_CONTROLLER, LEGAL_EMAIL, TERMS_PATH } from "@/lib/legal";
import { docLink, LegalPage, type LegalSection } from "./LegalPage";

const email = <a href={`mailto:${LEGAL_EMAIL}`} className={docLink}>{LEGAL_EMAIL}</a>;
const terms = <Link to={TERMS_PATH} className={docLink}>Termos de Uso</Link>;
const external = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={docLink}>{label}</a>
);

// Duas edições (`LEGAL_EDITION` em src/lib/legal.ts): pré-lançamento (beta) e lançamento (main).

/** Tabela simples do documento: cabeçalho + linhas de texto. Larga demais rola dentro da própria caixa. */
function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto p-1">
      <table className={`w-full border-collapse text-left text-[15px] leading-snug ${head.length > 2 ? "min-w-[34rem]" : ""}`}>
        <thead>
          <tr className="border-b-2 border-border">
            {head.map((cell) => <th key={cell} scope="col" className="py-2 pr-4 align-bottom font-semibold">{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-border align-top">
              {row.map((cell, index) => <td key={index} className="py-2.5 pr-4">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const prelaunchSection: LegalSection = {
  id: "pre-lancamento",
  title: "Pré-lançamento",
  body: (
    <p>
      No pré-lançamento, as simulações (edifícios, valores, personalizações como cores, letreiro e holograma, e nomes,
      descrições e imagens que você escolher) ficam guardadas só no armazenamento local do seu navegador e não são
      enviadas aos nossos servidores. Sair da conta não as apaga: para removê-las, limpe os dados do site no navegador.
      Sua conta, seu perfil e suas indicações ficam nos nossos servidores, como descrito nesta política.
    </p>
  ),
};

const sections: LegalSection[] = [
  {
    id: "controlador",
    title: "Quem cuida dos seus dados",
    body: (
      <>
        <p>
          O controlador dos dados pessoais tratados no Cidoe (cidoe.com.br) é {LEGAL_CONTROLLER}, pessoa física, no
          Brasil. Para qualquer assunto de privacidade, inclusive exercer seus direitos, escreva para {email}.
        </p>
        <p>
          Como agente de tratamento de pequeno porte, não indicamos encarregado de dados (Resolução CD/ANPD nº 2/2022,
          art. 11); esse e-mail é o nosso canal de atendimento ao titular.
        </p>
        <p>
          Esta política vale para quem usa o Cidoe, com ou sem conta, e para quem nos escreve. ONGs terão documentos
          próprios quando o cadastro de ONGs abrir.
          Ela segue a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD) e o Marco Civil da Internet (Lei
          12.965/2014) e complementa os {terms}.
        </p>
      </>
    ),
  },
  {
    id: "dados",
    title: "Quais dados tratamos",
    body: (
      <>
        <Table
          head={["Dado", "De onde vem"]}
          rows={[
            ["E-mail", "Você informa, ou o Google envia no login com Google"],
            ["Nome e nome de usuário", "Você informa no cadastro (o Google sugere)"],
            ["Foto de perfil", "Você envia, ou usamos o endereço da foto da sua conta Google"],
            ["Identificador da conta Google", "Google, no login com Google"],
            ["Cidade e como conheceu o Cidoe", "Você informa, se quiser"],
            ...(IS_PRELAUNCH
              ? [["Simulações do pré-lançamento", "Ficam só no seu navegador; não recebemos"]]
              : [
                  ["Edifícios, contribuições, ONGs escolhidas, valores e personalizações", "Uso do Cidoe"],
                  ["Nome, descrição, imagem, letreiro e holograma do edifício", "Você informa, se quiser"],
                  ["Confirmação do Pix (valor, data e situação da cobrança)", "Woovi, ao gerar e confirmar o Pix"],
                ]),
            ["Quem indicou você e quem você indicou", "Uso do link ou código de indicação"],
            ["Recompensas liberadas (cadastro antecipado, indicações)", "Uso do Cidoe"],
            ["Aceite destes documentos: versão, data, IP e navegador", "Caixa de aceite"],
            ["Mensagens que você nos envia (dúvidas, denúncias, contestações, pedidos sobre seus dados, comprovantes)", "Você envia por e-mail"],
            ["IP, navegador (user-agent), data e hora de acesso", "Seu acesso ao site"],
            ["Datas de cadastro e de último acesso", "Uso do Cidoe"],
          ]}
        />
        <p>
          <strong>
            {IS_PRELAUNCH
              ? "Para ter conta, precisamos do seu e-mail, nome e nome de usuário. Sem esses dados não é possível usar a conta."
              : "Para ter conta, precisamos do seu e-mail, nome e nome de usuário; para contribuir, dos dados da contribuição. Sem esses dados não é possível usar a conta. Tudo o que você puser no seu edifício fica público."}
          </strong>{" "}
          Cidade e "como conheceu" são opcionais.
        </p>
        <p>
          Não pedimos CPF, endereço, telefone nem dados bancários. Não tratamos dados sensíveis (saúde, religião,
          biometria e outros).
        </p>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Para que usamos e com qual base legal",
    body: (
      <Table
        head={["Finalidade", "Base legal (LGPD, art. 7º)"]}
        rows={[
          ["Criar e manter sua conta, fazer login e enviar o código de acesso", "Execução de contrato (inciso V)"],
          ...(IS_PRELAUNCH
            ? [["Mostrar seu nome e foto no seu link de indicação", "Execução de contrato (inciso V)"]]
            : [
                ["Exibir na cidade o conteúdo do seu edifício e, no link de indicação, seu nome e foto", "Execução de contrato (inciso V)"],
                ["Gerar o Pix pela Woovi, confirmar o pagamento e registrar a contribuição", "Execução de contrato (inciso V)"],
                ["Encaminhar à ONG seu pedido de devolução de Pix", "Execução de contrato (inciso V)"],
              ]),
          ["Liberar recompensas e contar indicações", "Execução de contrato (inciso V)"],
          ["Entender de onde as pessoas são e como conhecem o Cidoe e, quando disponível, sugerir ONGs da sua região (campos opcionais)", "Legítimo interesse (inciso IX)"],
          ["Segurança e prevenção de fraude e abuso: limites de envio, bloqueio de e-mail temporário, registros técnicos de acesso", "Legítimo interesse (inciso IX)"],
          ["Não reenviar e-mail a quem recusou nossas mensagens (devolução ou marcação como spam)", "Legítimo interesse (inciso IX)"],
          ["Responder mensagens, analisar denúncias e contestações e atender pedidos sobre seus dados", "Execução de contrato (inciso V), exercício regular de direitos (inciso VI) e obrigação legal (inciso II)"],
          ["Guardar a prova do aceite destes documentos", "Exercício regular de direitos (inciso VI)"],
          ["Atender ordem judicial ou pedido de autoridade", "Cumprimento de obrigação legal (inciso II)"],
        ]}
      />
    ),
  },
  {
    id: "publico",
    title: "O que fica público",
    body: IS_PRELAUNCH ? (
      <p>
        No pré-lançamento, seus edifícios simulados ficam só no seu navegador: ninguém mais os vê. Quem abre seu link ou
        código de indicação vê seu nome e sua foto de perfil. Seu e-mail, seu nome de usuário, a cidade do seu perfil e
        "como conheceu" não são exibidos a outras pessoas.
      </p>
    ) : (
      <>
        <p>
          A cidade é pública. Qualquer visitante, mesmo sem conta, vê os edifícios com valor, a cidade escolhida para o
          edifício, a ONG e o nome, a descrição, a imagem, o letreiro e o holograma que você definir. Quem abre seu link
          ou código de indicação vê seu nome e sua foto de perfil.
        </p>
        <p>
          Seu e-mail, seu nome de usuário, a cidade do seu perfil e "como conheceu" não são exibidos a outras pessoas.
          Pense nisso antes de publicar algo pessoal no seu edifício.
        </p>
      </>
    ),
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    body: (
      <>
        <p>Não vendemos seus dados e não os usamos para publicidade. Eles passam só por:</p>
        <ul>
          <li>
            <strong>Google</strong>: o site carrega a ferramenta de login e as fontes a partir dos servidores do
            Google, que recebem seu IP e dados do navegador em cada acesso; a foto vinda da conta Google também é
            exibida a partir desses servidores. No login com Google, o Google atua como controlador próprio e nos
            envia os dados da conta descritos acima.
          </li>
          <li>
            <strong>Zoho CPaaS (ZeptoMail)</strong> (operador): envia o código de acesso; recebe seu e-mail e a mensagem com o código.
          </li>
          {!IS_PRELAUNCH && (
            <li>
              <strong>Woovi</strong> (plataforma brasileira de pagamentos): gera o Pix e nos confirma o pagamento.
              Recebe de nós o valor, a ONG e um código da cobrança, sem seu nome, e-mail ou CPF. Ao confirmar o
              pagamento, a Woovi pode nos enviar o nome e o CPF de quem pagou: não guardamos esses dados. Seus dados
              bancários ficam com o seu banco e a Woovi.
            </li>
          )}
          <li>
            <strong>Hospedagem</strong> (operador): servidor contratado no Brasil, onde ficam o site e o banco de dados.
          </li>
          <li>
            <strong>Discord</strong>: recebe alertas técnicos de erro para a equipe; não enviamos e-mail, nome, IP nem
            outros dados de cadastro.
          </li>
          <li>
            <strong>ONGs</strong>:{" "}
            {IS_PRELAUNCH
              ? "não recebem seus dados pessoais."
              : "recebem o Pix direto na conta delas. Como em qualquer Pix, o banco mostra a quem recebe o nome e parte do CPF de quem pagou. O Cidoe não envia às ONGs os dados da sua conta, exceto quando você pede a devolução de um Pix: aí enviamos à ONG só o necessário para achar o pagamento (valor, data e comprovante)."}
          </li>
          <li>
            <strong>Redes sociais</strong>: só quando você clica em compartilhar, seu link de indicação vai para a rede
            escolhida.
          </li>
          <li>
            <strong>Autoridades</strong>: quando a lei ou uma ordem judicial exigir.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "transferencia",
    title: "Transferência para fora do Brasil",
    body: (
      <p>
        Nossa hospedagem{IS_PRELAUNCH ? " fica" : " e a Woovi ficam"} no Brasil. A Zoho utiliza data centers fora do Brasil: enviamos a
        ela seu e-mail só para entregar o código de acesso que você pediu (LGPD, art. 33, inciso IX). Os dados que o
        Google recebe são coletados por ele diretamente do seu navegador e seguem a{" "}
        {external("https://policies.google.com/privacy?hl=pt-BR", "política de privacidade do Google")}, que também
        processa dados fora do Brasil.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies e armazenamento no navegador",
    body: (
      <>
        <p>
          Usamos só o necessário para o site funcionar. <strong>Não usamos cookies de publicidade nem de medição de
          audiência</strong>, por isso não pedimos consentimento para cookies.
        </p>
        <Table
          head={["Nome", "Tipo", "Para quê", "Duração"]}
          rows={[
            ["token_access", "Cookie próprio, essencial", "Manter você conectado", "7 dias, ou até você sair"],
            ["token_admin", "Cookie próprio, essencial", "Sessão do painel administrativo (só equipe)", "30 dias, ou até sair"],
            ["sidebar_state", "Cookie próprio, preferência", "Lembrar o menu lateral do painel (só equipe)", "7 dias"],
            ["g_state", "Cookie gravado no nosso domínio pela ferramenta de login do Google", "Guardar o estado do login com Google", "Definida pelo Google"],
            ["Cookies em accounts.google.com", "Terceiro (Google)", "Login com Google", "Definida pelo Google"],
            ["theme e cidoe:ui-visibility", "Armazenamento local", "Lembrar tema e o que aparece na tela", "Até você limpar o navegador"],
            ["cidoe:intro-video-seen", "Armazenamento local", "Não repetir o vídeo de apresentação", "Até você limpar o navegador"],
            ...(IS_PRELAUNCH
              ? [["cidoe:prelaunch:…", "Armazenamento local", "Guardar as simulações e ajustes da cidade do pré-lançamento", "Até você limpar o navegador"]]
              : []),
            ["chunk-reload-at", "Armazenamento da aba", "Evitar recarga repetida depois de uma atualização do site", "Até fechar a aba"],
            ["Imagem do céu da cidade", "Cache do navegador", "Carregar a cena mais rápido", "Até você limpar o navegador"],
          ]}
        />
        <p>
          Você pode apagar ou bloquear cookies e dados do site nas configurações do navegador. Sem o cookie de sessão,
          não é possível entrar na conta.
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "Dados da sua conta Google",
    body: (
      <>
        <p>
          No login com Google, pedimos só as permissões básicas de perfil. Dos dados que o Google envia, usamos apenas
          o identificador da conta, o e-mail (e se ele foi verificado), o nome e a foto. Não acessamos Gmail, Drive,
          contatos ou outros serviços.
        </p>
        <p>
          Usamos esses dados só para criar sua conta, fazer login e mostrar seu perfil. O nome e a foto podem aparecer
          no seu link de indicação. Eles ficam guardados enquanto a conta existir e são apagados com ela. Não vendemos
          esses dados, não os usamos para publicidade e só os compartilhamos como descrito nesta política. Se um dia
          quisermos usá-los de outro jeito, avisaremos e pediremos seu aceite antes.
        </p>
        <p>
          O uso e a transferência de informações recebidas das APIs do Google seguem a{" "}
          {external(
            "https://developers.google.com/terms/api-services-user-data-policy?hl=pt-br",
            "Política de Dados do Usuário dos Serviços de API do Google",
          )}
          , incluindo os requisitos de Uso Limitado. Você pode remover o acesso do Cidoe em{" "}
          {external("https://myaccount.google.com/connections", "myaccount.google.com/connections")}. Remover esse
          acesso não apaga sua conta no Cidoe; para isso, escreva para {email}.
        </p>
      </>
    ),
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    body: (
      <ul>
        <li>
          Conta, perfil, recompensas, {IS_PRELAUNCH ? "" : "edifícios, contribuições, personalizações, "}indicações e
          histórico de aceites: enquanto a conta existir. Excluída a conta, apagamos esses dados; as cópias de
          segurança podem mantê-los por até 3 meses, até serem apagadas.
        </li>
        <li>Códigos de acesso por e-mail, com IP e navegador: até 25 horas.</li>
        <li>
          Mensagens enviadas a {email}: enquanto o assunto estiver aberto e por até 1 ano depois, para provar o
          atendimento.
        </li>
        <li>
          Registros técnicos (logs com IP, navegador, data e hora): apagados automaticamente em rotação, em até 14
          dias (30 dias para registros de erro); os do servidor web são sobrescritos conforme o volume de acessos.
        </li>
        <li>
          Lista de endereços que não aceitam nossos e-mails (devolução ou marcação como spam): mantida mesmo depois da
          exclusão da conta, só para não enviarmos de novo a quem recusou.
        </li>
        <li>Cópias de segurança: guardadas por até 3 meses; as mais antigas são apagadas automaticamente.</li>
        {IS_PRELAUNCH && <li>Simulações do pré-lançamento: no seu navegador, até você limpar os dados do site.</li>}
        <li>Se a lei ou uma ordem judicial exigir guarda maior, guardamos pelo prazo exigido.</li>
      </ul>
    ),
  },
  {
    id: "direitos",
    title: "Seus direitos",
    body: (
      <>
        <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;</li>
          <li>portabilidade dos dados;</li>
          <li>eliminação da conta e dos dados;</li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>oposição a tratamento baseado em legítimo interesse;</li>
          <li>revisão de decisões automatizadas, como o bloqueio automático de e-mail temporário.</li>
        </ul>
        <p>
          Nome, nome de usuário, foto, cidade e "como conheceu" você mesmo corrige no menu Perfil. Para o resto, escreva
          para {email} a partir do e-mail da sua conta; respondemos em até 15 dias.{" "}
          {IS_PRELAUNCH
            ? "Excluir a conta não apaga as simulações do seu navegador: para isso, limpe os dados do site."
            : "Excluir a conta apaga seus edifícios da cidade."}
        </p>
        <p>
          Se não ficar satisfeito, você pode reclamar à ANPD em {external("https://www.gov.br/anpd", "gov.br/anpd")} ou
          a um órgão de defesa do consumidor, como o Procon.
        </p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança",
    body: (
      <>
        <p>
          Usamos conexão segura (HTTPS), sessão em cookie que o JavaScript do site não lê, códigos de acesso que
          expiram em minutos e nunca ficam guardados em texto, limite de tentativas e de envios, e acesso restrito ao
          banco de dados. Nenhum sistema é 100% seguro.
        </p>
        <p>
          Registros de acesso são mantidos em sigilo e só são entregues a terceiros com ordem judicial (Marco Civil da
          Internet, art. 10). Se houver incidente de segurança que possa causar risco ou dano relevante a você,
          avisaremos você e a ANPD nos prazos da lei.
        </p>
      </>
    ),
  },
  {
    id: "menores",
    title: "Menores de idade",
    body: (
      <p>
        Contas são só para maiores de 18 anos. A cidade pode ser vista sem conta, mas não coletamos de propósito dados
        de crianças e adolescentes. Se houver indício de que uma conta é de menor, ela é bloqueada e excluída.
        Responsáveis podem avisar por {email}.
      </p>
    ),
  },
  ...(IS_PRELAUNCH ? [prelaunchSection] : []),
  {
    id: "alteracoes",
    title: "Mudanças nesta política",
    body: (
      <p>
        Quando esta política mudar de forma relevante, a data da versão no topo muda e você verá a nova versão ao
        entrar e confirmará que leu antes de continuar. Não usaremos seus dados para uma finalidade nova sem avisar
        antes.{IS_PRELAUNCH && " No lançamento, esta política muda para incluir os pagamentos reais."}
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Política de Privacidade"
      intro={<p>Quais dados o Cidoe usa, para quê, com quem compartilha e como você controla tudo isso.</p>}
      sections={sections}
    />
  );
}
