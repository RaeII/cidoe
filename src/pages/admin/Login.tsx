import { useState, type SyntheticEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/http";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CidoeLogo, ErrorMark } from "@/components/ui/pixel-icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Login() {
  const { user, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Rota de origem guardada pelo RequireAdmin — volta para lá após logar.
  const locationState = location.state as { from?: { pathname: string } } | null;
  const from = locationState?.from?.pathname ?? "/dale";

  // Admin já logado não vê o login (evita loop com o RequireAdmin).
  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Backend só aceita conta admin (comum = mesmo 401 de senha errada) e
      // abre só a sessão do painel — a cena continua deslogada.
      await login({ login: identifier, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado ao entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex h-svh flex-col items-center justify-center-safe gap-6 overflow-y-auto bg-background pattern-paws px-6 py-6 text-foreground [&>*]:shrink-0">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <CidoeLogo className="size-12" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Admin</CardTitle>
          <CardDescription>Painel administrativo do Cidoe.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="identifier"
              label="Username ou email"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />

            <Input
              id="password"
              label="Senha"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <p role="alert" className="flex gap-2 text-sm text-destructive">
                <ErrorMark />
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Login;
