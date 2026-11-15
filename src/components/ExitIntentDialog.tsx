import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { rememberAccount, watchExitIntent } from "@/lib/exitIntent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Visitante sem conta saindo da cena. Quais saídas e por quê: `watchExitIntent`. */
export function ExitIntentDialog({ onSignup }: { onSignup: () => void }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const guest = !isLoading && !isAuthenticated;

  // Sessão (cadastro, login ou cookie restaurado) marca o dispositivo antes de o logout religar o efeito.
  useEffect(() => {
    if (isAuthenticated) rememberAccount();
  }, [isAuthenticated]);
  useEffect(() => (guest ? watchExitIntent(() => setOpen(true)) : undefined), [guest]);

  return (
    <Dialog open={open && guest} onOpenChange={setOpen}>
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent aria-describedby={undefined} className="text-foreground sm:max-w-md">
        <DialogHeader>
          {/* px-8: título centralizado no mobile não encosta no X. */}
          <DialogTitle className="px-8 sm:pl-0">Tem certeza que vai sair?</DialogTitle>
        </DialogHeader>
        {/* Recusar = X, Esc ou clique fora. Volta a aparecer a cada saída até criar conta. */}
        <DialogFooter>
          <Button type="button" size="lg" onClick={() => { setOpen(false); onSignup(); }}>
            Criar conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
