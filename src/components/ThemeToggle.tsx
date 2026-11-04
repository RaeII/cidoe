import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

type SwitchProps = {
  checked: boolean
  onToggle: () => void
  label: string
  className?: string
  knobClassName?: string
}

// Switch do DS: trilho quadrado com borda em pixel + bloco que desliza entre sol e lua.
function SunMoonSwitch({ checked, onToggle, label, className, knobClassName }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        'pixel pixel-thin relative inline-flex h-8 w-14 shrink-0 items-center justify-between bg-muted px-2 transition-colors',
        className,
      )}
    >
      {/* Ícones fixos: o do lado inativo fica visível e opaco; o do lado ativo é coberto pelo knob. */}
      <Sun className="h-3.5 w-3.5 text-muted-foreground" />
      <Moon className="h-3.5 w-3.5 text-muted-foreground" />
      <span
        className={cn(
          'absolute left-1 top-1 flex h-6 w-6 items-center justify-center bg-primary text-primary-foreground transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-0',
          knobClassName,
        )}
      >
        {checked ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
}

// Tema do admin: fonte da verdade e persistência ficam no useTheme; aqui só a UI.
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <SunMoonSwitch
      checked={isDark}
      onToggle={toggle}
      label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
    />
  )
}

// Modo noite da cena (`EnvironmentSettings.night`): placa de papel sobre a cena.
export function NightToggle({ night, onNightChange }: { night: boolean; onNightChange: (night: boolean) => void }) {
  return (
    <SunMoonSwitch
      checked={night}
      onToggle={() => onNightChange(!night)}
      label={night ? 'Modo dia' : 'Modo noite'}
      className="bg-card"
    />
  )
}
