import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  fetchDonationSnapshot,
  type City,
  type DonationDataset,
  type DonationRecord,
  type Ong,
} from "../../api/donationApi";
import { useAuth } from "@/hooks/useAuth";
import { createSeedBuildings, createSeedCustomizations, type LocalBuilding } from "@/lib/prelaunchCity";
import { IS_PRELAUNCH } from "@/lib/legal";
import { useLocalCityValue, useLocalSceneState } from "./useLocalCity";
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
const EMPTY_LOCAL_BUILDINGS: LocalBuilding[] = [];
const EMPTY_LOCAL_CUSTOMIZATIONS: Record<string, BuildingCustomization> = {};
const createDefaultFilter = (): DonationFilter => ({});

/**
 * Carrega doações + personalizações atuais do backend e aplica o filtro client-side.
 *
 * O dataset completo já é público (id, valor, cidade, ONG — sem dado de doador),
 * então filtrar no front não delega nenhuma decisão de segurança ao cliente:
 * é só escolher o que renderizar. Filtrar 100k registros custa ~5ms.
 */
export function useDonations() {
  const { user } = useAuth();
  const userId = user?.id;
  const localBuildings = useLocalCityValue("buildings", EMPTY_LOCAL_BUILDINGS);
  const localCustomizations = useLocalCityValue("customizations", EMPTY_LOCAL_CUSTOMIZATIONS);
  const [loadState, setLoadState] = useState<DonationsLoadState>({
    status: "loading",
    loadedBytes: 0,
    totalBytes: null,
  });
  const [dataset, setDataset] = useState<DonationDataset | null>(null);
  const [filter, setFilter] = useLocalSceneState("filter", createDefaultFilter);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchDonationSnapshot({
      signal: controller.signal,
      onProgress: ({ loadedBytes, totalBytes }) =>
        setLoadState({ status: "loading", loadedBytes, totalBytes }),
    })
      .then((data) => {
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

  // Pré-lançamento usa a mesma cidade inicial, mesmo com doações de teste no banco local.
  const seeds = useMemo(
    () => dataset && (IS_PRELAUNCH || !dataset.donations.length) ? createSeedBuildings(dataset.ongs) : EMPTY_LOCAL_BUILDINGS,
    [dataset],
  );
  const extraBuildings = useMemo(
    () => userId && localBuildings.length ? [...seeds, ...localBuildings] : seeds,
    [seeds, userId, localBuildings],
  );
  const allDonations = useMemo(() => {
    const publicDonations = seeds.length ? EMPTY_DONATIONS : dataset?.donations ?? EMPTY_DONATIONS;
    return extraBuildings.length ? [...publicDonations, ...extraBuildings] : publicDonations;
  }, [dataset, seeds, extraBuildings]);
  const cities = useMemo(() => {
    const publicCities = dataset?.cities ?? EMPTY_CITIES;
    if (!extraBuildings.length) return publicCities;
    const byId = new Map(publicCities.map((city) => [city.id, city]));
    for (const building of extraBuildings) byId.set(building.cityId, building.city);
    return [...byId.values()];
  }, [dataset, extraBuildings]);
  const savedCustomizations = useMemo(() => {
    // Cidade inicial tem aparência própria; personalizações do banco ficam fora dela.
    const merged = seeds.length ? createSeedCustomizations(seeds) : new Map(dataset?.customizations);
    if (userId) for (const [id, customization] of Object.entries(localCustomizations)) merged.set(Number(id), customization);
    return merged;
  }, [seeds, dataset, userId, localCustomizations]);

  const cityById = useMemo(() => {
    const map = new Map<number, City>();
    cities.forEach((city) => map.set(city.id, city));
    return map;
  }, [cities]);

  // Filtro AND: ONG combina com qualquer nível de local; local usa o mais
  // específico presente (cidade > UF > região). Região deriva da UF (UF_REGION).
  const donations = useMemo<DonationRecord[]>(() => {
    if (!dataset) return [];
    const { region, uf, cityId, ongId } = filter;
    if (region === undefined && uf === undefined && cityId === undefined && ongId === undefined) {
      return allDonations;
    }
    return allDonations.filter((donation) => {
      if (ongId !== undefined && !donation.ongIds.includes(ongId)) return false;
      if (cityId !== undefined) return donation.cityId === cityId;
      if (uf !== undefined) return cityById.get(donation.cityId)?.uf === uf;
      if (region !== undefined) {
        const cityUf = cityById.get(donation.cityId)?.uf;
        return cityUf !== undefined && UF_REGION[cityUf] === region;
      }
      return true;
    });
  }, [dataset, allDonations, filter, cityById]);

  return {
    loadState,
    donations,
    /** Dataset sem filtro (ex.: listar as doações do usuário mesmo fora do filtro). */
    allDonations,
    cities,
    ongs: dataset?.ongs ?? EMPTY_ONGS,
    savedCustomizations,
    /** Pré-lançamento ou snapshot vazio → cidade inicial do front. */
    seeded: seeds.length > 0,
    filter,
    setFilter,
    retry,
  };
}
