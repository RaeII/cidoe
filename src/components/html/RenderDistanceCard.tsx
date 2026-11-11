import type { HorizonSettings } from "../../scene/types";
import { RangeField } from "./controls/RangeField";

type Props = {
  settings: HorizonSettings;
  onChange: (settings: HorizonSettings) => void;
};

/** Atalho na tela dos dois cortes de edifício da aba Horizonte. */
export function RenderDistanceCard({ settings, onChange }: Props) {
  return (
    <div className="pixel bevel-edge w-64 space-y-3 bg-background p-3 pb-4">
      <RangeField
        label="À frente"
        value={settings.distance}
        min={100}
        max={600}
        step={0.1}
        onChange={(distance) => onChange({ ...settings, distance })}
      />
      <RangeField
        label="Atrás da câmera"
        value={settings.backDistance}
        min={10}
        max={600}
        step={0.1}
        onChange={(backDistance) => onChange({ ...settings, backDistance })}
      />
    </div>
  );
}
