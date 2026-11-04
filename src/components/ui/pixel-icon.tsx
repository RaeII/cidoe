import type { SVGProps } from "react"

import { cn } from "@/lib/utils"

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">

// Ícones da grade do DS (pixel = 1 unidade do viewBox). Uma cor: herdam currentColor.
// Furos (janelas do edifício) via evenodd, então mostram o fundo por trás.
function pixelIcon(name: string, viewBox: string, width: number, height: number, d: string) {
  function PixelIcon({ className, ...props }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        width={width}
        height={height}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className={cn("shrink-0", className)}
        {...props}
      >
        <path fill="currentColor" fillRule="evenodd" d={d} />
      </svg>
    )
  }
  PixelIcon.displayName = name
  return PixelIcon
}

export const PixelClose = pixelIcon("PixelClose", "0 0 7 7", 14, 14, "M0 0h2v2h-2zM5 0h2v2h-2zM2 2h3v3h-3zM0 5h2v2h-2zM5 5h2v2h-2z")
export const PixelCheck = pixelIcon("PixelCheck", "0 1 10 6", 15, 9, "M8 1h2v1h-2zM7 2h2v1h-2zM6 3h2v1h-2zM0 4h2v1h-2zM5 4h2v1h-2zM1 5h2v1h-2zM4 5h2v1h-2zM2 6h3v1h-3z")
export const PixelChevronDown = pixelIcon("PixelChevronDown", "0 0 7 4", 14, 8, "M0 0h7v1h-7zM1 1h5v1h-5zM2 2h3v1h-3zM3 3h1v1h-1z")
/** Cursor de menu ▸ — marca a opção ativa. */
export const PixelArrow = pixelIcon("PixelArrow", "0 0 4 7", 6, 10, "M0 0h1v7h-1zM1 1h1v5h-1zM2 2h1v3h-1zM3 3h1v1h-1z")
export const PixelHeart = pixelIcon("PixelHeart", "0 0 8 6", 16, 12, "M1 0h2v1h-2zM5 0h2v1h-2zM0 1h8v2h-8zM1 3h6v1h-6zM2 4h4v1h-4zM3 5h2v1h-2z")
export const PixelPaw = pixelIcon("PixelPaw", "0 0 9 8", 14, 12, "M2 0h2v2h-2zM5 0h2v2h-2zM0 2h2v2h-2zM7 2h2v2h-2zM3 3h3v1h-3zM2 4h5v1h-5zM1 5h7v2h-7zM2 7h2v1h-2zM5 7h2v1h-2z")
export const PixelBuilding = pixelIcon(
  "PixelBuilding",
  "0 0 8 8",
  16,
  16,
  "M2 0h4v1h-4zM1 1h6v7h-6zM2 2h1v1h-1zM5 2h1v1h-1zM2 4h1v1h-1zM5 4h1v1h-1zM3 6h2v2h-2z",
)

/** Moeda âmbar: XP, conquista, recompensa. Cor fixa — a moeda é sempre âmbar. */
export function PixelCoin({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={16} height={16} shapeRendering="crispEdges" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-ambar)" d="M2 0h4v1h-4zM1 1h6v1h-6zM0 2h8v4h-8zM1 6h6v1h-6zM2 7h4v1h-4z" />
      <path fill="var(--color-ambar-700)" d="M3 2h2v4h-2z" />
    </svg>
  )
}

/** Presente âmbar: recompensa a conquistar. Cor fixa, como a moeda; fita e laço no tom 700. */
export function PixelGift({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={16} height={16} shapeRendering="crispEdges" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-ambar)" d="M0 2h8v2h-8zM1 4h6v4h-6z" />
      <path fill="var(--color-ambar-700)" d="M1 0h2v1h-2zM5 0h2v1h-2zM2 1h4v1h-4zM3 2h2v6h-2zM0 3h8v1h-8z" />
    </svg>
  )
}

/** Logo oficial (public/): verde-oliva no claro, branca no escuro. */
export function CidoeLogo({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo.webp" alt="" width={28} height={28} className={cn("shrink-0 dark:hidden", className)} />
      <img src="/logo-branca.webp" alt="" width={28} height={28} className={cn("hidden shrink-0 dark:block", className)} />
    </>
  )
}

/** Foto indisponível (DS 5.7): moldura, sol âmbar, morro verde. ×4 da grade 8×8. */
export function PixelPhoto({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" width={32} height={32} shapeRendering="crispEdges" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <path fill="var(--color-foreground)" d="M0 0h8v1h-8zM0 1h1v6h-1zM7 1h1v6h-1zM0 7h8v1h-8z" />
      <path fill="var(--color-ambar)" d="M5 2h1v1h-1z" />
      <path fill="var(--color-verde)" d="M2 4h1v1h-1zM1 5h3v1h-3zM5 5h1v1h-1zM1 6h6v1h-6z" />
    </svg>
  )
}

/** Marca de erro do DS: "!" âmbar sobre tinta — sem vermelho. Decorativa: o texto ao lado diz o erro. */
export function ErrorMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mt-px grid size-[18px] shrink-0 place-items-center bg-tinta font-mono text-[11px] font-semibold text-ambar", className)}
    >
      !
    </span>
  )
}

/** Gato em pixel espiando por cima de um modal (DS 6.7). Pelagem real, não cor da marca. Posicione com absolute. */
export function PixelCat({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 29 16" width={87} height={48} shapeRendering="crispEdges" aria-hidden="true" className={cn("pointer-events-none shrink-0", className)} {...props}>
      <path fill="#5E3A22" d="M5 0h1v1h-1zM23 0h1v1h-1zM5 1h2v1h-2zM22 1h2v1h-2zM5 2h1v1h-1zM7 2h1v1h-1zM21 2h1v1h-1zM23 2h1v1h-1zM5 3h1v1h-1zM8 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM5 4h1v1h-1zM9 4h11v1h-11zM23 4h1v1h-1zM4 5h1v1h-1zM24 5h1v1h-1zM4 6h1v1h-1zM24 6h1v1h-1zM4 7h1v1h-1zM24 7h1v1h-1zM4 8h1v1h-1zM24 8h1v1h-1zM4 9h1v1h-1zM24 9h1v1h-1zM3 10h1v1h-1zM25 10h1v1h-1zM3 11h1v1h-1zM25 11h1v1h-1zM3 12h1v1h-1zM25 12h1v1h-1zM3 13h2v1h-2zM8 13h1v1h-1zM20 13h1v1h-1zM24 13h2v1h-2zM4 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM20 14h1v1h-1zM22 14h1v1h-1zM24 14h1v1h-1zM5 15h3v1h-3zM21 15h3v1h-3z" />
      <path fill="#EE9A4D" d="M6 2h1v1h-1zM22 2h1v1h-1zM6 3h1v1h-1zM22 3h1v1h-1zM6 4h1v1h-1zM22 4h1v1h-1zM5 5h7v1h-7zM13 5h1v1h-1zM15 5h1v1h-1zM17 5h7v1h-7zM5 6h9v1h-9zM15 6h9v1h-9zM5 7h3v1h-3zM10 7h9v1h-9zM21 7h3v1h-3zM6 8h2v1h-2zM10 8h9v1h-9zM21 8h2v1h-2zM5 9h3v1h-3zM10 9h3v1h-3zM16 9h3v1h-3zM21 9h3v1h-3zM4 10h2v1h-2zM8 10h3v1h-3zM18 10h3v1h-3zM23 10h2v1h-2zM4 11h7v1h-7zM18 11h7v1h-7zM4 12h7v1h-7zM18 12h7v1h-7zM9 13h2v1h-2zM18 13h2v1h-2z" />
      <path fill="#CF7533" d="M12 5h1v1h-1zM14 5h1v1h-1zM16 5h1v1h-1zM14 6h1v1h-1zM5 8h1v1h-1zM23 8h1v1h-1z" />
      <path fill="#FFF5E8" d="M11 10h3v1h-3zM15 10h3v1h-3zM11 11h1v1h-1zM13 11h1v1h-1zM15 11h1v1h-1zM17 11h1v1h-1zM11 12h2v1h-2zM14 12h1v1h-1zM16 12h2v1h-2zM5 13h3v1h-3zM11 13h7v1h-7zM21 13h3v1h-3zM5 14h1v1h-1zM7 14h1v1h-1zM21 14h1v1h-1zM23 14h1v1h-1z" />
      <path fill="#F5A6AE" d="M7 3h1v1h-1zM21 3h1v1h-1zM7 4h2v1h-2zM20 4h2v1h-2zM6 10h2v1h-2zM21 10h2v1h-2z" />
      <path fill="#E2788A" d="M13 9h3v1h-3zM14 10h1v1h-1z" />
      <path fill="#2A1F1A" d="M9 7h1v1h-1zM20 7h1v1h-1zM8 8h2v1h-2zM19 8h2v1h-2zM8 9h2v1h-2zM19 9h2v1h-2zM12 11h1v1h-1zM14 11h1v1h-1zM16 11h1v1h-1zM13 12h1v1h-1zM15 12h1v1h-1z" />
      <path fill="#FFFFFF" d="M8 7h1v1h-1zM19 7h1v1h-1z" />
      <path fill="#7A5238" d="M0 10h3v1h-3zM26 10h3v1h-3zM0 12h3v1h-3zM26 12h3v1h-3z" />
    </svg>
  )
}

/** Cachorro em pixel espiando por cima de um card (DS 6.6). Posicione com absolute. */
export function PixelDog({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 13" width={64} height={52} shapeRendering="crispEdges" aria-hidden="true" className={cn("pointer-events-none shrink-0", className)} {...props}>
      <path fill="#4A2F1F" d="M4 0h8v1h-8zM3 1h1v1h-1zM12 1h1v1h-1zM1 2h3v1h-3zM12 2h3v1h-3zM0 3h1v1h-1zM3 3h1v1h-1zM12 3h1v1h-1zM15 3h1v1h-1zM0 4h1v1h-1zM3 4h1v1h-1zM12 4h1v1h-1zM15 4h1v1h-1zM0 5h1v1h-1zM3 5h1v1h-1zM12 5h1v1h-1zM15 5h1v1h-1zM0 6h1v1h-1zM3 6h1v1h-1zM12 6h1v1h-1zM15 6h1v1h-1zM0 7h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM15 7h1v1h-1zM1 8h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM14 8h1v1h-1zM2 9h2v1h-2zM12 9h2v1h-2zM1 10h1v1h-1zM4 10h1v1h-1zM11 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM4 11h1v1h-1zM11 11h1v1h-1zM14 11h1v1h-1zM2 12h2v1h-2zM12 12h2v1h-2z" />
      <path fill="#C98A4B" d="M4 1h8v1h-8zM4 2h8v1h-8zM4 3h8v1h-8zM4 4h1v1h-1zM7 4h2v1h-2zM11 4h1v1h-1zM4 5h1v1h-1zM7 5h2v1h-2zM11 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM4 7h1v1h-1zM11 7h1v1h-1zM4 8h1v1h-1zM11 8h1v1h-1zM4 9h1v1h-1zM11 9h1v1h-1zM2 10h2v1h-2zM5 10h1v1h-1zM10 10h1v1h-1zM12 10h2v1h-2zM2 11h2v1h-2zM12 11h2v1h-2z" />
      <path fill="#8A5530" d="M1 3h2v1h-2zM13 3h2v1h-2zM1 4h2v1h-2zM13 4h2v1h-2zM1 5h2v1h-2zM13 5h2v1h-2zM1 6h2v1h-2zM13 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM2 8h1v1h-1zM13 8h1v1h-1z" />
      <path fill="#FFFFFF" d="M5 4h1v1h-1zM9 4h1v1h-1z" />
      <path fill="#2A1E17" d="M6 4h1v1h-1zM10 4h1v1h-1zM5 5h2v1h-2zM9 5h2v1h-2zM7 7h2v1h-2zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z" />
      <path fill="#EF8E96" d="M4 6h1v1h-1zM11 6h1v1h-1zM7 10h2v1h-2z" />
      <path fill="#F8EBD5" d="M6 6h4v1h-4zM5 7h2v1h-2zM9 7h2v1h-2zM5 8h1v1h-1zM7 8h2v1h-2zM10 8h1v1h-1zM5 9h2v1h-2zM9 9h2v1h-2zM6 10h1v1h-1zM9 10h1v1h-1z" />
    </svg>
  )
}

/** Carregando em blocos (substitui spinner): três blocos acendem em sequência. Decorativo — acompanhe de texto. */
export function BlockLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center gap-[3px]", className)}>
      {[0, 300, 600].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-block bg-current motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
