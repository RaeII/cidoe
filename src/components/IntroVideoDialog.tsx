import type { ComponentProps, ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PixelClose } from "@/components/ui/pixel-icon";

/**
 * Moldura em duas metades. Desktop: `media` à esquerda, `panel` (login) à direita. Mobile: `media` +
 * `footer` embaixo. Vídeo de apresentação e login do evento dos times (recompensa à esquerda).
 */
export function SplitDialogContent({
  media,
  panel,
  footer,
  className,
  ...props
}: Omit<ComponentProps<typeof DialogContent>, "children"> & {
  media: ReactNode;
  /** Desktop: metade direita. */
  panel: ReactNode;
  /** Mobile: embaixo da `media`. */
  footer?: ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    // text-foreground: o body da cena pinta texto branco, que sumiria no tema claro.
    <DialogContent
      showCloseButton={false}
      {...props}
      className={cn("flex max-h-none max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 pb-0 text-foreground sm:max-w-[calc(100%-1rem)] md:h-auto md:max-w-fit md:flex-row", className)}
    >
      {media}
      {isMobile ? (
        footer && <div className="p-4">{footer}</div>
      ) : (
        // my-auto centraliza na vertical sem cortar o topo quando o conteúdo passa da altura.
        <div className="flex w-96 flex-col overflow-y-auto p-6 pb-8">
          <div className="my-auto grid gap-4">{panel}</div>
        </div>
      )}
      <DialogClose className="absolute top-3 right-3 grid size-9 place-items-center bg-background text-foreground transition-colors hover:bg-accent">
        <PixelClose className="size-3" />
        <span className="sr-only">Fechar</span>
      </DialogClose>
    </DialogContent>
  );
}

/**
 * Vídeo de apresentação sob demanda (mudo, em loop, sem controles). Mobile: vídeo
 * quase em tela cheia + "Acessar Cidoe" embaixo (só fecha). Desktop: vídeo à esquerda, `panel` (login)
 * à direita. Quando abre e o que fica salvo: `AuthMenu`.
 */
export function IntroVideoDialog({
  open,
  onOpenChange,
  panel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop: conteúdo do login, metade direita. */
  panel: ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SplitDialogContent
        {...(isMobile ? { "aria-describedby": undefined } : {})}
        className="h-[calc(var(--viewport-height,100dvh)-1rem)]"
        media={
          <video
            src="/video-cidoe.mp4"
            poster="/video-cidoe-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            className="min-h-0 w-full flex-1 bg-tinta object-cover md:aspect-[9/16] md:h-[min(40rem,calc(var(--viewport-height,100dvh)-4rem))] md:w-auto md:flex-none"
          />
        }
        panel={panel}
        footer={
          <>
            <DialogTitle className="sr-only">Cidoe</DialogTitle>
            <DialogClose asChild>
              <Button type="button" size="lg" className="w-full">
                Acessar Cidoe
              </Button>
            </DialogClose>
          </>
        }
      />
    </Dialog>
  );
}
