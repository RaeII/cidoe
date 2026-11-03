import { Link } from "react-router-dom";
import { IS_PRELAUNCH, LEGAL_CONTROLLER, LEGAL_EMAIL, PRIVACY_PATH } from "@/lib/legal";
import { docLink, LegalPage, type LegalSection } from "./LegalPage";

const email = <a href={`mailto:${LEGAL_EMAIL}`} className={docLink}>{LEGAL_EMAIL}</a>;
const privacy = <Link to={PRIVACY_PATH} className={docLink}>Política de Privacidade</Link>;
const see = (id: string, label: string) => <a href={`#${id}`} className={docLink}>{label}</a>;

// Duas edições (`LEGAL_EDITION` em src/lib/legal.ts): pré-lançamento (beta) e lançamento (main).
// Texto comum fica uma vez só; `IS_PRELAUNCH ? … : …` só onde as edições diferem.

const prelaunchSection: LegalSection = {
  id: "pre-lancamento",
  title: "Pré-lançamento: tudo é teste",
  body: (
    <>
      <p>
        Enquanto o Cidoe estiver em <strong>pré-lançamento</strong>, edifícios, contribuições, valores, totais, ONGs
        exibidas e as personalizações aplicadas a edifícios simulados são <strong>dados de teste ou simulação</strong>.{" "}
        <strong>Nada do que aparece nesse modo deve ser considerado</strong>: não há cobrança, pagamento, dinheiro
        real, repasse a ONG, crédito, prêmio nem direito a edifício futuro.
      </p>
      <ul>
        <li>Nomes de ONGs e edifícios de exemplo podem ser fictícios e não indicam parceria com nenhuma organização.</li>
        <li>
          Simulações ficam salvas só no navegador em que foram feitas, não aparecem para outras pessoas, não passam para
          a versão de lançamento e podem ser apagadas a qualquer momento, inclusive no lançamento ou se você limpar os
          dados do navegador.
        </li>
        <li>Se, por engano, algum valor real for pago nesse período, devolvemos o valor integral.</li>
      </ul>
      <p>
        Sua conta, seu perfil, suas indicações e as recompensas liberadas na sua conta (inclusive as de cadastro
        antecipado) são reais, seguem a {privacy} e continuam valendo no lançamento, conforme as regras mostradas na
        tela e a seção {see("recompensas", "Personalizações, recompensas e indicações")}.
      </p>
    </>
  ),
};

const sections: LegalSection[] = [
  {
    id: "resumo",
    title: "Resumo do que mais importa",
    body: (
      <ul>
        {IS_PRELAUNCH ? (
          <li>
            <strong>O Cidoe está em pré-lançamento:</strong> edifícios, contribuições e valores exibidos são dados de
            teste. Nada disso deve ser considerado (ver {see("pre-lancamento", "Pré-lançamento")}).
          </li>
        ) : (
          <li>
            <strong>Sua contribuição vai por Pix direto para a ONG</strong>, pela Woovi. O Cidoe não recebe nem guarda o
            dinheiro (ver {see("contribuicoes", "Contribuições")}).
          </li>
        )}
        <li>
          <strong>O que a cidade mostra pode atrasar ou ter erros.</strong> A tela não é comprovante (ver{" "}
          {see("exibicao", "O que a cidade mostra")}).
        </li>
        <li>
          <strong>Edifícios e dados podem ser removidos sem aviso prévio</strong> nos casos destes termos; depois
          avisamos no seu perfil e você pode contestar (ver {see("remocao", "Remoção")}).
        </li>
        <li>É preciso ter 18 anos ou mais para ter conta.</li>
        {IS_PRELAUNCH ? (
          <li>No pré-lançamento, seus edifícios simulados ficam só no seu navegador e ninguém mais os vê.</li>
        ) : (
          <li>
            Tudo o que está no seu edifício fica público: valor, cidade, ONG, nome, descrição, imagem, letreiro e
            holograma.
          </li>
        )}
        <li>
          Usamos cookies essenciais e ferramentas do Google e salvamos alguns dados no seu navegador (ver {privacy}).
        </li>
      </ul>
    ),
  },
  // Pré-lançamento logo depois do resumo: é o aviso que mais precisa de destaque na beta.
  ...(IS_PRELAUNCH ? [prelaunchSection] : []),
  {
    id: "aceite",
    title: "Quem somos e como estes termos valem",
    body: (
      <>
        <p>O Cidoe (cidoe.com.br) é mantido por {LEGAL_CONTROLLER}, pessoa física, no Brasil. Contato: {email}.</p>
        <p>
          Estes Termos de Uso são o contrato entre você e o Cidoe. Ao criar uma conta, ou ao entrar depois de uma
          atualização, você marca a caixa de aceite e concorda com eles; a {privacy} explica como tratamos seus dados.
          Quem só visita a cidade sem conta também deve respeitar as {see("conteudo", "regras de uso")}.
        </p>
        <p>Estes termos valem para usuários. ONGs terão termos próprios quando o cadastro de ONGs abrir.</p>
        <p>Se você não concorda, não crie conta.</p>
      </>
    ),
  },
  {
    id: "servico",
    title: "O que é o Cidoe",
    body: (
      <>
        <p>
          O Cidoe é uma cidade 3D em que cada contribuição para uma ONG de proteção animal ergue ou aumenta um
          edifício.
        </p>
        <p>
          O edifício é uma <strong>representação visual e simbólica</strong> da contribuição. Ele não é imóvel, bem,
          produto, investimento, título ou crédito, não tem valor de troca e não pode ser vendido, transferido ou
          resgatado em dinheiro. Altura e posição são relativas: comparam o edifício com os outros, mudam quando entram
          novas contribuições ou quando você usa filtros, não são proporcionais ao valor e não indicam classificação.
        </p>
        <p>O Cidoe não é uma ONG, não executa os projetos das ONGs e não é banco nem instituição de pagamento.</p>
      </>
    ),
  },
  {
    id: "conta",
    title: "Conta",
    body: (
      <ul>
        <li>
          Para ter conta, você precisa ter <strong>18 anos ou mais</strong>. Contas de menores de idade são excluídas
          quando identificadas.
        </li>
        <li>Você entra com o Google ou com um código enviado ao seu e-mail. Não usamos senha.</li>
        <li>Informe dados verdadeiros. A conta é pessoal: não use a conta de outra pessoa nem finja ser alguém.</li>
        <li>
          Você responde pelo uso da sua conta, salvo quando o problema vier de falha nossa. Se perceber uso indevido,
          escreva para {email}.
        </li>
        <li>Você pode pedir a exclusão da conta a qualquer momento pelo mesmo e-mail.</li>
      </ul>
    ),
  },
  {
    id: "contribuicoes",
    title: "Contribuições e pagamentos",
    body: IS_PRELAUNCH ? (
      <>
        <p>
          <strong>No pré-lançamento, o Cidoe não processa pagamentos reais</strong>: toda contribuição é simulada (ver{" "}
          {see("pre-lancamento", "Pré-lançamento")}).
        </p>
        <p>
          Quando os pagamentos forem ativados, o Pix será gerado pela Woovi, plataforma brasileira de pagamentos, e o
          valor irá direto para a conta da ONG escolhida. Antes disso, atualizaremos estes termos e você só continuará
          se aceitar a nova versão.
        </p>
      </>
    ) : (
      <>
        <p>
          Contribuição é um valor em dinheiro que você destina, por vontade própria, a uma ONG listada no Cidoe, sem
          contrapartida financeira: é uma doação à ONG escolhida (Código Civil, art. 538). O edifício e as
          personalizações são reconhecimento simbólico e não mudam isso.
        </p>
        <p>
          <strong>
            O Pix é gerado pela Woovi, plataforma brasileira de pagamentos, e o valor vai direto para a conta da ONG
            escolhida. O Cidoe não recebe, não guarda e não repassa o dinheiro.
          </strong>{" "}
          Antes de pagar, a tela mostra o valor e a ONG que vai receber.
        </p>
        <ul>
          <li>
            Cada contribuição ergue um edifício novo ou aumenta um que você já tem. Cada conta pode ter até 3
            edifícios; o edifício aumentado continua na mesma cidade.
          </li>
          <li>
            O código Pix vale por tempo limitado. Gerar um novo código invalida o anterior: não pague códigos antigos.
            Se pagar um por engano, envie o comprovante para {email}: registramos a contribuição ou pedimos a devolução
            à ONG.
          </li>
          <li>
            Como o valor vai direto para a ONG, só ela pode devolver um Pix. Para pedir devolução, escreva para {email}:
            encaminhamos o pedido à ONG e acompanhamos até a resposta.
          </li>
          <li>
            Se o valor for devolvido, estornado ou recuperado (inclusive pelo Mecanismo Especial de Devolução do Pix),
            o edifício é reduzido ou removido.
          </li>
          <li>
            O comprovante emitido pelo seu banco é a prova do pagamento. Recibo de doação, quando houver, é emitido pela
            ONG. O Cidoe não dá orientação tributária: eventuais tributos sobre doações seguem a lei do seu estado.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "exibicao",
    title: "O que a cidade mostra pode atrasar ou ter erros",
    body: (
      <>
        <p>
          <strong>Os dados exibidos na tela podem ter atraso e podem conter erros.</strong> A cidade é montada a partir
          de uma cópia dos dados atualizada de tempos em tempos e depende da sua conexão, do seu navegador e do seu
          aparelho. Por isso:
        </p>
        <ul>
          <li>um edifício novo, alterado ou removido pode levar alguns minutos para mudar para outras pessoas e só aparece depois de recarregar a página;</li>
          <li>em falhas técnicas, a cidade pode continuar mostrando dados antigos, sem aviso;</li>
          <li>filtros, o limite de edifícios na tela e a distância da câmera escondem edifícios e detalhes (letreiro, holograma, topo, luzes), o que não significa que a contribuição foi removida;</li>
          <li>o valor de um edifício é a soma de todas as contribuições feitas a ele, para uma ou mais ONGs; totais por ONG, cidade ou região são aproximações visuais;</li>
          <li>valores podem aparecer arredondados ou formatados de jeitos diferentes em telas diferentes;</li>
          <li>nomes, descrições, imagens e personalizações podem demorar ou não carregar, e uma alteração só vale depois que o servidor confirma o salvamento;</li>
          <li>a cidade pode conter edifícios e valores de teste ou de demonstração, que não representam contribuições reais;</li>
          <li>ferramentas de visualização da cena não registram contribuições, e capturas de tela não comprovam contribuição.</li>
        </ul>
        <p>
          <strong>
            O Cidoe não se responsabiliza por diferenças que existam só na tela, como um edifício que não aparece ou um
            valor exibido que não bate com as contribuições.
          </strong>{" "}
          A tela não é comprovante, extrato nem prestação de contas.{" "}
          {IS_PRELAUNCH ? (
            <>No pré-lançamento, nada do que a cidade mostra vale como contribuição.</>
          ) : (
            <>
              Valem o comprovante do Pix e o registro da contribuição no nosso sistema. Se notar diferença entre o que
              pagou e o que vê, recarregue a página; se continuar, envie o comprovante para {email}. Verificamos e, se
              houver erro no registro, corrigimos em até 10 dias úteis. Este aviso trata só da exibição: não afasta nossa
              responsabilidade pelo registro correto da sua contribuição nem os seus direitos de consumidor.
            </>
          )}
        </p>
      </>
    ),
  },
  {
    id: "remocao",
    title: "Remoção de edifícios, conteúdos e contas",
    body: (
      <>
        <p>
          <strong>
            Edifícios, personalizações, nomes, descrições, imagens e demais dados de qualquer usuário podem ser
            removidos, ocultados ou alterados sem aviso prévio
          </strong>{" "}
          (por exemplo, personalização voltando ao padrão ou valor reduzido após devolução) quando:
        </p>
        <ul>
          <li>houver conteúdo ilegal ou que viole estes termos;</li>
          <li>houver ordem judicial ou de autoridade;</li>
          <li>houver suspeita fundada de fraude ou risco à segurança do Cidoe ou de pessoas;</li>
          <li>o pagamento não for confirmado ou o valor for devolvido, estornado ou recuperado;</li>
          <li>o dado for de teste, de simulação ou de demonstração;</li>
          <li>a conta for excluída, a seu pedido ou por violação destes termos: os edifícios dela deixam de aparecer na cidade.</li>
        </ul>
        <p>
          Depois da remoção, avisamos no seu perfil no Cidoe, com o motivo e como contestar. Não avisamos quando a lei ou
          uma ordem proibir, quando o aviso atrapalhar uma investigação, quando o dado removido for de teste ou de
          simulação, ou quando a remoção for a seu pedido. Se a conta for suspensa ou excluída, você não conseguirá ver
          o aviso no perfil: peça o motivo e conteste por {email}.
        </p>
        <p>
          Você pode contestar em até 30 dias por {email}; respondemos em até 30 dias e, se houve engano, restauramos o
          que for possível.
        </p>
        <p>
          Em manutenção ou reorganização, podemos mudar a posição e a ordem dos edifícios e ocultá-los temporariamente,
          sem apagar edifício de contribuição confirmada. Uma ONG pode deixar de ser listada; contribuições anteriores a
          ela podem continuar visíveis sem o nome da ONG. Nos mesmos casos da lista acima, podemos suspender a conta em vez
          de excluí-la; durante a suspensão, os edifícios dela podem continuar exibidos ou ficar ocultos.
        </p>
        <p>Remover um edifício da tela não desfaz uma contribuição já feita.</p>
      </>
    ),
  },
  {
    id: "conteudo",
    title: "Seu conteúdo e regras de uso",
    body: (
      <>
        {IS_PRELAUNCH ? (
          <p>
            No pré-lançamento, o que você define no edifício simulado (nome, descrição, imagem, letreiro, holograma)
            fica só no seu navegador e não é publicado. Seu nome e sua foto de perfil aparecem para quem abrir seu link
            ou código de indicação.
          </p>
        ) : (
          <p>
            No seu edifício, você pode definir nome, descrição, imagem, letreiro e imagem de holograma.{" "}
            <strong>Esse conteúdo fica público</strong> para qualquer visitante, mesmo sem conta, junto com o valor, a
            cidade e a ONG do edifício. Se você puser seu nome no edifício, quem vê a cidade pode ligar o valor a você.
            Seu nome e sua foto de perfil aparecem para quem abrir seu link ou código de indicação. Não há revisão
            prévia: você responde pelo que publica.
          </p>
        )}
        <p>
          Você garante que tem direito sobre o que envia e nos autoriza, sem custo, a exibir, redimensionar e adaptar
          esse conteúdo dentro do Cidoe enquanto ele estiver publicado. Você continua dono do seu conteúdo.
        </p>
        <p>É proibido:</p>
        <ul>
          <li>conteúdo ilegal, ofensivo, discriminatório, violento, sexual ou que exponha crianças e adolescentes;</li>
          <li>usar nome, imagem ou dados de outra pessoa sem autorização, ou fingir ser alguém;</li>
          <li>publicidade, spam, links maliciosos ou conteúdo que viole direitos autorais e marcas;</li>
          <li>fraudar contribuições, indicações ou recompensas, criar contas falsas ou automatizar acessos;</li>
          <li>tentar invadir, sobrecarregar ou burlar a segurança do Cidoe.</li>
        </ul>
      </>
    ),
  },
  {
    id: "denuncias",
    title: "Denúncias e contestação",
    body: (
      <>
        <p>
          Qualquer pessoa, com ou sem conta, pode denunciar conteúdo ilegal ou que viole estes termos por {email},
          informando o edifício ou perfil, o motivo e um contato. Confirmamos o recebimento e analisamos em até 30 dias.
        </p>
        <ul>
          <li>Imagem íntima divulgada sem autorização é removida com prioridade máxima, assim que recebemos o pedido da vítima.</li>
          <li>Conteúdo de abuso ou exploração de crianças e adolescentes é removido e comunicado às autoridades.</li>
          <li>
            Se removermos seu conteúdo, avisamos no seu perfil o motivo e como contestar (ver{" "}
            {see("remocao", "Remoção")}). Se não removermos o que foi denunciado, respondemos a quem denunciou, pelo contato informado na denúncia, com
            o motivo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "recompensas",
    title: "Personalizações, recompensas e indicações",
    body: (
      <>
        <p>
          Personalizações (formatos, cores, texturas, letreiros), recompensas, benefícios de cadastro antecipado e
          indicações seguem as regras mostradas na tela. Eles não têm valor em dinheiro e não podem ser vendidos nem
          transferidos.
        </p>
        <p>
          As regras e o catálogo podem mudar. Não retiramos item já liberado sem motivo, mas ele pode deixar de existir
          se sair do catálogo, por erro de liberação ou por fraude; nesse caso, o edifício volta à opção padrão.
        </p>
        <p>
          Indicação só vale para pessoas reais, com conta própria, no prazo mostrado na tela. Indicações falsas ou
          automatizadas são canceladas, e a contagem muda se uma das contas for excluída.
        </p>
      </>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    body: (
      <p>
        Marca, nome, visual, código, modelos 3D e demais elementos do Cidoe pertencem ao Cidoe ou a quem os licenciou.
        Usar o site não transfere nenhum desses direitos a você.
      </p>
    ),
  },
  {
    id: "disponibilidade",
    title: "Disponibilidade e mudanças no serviço",
    body: (
      <p>
        O Cidoe pode ficar fora do ar, lento ou com falhas, inclusive por manutenção ou por serviços de terceiros
        (hospedagem, Google, envio de e-mail{IS_PRELAUNCH ? "" : ", Woovi"}). Podemos mudar ou suspender
        funcionalidades. Se o Cidoe for encerrado, avisaremos no site com pelo menos 30 dias de antecedência. A cidade
        3D exige um navegador e um aparelho compatíveis.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    title: "Limites de responsabilidade",
    body: (
      <>
        <p>
          <strong>
            Respondemos pelos danos causados por falhas do Cidoe, nos termos do Código de Defesa do Consumidor. Não
            respondemos quando o dano for causado exclusivamente por você ou por terceiros
          </strong>
          , por exemplo: falha do seu aparelho, navegador ou conexão; serviços fora do nosso controle (seu banco, o
          Google, provedores de internet{IS_PRELAUNCH ? "" : ", a Woovi"}); perda de dados salvos só no seu navegador;
          conteúdo publicado por outros usuários, que analisamos e removemos após denúncia; e o uso que cada ONG faz das
          contribuições que recebe.
        </p>
        <p>Nada nestes termos exclui direitos que o Código de Defesa do Consumidor e outras leis garantem a você.</p>
      </>
    ),
  },
  {
    id: "alteracoes",
    title: "Mudanças nestes termos",
    body: (
      <p>
        Podemos atualizar estes termos para refletir mudanças no serviço ou na lei. A data da versão fica no topo da
        página. Quando a mudança for relevante, você verá a nova versão ao entrar e só continuará usando a conta se
        aceitá-la; se não aceitar, pode encerrar a conta sem custo e pedir seus dados. Mudanças não alteram
        contribuições já feitas. Correções de digitação, sem efeito sobre direitos, valem na publicação.
        {IS_PRELAUNCH && " No lançamento, estes termos mudam para incluir os pagamentos reais, e você verá a nova versão."}
      </p>
    ),
  },
  {
    id: "lei",
    title: "Lei aplicável, foro e contato",
    body: (
      <p>
        Estes termos seguem as leis do Brasil. Se alguma regra deles for considerada inválida, as demais continuam
        valendo. Conflitos podem ser levados ao foro do seu domicílio. Antes disso, fale com a gente por {email}: a
        maioria dos problemas se resolve por lá. Você também pode procurar o Procon ou o{" "}
        <a href="https://www.consumidor.gov.br" target="_blank" rel="noopener noreferrer" className={docLink}>consumidor.gov.br</a>.
      </p>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Termos de Uso"
      intro={
        <p>
          Regras para usar o Cidoe{IS_PRELAUNCH ? " durante o pré-lançamento" : ""}. Os trechos em negrito são os mais
          importantes, inclusive os que limitam direitos: leia com atenção.
        </p>
      }
      sections={sections}
    />
  );
}
