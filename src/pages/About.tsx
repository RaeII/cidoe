import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PixelArrow } from "@/components/ui/pixel-icon";
import { InstagramIcon, LinkedInIcon } from "@/components/ui/social-icons";
import { IS_PRELAUNCH, LEGAL_CONTROLLER, LEGAL_EMAIL, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { CREATOR_SOCIAL_PROFILES } from "@/lib/seo";

export default function About() {
  return (
    <main className="h-full overflow-y-auto bg-background pattern-paws text-foreground">
      <article className="mx-auto max-w-[78ch] px-6 pt-10 pb-[120px] sm:px-10 sm:pt-16">
        <Button asChild variant="outline" size="sm">
          <Link to="/"><PixelArrow className="rotate-180" />Voltar para a cidade</Link>
        </Button>
        <header className="mt-14">
          <p className="mono-label text-primary">Cidade 3D solidária</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Sobre o Cidoe</h1>
          <p className="mt-8 text-lg leading-relaxed text-muted-foreground">
            Cidoe é um projeto independente de {LEGAL_CONTROLLER} que une uma cidade 3D interativa
            ao apoio a ONGs de proteção animal. A proposta é transformar cada contribuição em um
            edifício personalizável: quanto maior o valor, maior a altura do prédio.
          </p>
        </header>
        <div className="mt-12 space-y-10 text-base leading-relaxed [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_p+p]:mt-4">
          <section>
            <h2>Como funciona a cidade 3D solidária?</h2>
            <p>
              Você explora a cidade pelo navegador, escolhe uma ONG e cria seu edifício por meio de uma
              contribuição. Os prédios representam os valores das contribuições; o maior ocupa o centro
              da cidade. É possível personalizar o edifício e explorar contribuições por cidade e ONG.
            </p>
            <p>
              A causa do projeto é a proteção animal, incluindo o cuidado de cães e gatos.
              O Cidoe é a plataforma da cidade virtual; as ONGs são as organizações apresentadas para receber apoio.
            </p>
          </section>
          <section>
            <h2>As contribuições já são reais?</h2>
            {IS_PRELAUNCH ? (
              <>
                <p><strong>O Cidoe está em pré-lançamento. Não há pagamentos reais.</strong> ONGs, edifícios e valores apresentados são de teste, sem repasse de dinheiro.</p>
                <p>Você pode simular contribuições e personalizar até três edifícios. Essas simulações ficam apenas no seu navegador e não se transformam automaticamente em doações reais.</p>
                <p>Cadastro, login e indicações de amigos são reais. As regras para o lançamento e para contribuições estão nos Termos de Uso.</p>
              </>
            ) : (
              <p>Confira as ONGs disponíveis e as condições da contribuição na cidade. Destinação dos valores, pagamentos e responsabilidades estão nos Termos de Uso.</p>
            )}
          </section>
          <section>
            <h2>Preciso criar uma conta para visitar?</h2>
            <p>Você pode conhecer a cidade sem conta. Para criar e personalizar seus edifícios, é necessário se cadastrar. As contas são destinadas a maiores de 18 anos.</p>
          </section>
          {IS_PRELAUNCH && <section>
            <h2>Como simular uma contribuição?</h2>
            <ol className="list-decimal space-y-3 pl-6">
              <li>Entre na sua conta e clique em <strong>Simular contribuição</strong> na cidade.</li>
              <li>Escolha criar um edifício ou aumentar um dos seus, selecione a ONG de teste e informe o valor. Para um novo edifício, escolha também a cidade.</li>
              <li>Confira os dados e clique em <strong>Confirmar pagamento simulado</strong>. Nenhum dinheiro é cobrado ou enviado à ONG.</li>
            </ol>
          </section>}
          <section>
            <h2>Como personalizar meu edifício?</h2>
            <p>Abra <strong>Meus edifícios</strong>, selecione um prédio e clique em <strong>Personalizar</strong>. Você pode alterar sua aparência com as opções liberadas para a sua conta, como cor, textura, formato e topo.</p>
            <p>As opções bloqueadas mostram o requisito para desbloqueá-las. Trocar a aparência não muda o valor representado pelo edifício.</p>
          </section>
          {IS_PRELAUNCH && <section>
            <h2>Onde minhas simulações ficam salvas?</h2>
            <p>Você pode criar até três edifícios de teste por conta neste navegador. Os edifícios e suas personalizações ficam no armazenamento local: não aparecem para outras pessoas nem são transferidos para outro navegador ou aparelho.</p>
            <p>Limpar os dados do site remove essas simulações. Seu cadastro e suas indicações ficam vinculados à conta; os edifícios simulados não se tornam doações reais no lançamento.</p>
          </section>}
          <section id="israel-zeferino" className="scroll-mt-6">
            <h2>Quem criou o Cidoe?</h2>
            <p>O Cidoe foi criado por <strong>{LEGAL_CONTROLLER}</strong>, responsável pelo projeto e controlador dos dados pessoais conforme a Política de Privacidade.</p>
            <nav aria-label="Redes sociais de Israel Zeferino" className="mt-6 flex flex-wrap gap-4">
              <Button asChild variant="outline" className="min-h-11 touch-manipulation motion-safe:hover:-translate-y-1">
                <a href={CREATOR_SOCIAL_PROFILES.linkedin} target="_blank" rel="me noopener noreferrer" aria-label="LinkedIn de Israel Zeferino (abre em nova aba)">
                  <LinkedInIcon />LinkedIn
                </a>
              </Button>
              <Button asChild variant="outline" className="min-h-11 touch-manipulation motion-safe:hover:-translate-y-1">
                <a href={CREATOR_SOCIAL_PROFILES.instagram} target="_blank" rel="me noopener noreferrer" aria-label="Instagram de Israel Zeferino (abre em nova aba)">
                  <InstagramIcon />Instagram
                </a>
              </Button>
            </nav>
            <p className="mt-6">Para dúvidas sobre o projeto, fale com <a href={`mailto:${LEGAL_EMAIL}`} className="font-semibold underline decoration-2 underline-offset-3">{LEGAL_EMAIL}</a>.</p>
          </section>
        </div>
        <footer className="mt-14 border-t border-border pt-6">
          <nav aria-label="Informações do Cidoe" className="flex flex-wrap gap-x-6 gap-y-3 text-sm underline decoration-2 underline-offset-3">
            <Link to="/">Explorar a cidade 3D</Link>
            <Link to={TERMS_PATH}>Termos de Uso</Link>
            <Link to={PRIVACY_PATH}>Política de Privacidade</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
