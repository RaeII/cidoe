import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  loadDonationSnapshot,
  type City,
  type DonationDataset,
  type DonationRecord,
  type Ong,
  type OwnedDonationRecord,
} from "../../api/donationApi";
import { UF_REGION, type Region } from "../../api/regions";
import type { BuildingCustomization } from "../../scene/types";

export type DonationFilter = {
  region?: Region;
  uf?: string;
  cityId?: number;
  ongId?: number;
};

export type DonationsLoadState =
  | { status: "loading"; loadedBytes: number; totalBytes: number | null }
  | { status: "ready"; count: number }
  | { status: "error"; message: string };

const EMPTY_DONATIONS: DonationRecord[] = [];
const EMPTY_CITIES: City[] = [];
const EMPTY_ONGS: Ong[] = [];
const EMPTY_CUSTOMIZATIONS = new Map<number, BuildingCustomization>();

/**
 * Carrega doações + personalizações atuais do backend e aplica o filtro client-side.
 *
 * O dataset completo já é público (id, valor, cidade, ONG — sem dado de doador),
 * então filtrar no front não delega nenhuma decisão de segurança ao cliente:
 * é só escolher o que renderizar. Filtrar 100k registros custa ~5ms.
 */
export function useDonations() {
  const [loadState, setLoadState] = useState<DonationsLoadState>({
    status: "loading",
    loadedBytes: 0,
    totalBytes: null,
  });
  const [dataset, setDataset] = useState<DonationDataset | null>(null);
  const [filter, setFilter] = useState<DonationFilter>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    // 1ª carga reaproveita a busca disparada no entry (main.tsx); retry busca de novo.
    loadDonationSnapshot({
      signal: controller.signal,
      onProgress: ({ loadedBytes, totalBytes }) => {
        if (!controller.signal.aborted) setLoadState({ status: "loading", loadedBytes, totalBytes });
      },
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        performance.mark("cidoe:dados");
        setDataset(data);
        setLoadState({ status: "ready", count: data.donations.length });
      })
      .catch((err: unknown) => {
        // Abort do StrictMode/unmount não é erro
        if (controller.signal.aborted || axios.isCancel(err)) return;
        setLoadState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    // Reset síncrono aqui (não no effect) → volta ao spinner na hora do clique
    setLoadState({ status: "loading", loadedBytes: 0, totalBytes: null });
    setReloadKey((key) => key + 1);
  }, []);

  /**
   * Troca pelo id ou acrescenta (edifícios do usuário, mais novos que o snapshot
   * cacheado). Nada mudou = mesmo dataset: sem rebuild da cidade.
   */
  const upsertDonations = useCallback((records: readonly OwnedDonationRecord[]) => {
    setDataset((prev) => {
      if (!prev) return prev;
      let donations = prev.donations;
      let cities = prev.cities;
      for (const { city, ...record } of records) {
        // Snapshot só lista cidades com edifício: a do recém-pago pode ainda não estar lá.
        if (city && !cities.some((known) => known.id === city.id)) cities = [...cities, city];
        const old = donations.find((donation) => donation.id === record.id);
        if (
          old &&
          old.value === record.value &&
          old.cityId === record.cityId &&
          old.ongIds.join() === record.ongIds.join()
        ) continue;
        donations = old
          ? donations.map((donation) => (donation.id === record.id ? record : donation))
          : [...donations, record];
      }
      return donations === prev.donations && cities === prev.cities ? prev : { ...prev, donations, cities };
    });
  }, []);

  const cityById = useMemo(() => {
    const map = new Map<number, City>();
    dataset?.cities.forEach((city) => map.set(city.id, city));
    return map;
  }, [dataset]);

  // Filtro AND: ONG combina com qualquer nível de local; local usa o mais
  // específico presente (cidade > UF > região). Região deriva da UF (UF_REGION).
  const donations = useMemo<DonationRecord[]>(() => {
    if (!dataset) return [];
    const { region, uf, cityId, ongId } = filter;
    if (region === undefined && uf === undefined && cityId === undefined && ongId === undefined) {
      return dataset.donations;
    }
    return dataset.donations.filter((donation) => {
      if (ongId !== undefined && !donation.ongIds.includes(ongId)) return false;
      if (cityId !== undefined) return donation.cityId === cityId;
      if (uf !== undefined) return cityById.get(donation.cityId)?.uf === uf;
      if (region !== undefined) {
        const cityUf = cityById.get(donation.cityId)?.uf;
        return cityUf !== undefined && UF_REGION[cityUf] === region;
      }
      return true;
    });
  }, [dataset, filter, cityById]);

  return {
    loadState,
    donations,
    /** Dataset sem filtro (ex.: listar as doações do usuário mesmo fora do filtro). */
    allDonations: dataset?.donations ?? EMPTY_DONATIONS,
    cities: dataset?.cities ?? EMPTY_CITIES,
    ongs: dataset?.ongs ?? EMPTY_ONGS,
    savedCustomizations: dataset?.customizations ?? EMPTY_CUSTOMIZATIONS,
    filter,
    setFilter,
    retry,
    upsertDonations,
  };
}
