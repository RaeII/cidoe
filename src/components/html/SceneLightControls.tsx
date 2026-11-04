import type { LightSettings } from "../../scene/types";
import { ColorField } from "./controls/ColorField";
import { PanelSection } from "./controls/PanelSection";

type SceneLightControlsProps = {
  value: LightSettings;
  metrics: {
    ambientDynamic: number;
    ambientTotal: number;
  };
  onChange: (settings: LightSettings) => void;
};

export function SceneLightControls({
  value,
  metrics,
  onChange,
}: SceneLightControlsProps) {
  return (
    <PanelSection
      title="Luzes da cena"
      description="Ambient total = ambient dinâmico + ambient extra da cena."
    >
      <div className="bg-card p-3 font-mono text-xs leading-5 text-muted-foreground">
        <div>Ambient dinâmico: {metrics.ambientDynamic.toFixed(2)}</div>
        <div>Ambient extra: {value.ambientExtraIntensity.toFixed(2)}</div>
        <div>Ambient total aplicado: {metrics.ambientTotal.toFixed(2)}</div>
      </div>

      <ColorField
        label="Cor do ambient"
        value={value.ambientColor}
        onChange={(ambientColor) => onChange({ ...value, ambientColor })}
      />

      <label className="block">
        <span className="mono-label mb-2 block text-foreground">Ambient extra da cena</span>
        <input
          type="number"
          step="0.1"
          value={value.ambientExtraIntensity}
          onChange={(event) =>
            onChange({ ...value, ambientExtraIntensity: Number(event.target.value) })
          }
          className="field h-8 w-full px-2 text-sm"
        />
      </label>
    </PanelSection>
  );
}
