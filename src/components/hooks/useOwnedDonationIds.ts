import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { LocalBuilding } from "@/lib/prelaunchCity";
import { useLocalCityValue } from "./useLocalCity";

const EMPTY: LocalBuilding[] = [];

/** Edifícios simulados da conta neste navegador; nenhum registro do banco é editável por posse local. */
export function useOwnedDonationIds() {
  const { user } = useAuth();
  const buildings = useLocalCityValue("buildings", EMPTY);
  const records = user ? buildings : EMPTY;
  const ids = useMemo(() => new Set(records.map((record) => record.id)), [records]);
  return { ids, records };
}
