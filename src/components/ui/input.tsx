import * as React from "react"

import { cn } from "@/lib/utils"

// `field` (index.css): papel claro + borda em pixel; foco verde, erro âmbar.
const baseInputClasses =
  "field h-11 w-full min-w-0 px-3.5 text-base outline-none selection:bg-ambar selection:text-tinta file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:pointer-events-none md:text-sm"

const autofillInputClasses =
  "[&:-webkit-autofill]:[-webkit-background-clip:text] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--foreground)] [&:-webkit-autofill]:caret-foreground"

interface InputProps extends React.ComponentProps<"input"> {
  /** Rótulo em mono acima do campo (DS). */
  label?: React.ReactNode
}

function Input({ className, type, id, label, ...props }: InputProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId

  const input = (
    <input
      type={type}
      id={label ? inputId : id}
      data-slot="input"
      className={cn(baseInputClasses, autofillInputClasses, className)}
      {...props}
    />
  )

  if (!label) return input

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={inputId} className="mono-label text-foreground">
        {label}
      </label>
      {input}
    </div>
  )
}

export { Input }
