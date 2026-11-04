import { createContext, useContext } from "react";
import type { LoginInput } from "../api/auth/auth.types";
import type { User } from "../api/user/user.types";

export interface AdminAuthContextValue {
  /** Admin logado no painel, ou null. Independe da sessão da cena. */
  user: User | null;
  /** Aguarda a confirmação inicial do cookie admin pelo backend. */
  isLoading: boolean;
  /** Login por senha. Backend só aceita conta admin e seta só o cookie do painel. */
  login: (input: LoginInput) => Promise<User>;
  /** Encerra só a sessão do painel. */
  logout: () => Promise<void>;
}

// Preenchido pelo <AdminAuthProvider> (src/components/AdminAuthProvider.tsx).
export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth deve ser usado dentro de <AdminAuthProvider>");
  return ctx;
}
