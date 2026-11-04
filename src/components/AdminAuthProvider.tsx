import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { adminLogin, adminLogout, getAdminSession } from "../api/admin/admin.routes";
import type { LoginInput } from "../api/auth/auth.types";
import { ADMIN_SESSION_EXPIRED_EVENT } from "../api/http";
import type { User } from "../api/user/user.types";
import { AdminAuthContext } from "../hooks/useAdminAuth";

/**
 * Sessão do painel /dale — independente da sessão da cena (AuthProvider):
 * login aqui não loga na cena, e vice-versa. Token no cookie httpOnly
 * `token_admin` (só enviado a /api/admin); aqui fica só o usuário em memória,
 * confirmado pelo backend no mount.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Resposta de refresh mais velha que um login/logout é descartada.
  const sessionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const version = ++sessionVersion.current;
      const current = () => active && version === sessionVersion.current;
      try {
        const { data } = await getAdminSession();
        if (current()) setUser(data);
      } catch {
        if (current()) setUser(null);
      } finally {
        if (current()) setIsLoading(false);
      }
    };
    // Interceptor do axios viu 401 numa rota /admin → cookie admin inválido/expirado.
    const clear = () => {
      ++sessionVersion.current;
      setUser(null);
      setIsLoading(false);
    };
    void refresh();
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, clear);
    return () => {
      active = false;
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, clear);
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await adminLogin(input);
    ++sessionVersion.current;
    setUser(data);
    setIsLoading(false);
    return data;
  }, []);

  const logout = useCallback(async () => {
    ++sessionVersion.current;
    try {
      await adminLogout();
    } finally {
      ++sessionVersion.current;
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
