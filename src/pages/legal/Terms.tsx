import { Link } from "react-router-dom";
import { IS_PRELAUNCH, LEGAL_CONTROLLER, LEGAL_EMAIL, PRIVACY_PATH } from "@/lib/legal";
import { docLink, LegalPage, type LegalSection } from "./LegalPage";

const email = <a href={`mailto:${LEGAL_EMAIL}`} className={docLink}>{LEGAL_EMAIL}</a>;
const privacy = <Link to={PRIVACY_PATH} className={docLink}>Política de Privacidade</Link>;
const see = (id: string, label: string) => <a href={`#${id}`} className={docLink}>{label}</a>;

// Texto definitivo, já com pagamentos reais. `IS_PRELAUNCH` só acrescenta os avisos da fase de pré-lançamento:
// quem aceita agora não aceita outra versão no lançamento.

const prelaunchSection: LegalSection = {
  id: "pre-lancamento",
  title: "Pré-lançamento: tudo é teste",
  body: (
    <>
      <p>
        Enquanto o Cidoe estiver em <strong>pré-lançamento</strong>, edifícios, contribuições, valores, totais por ONG e
        as personalizações aplicadas a edifícios simulados são <strong>dados de teste ou simulação</strong>.{" "}
        <strong>Nada do que aparece nesse modo deve ser considerado</strong>: não há cobrança, pagamento, dinheiro
        real, repasse a ONG, crédito, prêmio nem direito a edifício futuro.
      </p>
      <ul>
        <li>
          Nomes de ONGs e edifícios de exemplo podem ser fictícios e não indicam parceria com nenhuma organização.
          Valores mostrados para uma ONG nessa fase não são doações recebidas por ela.
        </li>
        <li>
          Simulações ficam salvas só no navegador em que foram feitas, não aparecem para outras pessoas, não passam para
          a cidade depois que os pagamentos forem ativados e podem ser apagadas a qualquer momento, inclusive nessa
          ativação ou se você limpar os
          dados do navegador.
        </li>
        <li>
          O Cidoe não gera código Pix no pré-lançamento. Se alguém mandar um código em nome do Cidoe, não pague. Se você
          pagou mesmo assim, escreva para {email}: pedimos a devolução integral a quem recebeu e acompanhamos até a
          resposta.
        </li>
      </ul>
      <p>
        Sua conta, seu perfil, suas indicações e as recompensas liberadas na sua conta (inclusive as de cadastro
        antecipado) são reais, seguem a {privacy} e continuam valendo no lançamento, conforme as regras mostradas na
        tela e a seção {see("recompensas", "Personalizações, recompensas e indicações")}.
      </p>
      <p>
        O pré-lançamento termina quando os pagamentos forem ativados. Avisamos no site pelo menos 15 dias antes. A
        partir daí valem as regras de {see("contribuicoes", "Contribuições e pagamentos")}, que já fazem parte destes
        termos.
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
        {IS_PRELAUNCH && (
          <li>
            <strong>O Cidoe está em pré-lançamento:</strong> os pagamentos ainda não estão ativos, e edifícios,
            contribuições e valores exibidos são dados de teste. Nada disso deve ser considerado (ver{" "}
            {see("pre-lancamento", "Pré-lançamento")}).
          </li>
        )}
        <li>
          <strong>Sua contribuição vai por Pix direto para a ONG</strong>, pela Woovi. O Cidoe não recebe nem guarda o
          dinheiro (ver {see("contribuicoes", "Contribuições")}).
        </li>
        <li>
          <strong>O que a cidade mostra pode atrasar ou ter erros.</strong> A tela não é comprovante (ver{" "}
          {see("exibicao", "O que a cidade mostra")}).
        </li>
        <li>
          <strong>Edifícios e dados podem ser removidos sem aviso prévio</strong> nos casos destes termos; você pode
          pedir o motivo e contestar (ver {see("remocao", "Remoção")}).
        </li>
        <li>É preciso ter 18 anos ou mais para ter conta.</li>
        <li>
          Tudo o que está no seu edifício fica público: valor, cidade, ONG, nome, descrição, imagem, letreiro e
          holograma.
        </li>
        <li>
          Usamos cookies essenciais e o login do Google; o Google Analytics, só com o seu aceite. Também salvamos alguns
          dados no seu navegador (ver {privacy}).
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
          Estes Termos de Uso são o contrato entre você e o Cidoe. Ao criar uma conta, você marca a caixa de aceite,
          declara ter 18 anos ou mais e concorda com eles; a {privacy} explica como tratamos seus dados.
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
          novas contribuições ou quando você usa filtros, não são proporcionais ao valor. A ordem na cidade segue os
          valores do momento: não é ranking oficial nem dá direito a nada.
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
          Para ter conta e contribuir, você precisa ter <strong>18 anos ou mais</strong>, e declara isso ao criar a
          conta. Quem tem menos de 18 anos pode ver a cidade sem conta; para apoiar uma ONG, a contribuição deve ser
          feita pelo responsável, na conta dele. Contas de menores são excluídas quando identificadas. Se um menor
          contribuiu, o responsável pode escrever para {email}: encaminhamos o pedido de devolução à ONG, que é quem
          recebe o Pix.
        </li>
        <li>Você entra com o Google ou com um código enviado ao seu e-mail. Não usamos senha.</li>
        <li>Informe dados verdadeiros. A conta é pessoal: não use a conta de outra pessoa nem finja ser alguém.</li>
        <li>
          Você responde pelo uso da sua conta, salvo quando o problema vier de falha nossa. Se perceber uso indevido,
          escreva para {email}.
        </li>
        <li>
          <strong>O Cidoe nunca pede seu código de acesso, um Pix ou dados bancários por mensagem, telefone ou rede
          social.</strong> Código Pix de contribuição só é gerado em cidoe.com.br, na tela de contribuição. Antes de
          confirmar no app do banco, confira se quem recebe é a ONG mostrada na tela. Se alguém pedir algo em nome do
          Cidoe, não pague e avise em {email}.
        </li>
        <li>
          Você pode pedir a exclusão da conta a qualquer momento por {email}. Excluímos em até 15 dias do pedido
          (se precisarmos confirmar sua identidade, contados da confirmação): seus edifícios saem da cidade, e personalizações e recompensas se perdem.
          Contribuições já pagas não são desfeitas, porque o dinheiro já está com a ONG.
        </li>
      </ul>
    ),
  },
  {
    id: "contribuicoes",
    title: "Contribuições e pagamentos",
    body: (
      <>
        {IS_PRELAUNCH && (
          <p>
            <strong>No pré-lançamento, o Cidoe ainda não processa pagamentos</strong>: toda contribuição é simulada (ver{" "}
            {see("pre-lancamento", "Pré-lançamento")}). As regras abaixo valem quando os pagamentos forem ativados.
          </p>
        )}
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
        <p>
          A contribuição vai para a ONG como um todo, não para um animal, projeto ou campanha específicos. A ONG decide
          como usar o dinheiro e responde por isso. Estar listada no Cidoe não garante como a ONG trabalha.
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
            o edifício é reduzido ou removido. O Mecanismo Especial de Devolução, pedido ao seu banco, vale só para
            golpe ou falha operacional, e o banco pode recusar; nos outros casos (valor errado, ONG errada,
            arrependimento), peça a devolução por {email}, como descrito acima.
          </li>
          <li>
            O comprovante emitido pelo seu banco é a prova do pagamento. Recibo de doação, quando houver, é emitido pela
            ONG. O Cidoe não garante que a contribuição dê direito a dedução no Imposto de Renda e não dá orientação
            tributária: como doação, ela pode estar sujeita ao ITCMD, imposto estadual com regras e isenções que variam
            por estado.
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
          Valem o comprovante do Pix e o registro da contribuição no nosso sistema. Se notar diferença entre o que
          pagou e o que vê, recarregue a página; se continuar, envie o comprovante para {email}. Verificamos e, se
          houver erro no registro, corrigimos em até 10 dias úteis. Este aviso trata só da exibição: não afasta nossa
          responsabilidade pelo registro correto da sua contribuição nem os seus direitos de consumidor.
          {IS_PRELAUNCH && " No pré-lançamento, nada do que a cidade mostra vale como contribuição."}
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
          Para saber o motivo de uma remoção ou contestar, escreva para {email}. Respondemos em até 30 dias e, se houve
          engano, restauramos o que for possível. Conta excluída não pode ser restaurada. Não informamos o motivo
          quando a lei ou uma ordem proibir ou quando isso atrapalhar uma investigação.
        </p>
        <p>
          A medida segue a gravidade: retirar o conteúdo ou excluir a conta. Excluímos a conta direto só em caso grave
          (fraude, abuso ou exploração de crianças e adolescentes, imagem íntima sem autorização, ordem judicial, conta
          de menor de 18 anos) ou depois de violações repetidas.
        </p>
        <p>
          Em manutenção ou reorganização, podemos mudar a posição e a ordem dos edifícios e ocultá-los temporariamente,
          sem apagar edifício de contribuição confirmada. Uma ONG pode deixar de ser listada; contribuições anteriores a
          ela podem continuar visíveis sem o nome da ONG.
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
        <p>
          No seu edifício, você pode definir nome, descrição, imagem, letreiro e imagem de holograma.{" "}
          <strong>Esse conteúdo fica público</strong> para qualquer visitante, mesmo sem conta, junto com o valor, a
          cidade e a ONG do edifício. Se você puser seu nome no edifício, quem vê a cidade pode ligar o valor a você.
          Seu nome e sua foto de perfil aparecem para quem abrir seu link ou código de indicação. Não há revisão
          prévia: você responde pelo que publica.
        </p>
        <p>
          Você garante que tem direito sobre o que envia e nos autoriza, sem custo, a exibir, redimensionar e adaptar
          esse conteúdo dentro do Cidoe enquanto ele estiver publicado. Você continua dono do seu conteúdo.
        </p>
        <p>É proibido:</p>
        <ul>
          <li>conteúdo ilegal, ofensivo, discriminatório, violento, sexual ou que exponha crianças e adolescentes;</li>
          <li>usar nome, imagem ou dados de outra pessoa sem autorização, ou fingir ser alguém;</li>
          <li>publicidade, spam, links maliciosos ou conteúdo que viole direitos autorais e marcas;</li>
          <li>fraudar contribuições, indicações ou recompensas, ou criar contas falsas;</li>
          <li>
            usar robôs ou programas para copiar em massa a cidade, os edifícios ou dados de usuários, ou para criar
            contribuições, indicações ou contas;
          </li>
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
            Se removermos seu conteúdo, você pode pedir o motivo e contestar (ver {see("remocao", "Remoção")}). Se não
            removermos o que foi denunciado, respondemos a quem denunciou, pelo contato informado na denúncia, com o
            motivo.
          </li>
          <li>
            Não contamos a quem foi denunciado quem fez a denúncia, salvo por ordem judicial ou obrigação legal.
            Denúncia falsa, feita para prejudicar alguém, pode gerar responsabilidade para quem a fez.
          </li>
        </ul>
        <p>
          Se tiver indício de que uma ONG listada não existe, não atua na proteção animal ou usa as contribuições de forma
          ilegal ou diferente do que declara, escreva para {email}. Podemos tirar a ONG da lista enquanto analisamos.
          Isso não devolve contribuições já feitas; para devolução, veja {see("contribuicoes", "Contribuições")}.
        </p>
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
          <strong>As regras e o catálogo podem mudar.</strong> Item já liberado continua seu: só o retiramos se foi liberado por erro ou
          por fraude, e nesse caso o edifício volta à opção padrão. Se um item sair do catálogo, mantemos o item nos
          edifícios em que você já o aplicou ou oferecemos um equivalente.
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
        (hospedagem, Google, envio de e-mail, Woovi). Podemos mudar ou suspender
        funcionalidades. Se o Cidoe for encerrado, avisaremos no site com pelo menos 30 dias de antecedência; nesse
        prazo, você pode pedir uma cópia dos seus dados por {email}. Depois, apagamos os dados, salvo o que a lei
        mandar guardar; as cópias de segurança somem em até 3 meses. A cidade
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
          , por exemplo: falha do seu aparelho, navegador ou conexão; serviços que você contrata por conta própria (seu
          banco, sua operadora de internet); perda de dados salvos só no seu navegador;
          conteúdo publicado por outros usuários, que analisamos e removemos após denúncia; e o uso que cada ONG faz das
          contribuições que recebe.
        </p>
        <p>
          Se uma falha da Woovi ou do Google afetar sua contribuição ou seu acesso, ajudamos a resolver. Nada nestes
          termos exclui direitos que o Código de Defesa do Consumidor e outras leis garantem a você.
        </p>
      </>
    ),
  },
  {
    id: "alteracoes",
    title: "Mudanças nestes termos",
    body: (
      <p>
        <strong>
          Podemos atualizar estes termos para refletir mudanças no serviço ou na lei. Se a mudança for relevante (mexer
          em direitos, deveres, valores, dados tratados ou parceiros), avisamos no site pelo menos 15 dias antes de ela
          valer. Nesse prazo, se não concordar, você pode encerrar a conta sem custo e pedir
          uma cópia dos seus dados. Se continuar usando o Cidoe depois do prazo, a nova versão passa a valer para você.
        </strong>{" "}
        Nenhuma mudança cria cobrança para você nem alcança contribuições já feitas ou recompensas já liberadas, e uma
        mudança que reduza seus direitos só vale para o que acontecer depois dela. A data da versão fica no topo da
        página. Correções de digitação, sem efeito sobre direitos, valem na publicação.
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
        maioria dos problemas se resolve por lá. Respondemos em até 5 dias úteis; quando o caso exigir análise,
        informamos o prazo, dentro dos limites destes termos. Você também pode procurar o Procon ou o{" "}
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
          Regras para usar o Cidoe. Os trechos em negrito são os mais
          importantes, inclusive os que limitam direitos: leia com atenção.
        </p>
      }
      sections={sections}
    />
  );
}
