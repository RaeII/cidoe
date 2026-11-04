import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// DS: botão com canto em pixel, bisel sólido na base e sombra dura na diagonal.
// Ao pressionar anda 4px e a sombra zera (`press`). Ghost/link ficam sem moldura.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-bold tracking-[0.04em] whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-45 aria-invalid:pixel-ink-ambar-700 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "pixel raised press bevel-verde-700 bg-primary text-primary-foreground hover:bg-verde-hover",
        // Âmbar = moeda: só para resgatar/conquistar.
        reward: "pixel raised press bevel-ambar-700 bg-ambar text-tinta hover:bg-ambar-hover",
        // Sem vermelho: ação destrutiva = âmbar claro com bisel âmbar escuro.
        destructive:
          "pixel raised press bevel-ambar-700 bg-ambar-100 text-tinta hover:bg-ambar",
        outline:
          "pixel raised press bevel-edge bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "pixel raised press bevel-edge bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-secondary-foreground underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary",
      },
      size: {
        default: "h-10 px-5 pb-1 text-sm has-[>svg]:px-4",
        xs: "h-7 gap-1 px-2.5 pb-0.5 text-xs bevel-w-3 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 pb-0.5 text-xs bevel-w-3 has-[>svg]:px-3",
        lg: "h-12 px-7 pb-1 text-base has-[>svg]:px-6",
        icon: "size-10 pb-1",
        "icon-xs": "size-7 pb-0.5 bevel-w-3 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 pb-0.5 bevel-w-3",
        "icon-lg": "size-12 pb-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
