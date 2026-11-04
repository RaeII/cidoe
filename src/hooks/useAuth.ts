import { createContext, useContext } from "react";
import type {
  CompleteRegistrationInput,
  GoogleAuthResult,
  VerifyCodeInput,
  VerifyCodeResult,
} from "../api/auth/auth.types";
import type { User } from "../api/user/user.types";
import type { ProfileDetailsInput, UpdateOwnProfileInput } from "../api/user/user.types";

/** Sessão da CENA. Painel /dale usa `useAdminAuth` (sessão separada). */
export interface AuthContextValue {
  /** Usuário logado, ou null sem sessão. */
  user: User | null;
  isAuthenticated: boolean;
  /** Aguarda a confirmação inicial do cookie pelo backend. */
  isLoading: boolean;
  /** Conta admin logada na cena: libera toda personalização. Não abre o painel. */
  isAdmin: boolean;
  /** Valida o e-mail; abre a sessão existente ou libera cadastro em memória. */
  loginWithCode: (input: VerifyCodeInput) => Promise<VerifyCodeResult>;
  /** Login com Google (GIS); no 1º acesso devolve os dados a confirmar, sem criar conta. */
  loginWithGoogle: (credential: string) => Promise<GoogleAuthResult>;
  /** Cria a conta após a confirmação do e-mail e abre a sessão. */
  completeRegistration: (input: CompleteRegistrationInput) => Promise<User>;
  /** Atualiza nome, nome de usuário, imagem, cidade e origem do usuário autenticado. */
  updateProfile: (input: UpdateOwnProfileInput) => Promise<User>;
  /** Salva ou pula (`{}`) o onboarding do primeiro login; grava `onboarding_completed_at`. */
  completeOnboarding: (input: ProfileDetailsInput) => Promise<User>;
  /** Remove o cookie no backend e limpa a sessão local. */
  logout: () => Promise<void>;
}

// Preenchido pelo <AuthProvider> (src/components/AuthProvider.tsx).
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
