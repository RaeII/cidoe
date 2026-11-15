import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PixelArrow } from "@/components/ui/pixel-icon";
import { IS_PRELAUNCH, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { ABOUT_PATH, SEO_PAGES, VIDEO_PATH } from "@/lib/seo";

export default function Video() {
  const { title, description } = SEO_PAGES[VIDEO_PATH];

  return (
    <main className="h-full overflow-y-auto bg-background pattern-paws text-foreground">
      <article className="mx-auto max-w-[48rem] px-6 pt-6 pb-[120px] sm:px-10">
        <Button asChild variant="outline" size="sm">
          <Link to="/"><PixelArrow className="rotate-180" />Voltar para a cidade</Link>
        </Button>
        <h1 id="video-title" className="mt-6 text-center text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        <video
          src="/video-cidoe.mp4"
          poster="/video-cidoe-poster.jpg"
          controls
          playsInline
          preload="metadata"
          width={1080}
          height={1920}
          aria-labelledby="video-title"
          aria-describedby="video-description"
          className="mx-auto mt-5 block max-h-[65svh] w-full max-w-sm bg-tinta object-contain"
        >
          Seu navegador não reproduz este vídeo. <a href="/video-cidoe.mp4">Abrir o arquivo de vídeo</a>.
        </video>
        <p id="video-description" className="mt-5 text-base leading-relaxed text-muted-foreground">{description}</p>
        {IS_PRELAUNCH && <p role="note" className="mt-3 text-sm leading-relaxed text-muted-foreground">
          O vídeo apresenta a proposta do projeto. No pré-lançamento, ONGs e doações são de teste; nenhum pagamento é realizado.
        </p>}
        <nav aria-label="Informações do Cidoe" className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm underline decoration-2 underline-offset-3">
          <Link to={ABOUT_PATH}>Sobre o Cidoe</Link>
          <Link to={TERMS_PATH}>Termos de Uso</Link>
          <Link to={PRIVACY_PATH}>Política de Privacidade</Link>
        </nav>
      </article>
    </main>
  );
}
