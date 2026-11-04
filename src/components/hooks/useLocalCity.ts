import { useCallback, useEffect, useMemo, useSyncExternalStore, type SetStateAction } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LOCAL_CITY_EVENT, localCityKey, readLocalValue, writeLocalValue } from "@/lib/prelaunchCity";
import { toast } from "@/components/ui/toast";

/** Mesmo usuário/outra aba recebe apenas as alterações do seu navegador. */
export function useLocalCityValue<T>(area: string, fallback: T): T {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = localCityKey(userId, area);
  const subscribe = useCallback((notify: () => void) => {
    const changed = (event: Event) => {
      if (event instanceof StorageEvent ? event.key === key || event.key === null : (event as CustomEvent<string>).detail === key) notify();
    };
    window.addEventListener("storage", changed);
    window.addEventListener(LOCAL_CITY_EVENT, changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener(LOCAL_CITY_EVENT, changed);
    };
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  }, () => null);
  const loaded = useMemo(() => {
    if (snapshot === null) return { value: fallback, error: null };
    try { return { value: readLocalValue(userId, area, fallback), error: null }; }
    catch (error) { return { value: fallback, error: error instanceof Error ? error.message : "Não foi possível carregar sua cidade local." }; }
  }, [snapshot, userId, area, fallback]);
  useEffect(() => {
    if (loaded.error) toast.error(loaded.error, { id: key });
  }, [loaded.error, key]);
  return loaded.value;
}

export function useLocalSceneState<T>(key: string, createDefault: () => T): [T, (action: SetStateAction<T>) => void] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const area = `scene:${key}`;
  const fallback = useMemo(() => createDefault(), [createDefault]);
  const value = useLocalCityValue(area, fallback);
  const setValue = useCallback((action: SetStateAction<T>) => {
    try {
      const current = readLocalValue(userId, area, fallback);
      const next = typeof action === "function" ? (action as (prev: T) => T)(current) : action;
      writeLocalValue(userId, area, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar neste navegador.");
    }
  }, [userId, area, fallback]);
  return [value, setValue];
}
