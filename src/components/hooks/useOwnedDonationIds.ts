import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyDonations, type OwnedDonationRecord } from "../../api/donationApi";

const EMPTY = new Set<number>();
const EMPTY_RECORDS: OwnedDonationRecord[] = [];

/**
 * Doações da sessão atual. Vazio sem login, durante a carga ou em erro — na
 * dúvida o edifício fica só-leitura, nunca editável por engano.
 */
export function useOwnedDonationIds(): {
  ids: ReadonlySet<number>;
  /** Registros atuais do banco, para mesclar no snapshot cacheado. */
  records: readonly OwnedDonationRecord[];
  /** Pagamento confirmado: relê do banco o edifício novo ou maior. */
  refresh: () => void;
} {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<{ userId: number; ids: Set<number>; records: OwnedDonationRecord[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetchMyDonations({ signal: controller.signal })
      .then((records) => {
        if (!controller.signal.aborted) setOwned({ userId, ids: new Set(records.map((r) => r.id)), records });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || axios.isCancel(err)) return;
        console.error("Falha ao carregar suas doações", err);
      });
    return () => controller.abort();
  }, [userId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  // Nunca reaproveita a lista de outra sessão durante login/logout.
  const current = userId && owned?.userId === userId ? owned : null;
  return { ids: current?.ids ?? EMPTY, records: current?.records ?? EMPTY_RECORDS, refresh };
}
