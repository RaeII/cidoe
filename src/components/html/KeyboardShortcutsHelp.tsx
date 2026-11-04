import { formatShortcut, type KeyboardShortcut } from "../hooks/useKeyboardShortcuts";
import { Button } from "@/components/ui/button";
import { PixelClose } from "@/components/ui/pixel-icon";

export type KeyboardShortcutsHelpProps = {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
};

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-tinta/72 p-4"
      onClick={onClose}
    >
      <div
        className="pixel bevel-edge bevel-w-6 w-full max-w-sm bg-background p-5 pb-7 text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Atalhos de teclado</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="-mr-2"
            title="Fechar"
            aria-label="Fechar atalhos"
          >
            <PixelClose className="size-3" />
          </Button>
        </div>
        <ul className="space-y-3">
          {shortcuts.map((shortcut) => (
            <li
              key={shortcut.description}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="text-muted-foreground">{shortcut.description}</span>
              <kbd className="pixel pixel-thin shrink-0 bg-card px-1.5 font-mono text-xs">
                {formatShortcut(shortcut)}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
