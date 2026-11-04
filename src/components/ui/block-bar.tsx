import { cn } from "@/lib/utils"

type BlockBarProps = {
  value: number
  max: number
  /** Quantos blocos a barra tem (padrão 10). */
  blocks?: number
  /** Nome acessível da barra. */
  label: string
  /** md = moldura em pixel + blocos de 18px; sm = sem moldura, blocos de 8px (HUD). */
  size?: "sm" | "md"
  /** Acende o próximo bloco em âmbar (padrão true). */
  highlightNext?: boolean
  className?: string
}

/** Barra em blocos (DS): todo progresso é contado em blocos; o próximo a conquistar acende em âmbar. */
export function BlockBar({ value, max, blocks = 10, label, size = "md", highlightNext = true, className }: BlockBarProps) {
  const filled = max > 0 ? Math.min(blocks, Math.floor((Math.max(0, value) / max) * blocks)) : 0

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        "flex",
        size === "md" ? "pixel pixel-thin gap-1 bg-card p-[5px]" : "gap-0.5",
        className,
      )}
    >
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className={cn(
            "flex-1",
            size === "md" ? "h-[18px]" : "h-2",
            i < filled ? "bg-primary" : highlightNext && i === filled ? "bg-ambar" : "bg-muted",
          )}
        />
      ))}
    </div>
  )
}
