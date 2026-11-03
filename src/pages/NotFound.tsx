import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <h1 className="text-3xl font-semibold">Página não encontrada</h1>
      <p>Esta página não existe ou mudou de endereço.</p>
      <Button asChild><Link to="/">Voltar para a cidade</Link></Button>
    </main>
  );
}
