import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Selo (DS): mono 11px, borda em pixel de 2px.
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden px-2.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "pixel pixel-thin bg-primary text-primary-foreground",
        secondary: "pixel pixel-thin bg-card text-card-foreground",
        reward: "pixel pixel-thin bg-ambar text-tinta",
        destructive: "pixel pixel-thin pixel-ink-ambar-700 bg-ambar-100 text-tinta",
        outline: "pixel pixel-thin bg-card text-foreground",
        muted: "bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
