import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PixelArrow } from "@/components/ui/pixel-icon";
import { LEGAL_UPDATED_AT, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { ABOUT_PATH } from "@/lib/seo";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Link em texto do DS (verde sublinhado 2px); usado no corpo dos documentos. */
export const docLink = "font-semibold text-secondary-foreground underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary";

/**
 * Página pública de documento legal (`/termos`, `/privacidade`). Fora do
 * AuthProvider: abre sem sessão e sem carregar a cena. O body não rola (cena
 * ocupa a viewport), então a página rola no próprio `<main>`.
 */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="h-full overflow-y-auto bg-background pattern-paws text-foreground">
      <div className="mx-auto w-full max-w-[1240px] px-6 pt-10 pb-[120px] sm:px-10 sm:pt-16">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <PixelArrow className="rotate-180" />
            Voltar para a cidade
          </Link>
        </Button>

        <header className="mt-14">
          <p className="font-mono text-[13px] tracking-[0.06em] text-primary">
            Versão de {LEGAL_UPDATED_AT}
          </p>
          <h1 className="mt-6 max-w-[16ch] text-[2.5rem] font-semibold leading-[0.98] tracking-[-0.025em] text-balance sm:text-6xl">
            {title}
          </h1>
          <div className="mt-8 max-w-[60ch] text-lg leading-normal text-pretty text-muted-foreground sm:text-[22px]">{intro}</div>
        </header>

        <div className="mt-16 grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <nav aria-label="Seções" className="lg:sticky lg:top-6">
            <p className="mono-label text-muted-foreground">Nesta página</p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="hover:bg-accent hover:text-primary">
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex flex-col gap-1.5 text-sm">
              <Link to={ABOUT_PATH} className={docLink}>Sobre o Cidoe</Link>
              <Link to={TERMS_PATH} className={docLink}>Termos de Uso</Link>
              <Link to={PRIVACY_PATH} className={docLink}>Política de Privacidade</Link>
            </p>
          </nav>

          <article className="pixel bevel-edge max-w-[78ch] space-y-12 bg-card px-5 pt-8 pb-11 sm:px-10">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <h2 className="text-2xl font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[26px]">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-base leading-relaxed text-pretty sm:text-[17px] [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </main>
  );
}
