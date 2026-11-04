import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react"
import { Toast as ToastPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { PixelCheck, PixelClose } from "@/components/ui/pixel-icon"

type ToastVariant = "success" | "error" | "warning" | "info"

type ToastOptions = {
  /** Reenviar com o mesmo id substitui o toast (e reinicia o timer) em vez de empilhar. */
  id?: string
  description?: string
  /** Em ms. `Infinity` = só fecha no "x". */
  duration?: number
  /** Botão extra; clicar também fecha o toast. */
  action?: { label: string; onClick: () => void }
}

type ToastItem = Omit<ToastOptions, "id"> & {
  id: string
  variant: ToastVariant
  title: string
  duration: number
  open: boolean
  /** Key do React: muda a cada envio p/ remontar e reiniciar o timer do Radix. */
  key: number
  /** Leva de toasts abertos juntos; nova leva remonta o Provider (ver Toaster). */
  batch: number
}

// Erro pede mais tempo de leitura que confirmação.
const DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
}
const MAX_TOASTS = 3

// Feedback do DS: quadrado sólido com o ícone. Sem vermelho — erro é "!" âmbar sobre tinta.
const VARIANT: Record<ToastVariant, { box: string; mark: ReactNode }> = {
  success: { box: "bg-primary text-primary-foreground", mark: <PixelCheck className="w-5" /> },
  error: { box: "bg-tinta text-ambar", mark: "!" },
  warning: { box: "bg-ambar text-tinta", mark: "!" },
  info: { box: "bg-secondary text-secondary-foreground", mark: "i" },
}

// Store fora do React: `toast.*` funciona de qualquer lugar (callback de
// promise, handler de API), sem provider nem hook.
let toasts: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit(next: ToastItem[]) {
  toasts = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function show(variant: ToastVariant, title: string, options: ToastOptions = {}) {
  const key = ++seq
  const id = options.id ?? String(key)
  // Fechados (já animaram a saída) saem aqui; acima do teto cai o mais antigo.
  const open = toasts.filter((t) => t.open && t.id !== id)
  const item: ToastItem = {
    ...options,
    id,
    variant,
    title,
    duration: options.duration ?? DURATION[variant],
    open: true,
    key,
    batch: open[0]?.batch ?? key,
  }
  emit([...open, item].slice(-MAX_TOASTS))
  return id
}

export const toast = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  dismiss(id: string) {
    if (!toasts.some((t) => t.id === id && t.open)) return
    emit(toasts.map((t) => (t.id === id ? { ...t, open: false } : t)))
  },
}

// Clique de mouse não leva foco ao botão: senão o Radix, ao fechar, move o foco
// p/ o viewport e os toasts restantes ficam pausados até clicar fora.
// Teclado (F8/Tab + Enter) segue com o foco gerenciado pelo Radix.
const keepFocus = (event: MouseEvent) => event.preventDefault()

/** Monta uma vez na raiz. Pausa no hover/foco, fecha no "x", Esc ou arrastando p/ a direita; F8 foca. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts)

  return (
    // Radix não zera a pausa quando o último toast fecha com o mouse em cima
    // (os listeners de retomada saem junto): o próximo nasceria pausado e
    // nunca sairia sozinho. Remontar o Provider a cada leva zera esse estado.
    <ToastPrimitive.Provider key={items.at(-1)?.batch} label="Notificação" swipeDirection="right">
      {items.map((item) => {
        const { box, mark } = VARIANT[item.variant]
        return (
          <ToastPrimitive.Root
            key={item.key}
            open={item.open}
            onOpenChange={(open) => {
              if (!open) toast.dismiss(item.id)
            }}
            duration={item.duration}
            // pointer-events-auto: Dialog modal desliga o pointer do body; sem
            // isso o "x" não clica com um dialog aberto.
            className="pointer-events-auto flex w-full items-center gap-4 pixel bevel-edge bg-card p-4 pb-[18px] text-base text-card-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=move]:transition-none data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full"
          >
            <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center font-mono text-lg font-semibold", box)}>{mark}</span>
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="leading-5 font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            {item.action && (
              <ToastPrimitive.Action
                altText={item.action.label}
                onClick={item.action.onClick}
                onMouseDown={keepFocus}
                className={buttonVariants({ variant: "outline", size: "xs" })}
              >
                {item.action.label}
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close
              aria-label="Fechar notificação"
              onMouseDown={keepFocus}
              className="grid size-8 shrink-0 place-items-center text-foreground transition-colors hover:bg-accent"
            >
              <PixelClose className="size-2.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
      {/* Rodapé central: topo e cantos já têm menu, filtros e painéis. bottom-20 livra a MobileNav. */}
      <ToastPrimitive.Viewport
        label="Notificações ({hotkey})"
        className="fixed bottom-20 left-1/2 z-100 flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 outline-none md:bottom-6"
      />
    </ToastPrimitive.Provider>
  )
}
