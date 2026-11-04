import { useMemo } from "react";
import type { City, Ong } from "../../api/donationApi";
import { REGIONS, UF_REGION, type Region } from "../../api/regions";
import type { DonationFilter } from "../hooks/useDonations";
import { Button } from "@/components/ui/button";

// Só pl: o padding direito vem do select global (abre espaço para a seta em pixel).
const selectClass = "field h-10 pl-3.5 text-sm";

/**
 * Barra de filtros das doações (região → UF → cidade em cascata + ONG).
 * Presentacional: só recebe listas + filtro e emite onChange. O filtro é
 * aplicado client-side pelo useDonations (dataset é público — ver o hook).
 */
export function DonationFilterBar({
  cities,
  ongs,
  filter,
  onChange,
}: {
  cities: City[];
  ongs: Ong[];
  filter: DonationFilter;
  onChange: (filter: DonationFilter) => void;
}) {
  // UFs presentes no dataset, restritas à região selecionada.
  const ufsInRegion = useMemo(() => {
    const set = new Set<string>();
    for (const city of cities) {
      if (!filter.region || UF_REGION[city.uf] === filter.region) set.add(city.uf);
    }
    return [...set].sort();
  }, [cities, filter.region]);

  // Cidades restritas à UF selecionada.
  const citiesInUf = useMemo(() => {
    const list = filter.uf ? cities.filter((city) => city.uf === filter.uf) : cities;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [cities, filter.uf]);

  const hasFilter =
    filter.region !== undefined ||
    filter.uf !== undefined ||
    filter.cityId !== undefined ||
    filter.ongId !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className={selectClass}
        value={filter.region ?? ""}
        onChange={(e) => {
          const region = (e.target.value || undefined) as Region | undefined;
          onChange({ ...filter, region, uf: undefined, cityId: undefined });
        }}
      >
        <option value="">Todas as regiões</option>
        {REGIONS.map((region) => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filter.uf ?? ""}
        onChange={(e) => {
          const uf = e.target.value || undefined;
          // UF define a região automaticamente; cidade zera (pode não pertencer à UF)
          onChange({ ...filter, uf, region: uf ? UF_REGION[uf] : filter.region, cityId: undefined });
        }}
      >
        <option value="">Todos os estados</option>
        {ufsInRegion.map((uf) => (
          <option key={uf} value={uf}>{uf}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filter.cityId ?? ""}
        onChange={(e) => {
          const cityId = e.target.value ? Number(e.target.value) : undefined;
          const city = cityId ? cities.find((c) => c.id === cityId) : undefined;
          onChange({
            ...filter,
            cityId,
            uf: city ? city.uf : filter.uf,
            region: city ? UF_REGION[city.uf] : filter.region,
          });
        }}
      >
        <option value="">Todas as cidades</option>
        {citiesInUf.map((city) => (
          <option key={city.id} value={city.id}>{city.name}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filter.ongId ?? ""}
        onChange={(e) => {
          const ongId = e.target.value ? Number(e.target.value) : undefined;
          onChange({ ...filter, ongId });
        }}
      >
        <option value="">Todas as ONGs</option>
        {ongs.map((ong) => (
          <option key={ong.id} value={ong.id}>{ong.name}</option>
        ))}
      </select>

      {hasFilter && (
        <Button variant="outline" onClick={() => onChange({})}>
          Limpar
        </Button>
      )}
    </div>
  );
}
