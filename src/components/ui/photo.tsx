import { useCallback, useState, type ComponentProps } from "react"

import { PixelPhoto } from "@/components/ui/pixel-icon"
import { cn } from "@/lib/utils"

// Só as cinco proporções do DS (5.2).
const RATIO = {
  "16/9": "aspect-video",
  "3/2": "aspect-[3/2]",
  "4/5": "aspect-[4/5]",
  "1/1": "aspect-square",
  "9/16": "aspect-[9/16]",
} as const

const BLOCKS = Array.from({ length: 10 }, (_, index) => index)

type PhotoProps = Omit<ComponentProps<"img">, "className"> & {
  ratio: keyof typeof RATIO
  alt: string
  /** WebP servido antes; `src` (JPG) fica de reserva. */
  webp?: string
  /** Classes da moldura. Abaixo de 120px de largura, some `pixel-thin`. */
  className?: string
}

/** Foto real na moldura do DS (5.3): borda de 3px com canto vazado, sem sombra, recorte `cover`.
 *  Espera em papel 300 com blocos enchendo; falha mostra ícone + frase sem pular o layout (5.7). */
export function Photo({ ratio, webp, className, onLoad, onError, ...props }: PhotoProps) {
  // Resultado guardado por src: trocar a foto volta a "carregando" sem efeito.
  const [result, setResult] = useState<{ src?: string; ok: boolean }>()
  const src = props.src
  const checkCachedImage = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) setResult({ src, ok: image.naturalWidth > 0 })
  }, [src])
  const status = !result || result.src !== props.src ? "loading" : result.ok ? "ready" : "error"
  const img = (
    <img
      {...props}
      ref={checkCachedImage}
      onLoad={(event) => { setResult({ src: props.src, ok: true }); onLoad?.(event) }}
      onError={(event) => { setResult({ src: props.src, ok: false }); onError?.(event) }}
      className={cn("size-full object-cover", status !== "ready" && "opacity-0")}
    />
  )

  return (
    <div className={cn("pixel relative overflow-hidden", RATIO[ratio], status === "error" ? "bg-card" : "bg-muted", className)}>
      {webp ? <picture><source srcSet={webp} type="image/webp" />{img}</picture> : img}
      {status === "loading" && (
        <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <div className="pixel pixel-thin relative flex w-[64%] gap-0.5 bg-card p-[3px]">
            {BLOCKS.map((index) => <span key={index} className="h-2 flex-1 bg-muted" />)}
            <div className="absolute inset-[3px] flex animate-fill gap-0.5 motion-reduce:hidden">
              {BLOCKS.map((index) => <span key={index} className="h-2 flex-1 bg-primary" />)}
            </div>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <PixelPhoto />
          <span className="font-mono text-[11px] text-muted-foreground">Foto indisponível</span>
        </div>
      )}
    </div>
  )
}
