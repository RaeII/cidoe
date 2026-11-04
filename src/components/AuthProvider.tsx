import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  logout as apiLogout,
  completeRegistration as apiCompleteRegistration,
  verifyLoginCode as apiVerifyLoginCode,
  loginWithGoogle as apiLoginWithGoogle,
} from "../api/auth/auth.routes";
import type { CompleteRegistrationInput, VerifyCodeInput } from "../api/auth/auth.types";
import { SESSION_EXPIRED_EVENT } from "../api/http";
import type { User } from "../api/user/user.types";
import type { ProfileDetailsInput, UpdateOwnProfileInput } from "../api/user/user.types";
import {
  completeOnboarding as apiCompleteOnboarding,
  getOwnSession,
  updateOwnProfile as apiUpdateOwnProfile,
} from "../api/user/user.routes";
import { AuthContext } from "../hooks/useAuth";

/**
 * Sessão da CENA. O token JWT vive no cookie httpOnly `token_access` — o JS
 * não consegue lê-lo. Aqui fica só o usuário em memória, confirmado pelo
 * backend no mount; se o cookie expirar/for revogado, a API responde 401 e a
 * sessão local cai.
 *
 * Painel /dale tem sessão própria (AdminAuthProvider): login aqui não abre o
 * painel, e login no painel não loga aqui.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionVersion = useRef(0);

  useEffect(() => {
    // Espelho antigo do perfil (e-mail, foto) — nunca era lido. Limpa o que sobrou.
    try {
      localStorage.removeItem("cidoa.admin.session");
    } catch {
      /* storage bloqueado */
    }

    let active = true;
    const refresh = async () => {
      const version = ++sessionVersion.current;
      try {
        const { data } = await getOwnSession();
        if (!active || version !== sessionVersion.current) return;
        setUser(data);
      } catch {
        if (!active || version !== sessionVersion.current) return;
        setUser(null);
      } finally {
        if (active && version === sessionVersion.current) setIsLoading(false);
      }
    };
    void refresh();
    return () => {
      active = false;
    };
  }, []);

  // Ponto único que abre a sessão local — usado pelos fluxos passwordless e
  // Google (mesma resposta {data, expiresIn} do backend).
  const establishSession = useCallback((loggedUser: User) => {
    ++sessionVersion.current;
    setUser(loggedUser);
    setIsLoading(false);
    return loggedUser;
  }, []);

  const loginWithCode = useCallback(
    async (input: VerifyCodeInput) => {
      const result = await apiVerifyLoginCode(input);
      if (result.status === "registration_required") return result;

      const user = establishSession(result.data);
      return { status: "authenticated" as const, user };
    },
    [establishSession],
  );

  const completeRegistration = useCallback(
    async (input: CompleteRegistrationInput) => {
      const { data } = await apiCompleteRegistration(input);
      return establishSession(data);
    },
    [establishSession],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const result = await apiLoginWithGoogle({ credential });
      if (result.status === "registration_required") return result;

      const user = establishSession(result.data);
      return { status: "authenticated" as const, user };
    },
    [establishSession],
  );

  const updateProfile = useCallback(async (input: UpdateOwnProfileInput) => {
    const version = sessionVersion.current;
    const updated = await apiUpdateOwnProfile(input);
    if (version !== sessionVersion.current) return updated;
    setUser(updated);
    return updated;
  }, []);

  const completeOnboarding = useCallback(async (input: ProfileDetailsInput) => {
    const version = sessionVersion.current;
    const updated = await apiCompleteOnboarding(input);
    if (version !== sessionVersion.current) return updated;
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(async () => {
    ++sessionVersion.current;
    try {
      await apiLogout();
    } finally {
      // Limpa local mesmo se a request falhar — o cookie expira sozinho.
      setUser(null);
      ++sessionVersion.current;
      setIsLoading(false);
    }
  }, []);

  // Interceptor do axios detectou 401 → cookie inválido/expirado.
  useEffect(() => {
    const clearSession = () => {
      ++sessionVersion.current;
      setUser(null);
      setIsLoading(false);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, clearSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearSession);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      isAdmin: user?.is_admin ?? false,
      loginWithCode,
      loginWithGoogle,
      completeRegistration,
      updateProfile,
      completeOnboarding,
      logout,
    }),
    [user, isLoading, loginWithCode, loginWithGoogle, completeRegistration, updateProfile, completeOnboarding, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
