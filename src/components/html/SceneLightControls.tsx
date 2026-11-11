import { DEFAULT_LIGHT_SETTINGS } from "../../scene/config/lightConfig";
import type { LightSettings } from "../../scene/types";
import { CheckboxField } from "./controls/CheckboxField";
import { ColorField } from "./controls/ColorField";
import { PanelSection } from "./controls/PanelSection";
import { RangeField } from "./controls/RangeField";

type SceneLightControlsProps = {
  value: LightSettings;
  metrics: {
    ambientDynamic: number;
    ambientTotal: number;
  };
  onChange: (settings: LightSettings) => void;
  /** Mesmo `ReflectionSettings.enabled` da aba Reflexo. */
  reflectionEnabled: boolean;
  onReflectionEnabledChange: (enabled: boolean) => void;
};

export function SceneLightControls({
  value,
  metrics,
  onChange,
  reflectionEnabled,
  onReflectionEnabledChange,
}: SceneLightControlsProps) {
  // Estado salvo antes dos campos existirem vem sem eles.
  const sun = value.directionalIntensity ?? DEFAULT_LIGHT_SETTINGS.directionalIntensity;
  const sunOn = value.directionalEnabled ?? false;
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

      <CheckboxField
        label="Reflexo ativo"
        checked={reflectionEnabled}
        onChange={onReflectionEnabledChange}
      />
      <CheckboxField
        label="Luz do LED nos vizinhos"
        checked={value.ledSpillEnabled ?? true}
        onChange={(ledSpillEnabled) => onChange({ ...value, ledSpillEnabled })}
      />

      <CheckboxField
        label="Luz do sol"
        checked={sunOn}
        onChange={(directionalEnabled) =>
          onChange({ ...value, directionalEnabled, directionalIntensity: sun })
        }
      />
      {sunOn && (
        <>
          <RangeField
            label="Intensidade do sol"
            value={sun}
            min={0.5}
            max={20}
            step={0.5}
            onChange={(directionalIntensity) => onChange({ ...value, directionalIntensity })}
            valueLabel={sun.toFixed(1)}
          />
          <RangeField
            label="Direção do sol"
            value={value.directionalAzimuth}
            min={-360}
            max={360}
            step={1}
            onChange={(directionalAzimuth) => onChange({ ...value, directionalAzimuth })}
            valueLabel={`${value.directionalAzimuth}°`}
          />
          <RangeField
            label="Altura do sol"
            value={value.directionalElevation}
            min={5}
            max={90}
            step={1}
            onChange={(directionalElevation) => onChange({ ...value, directionalElevation })}
            valueLabel={`${value.directionalElevation}°`}
          />
        </>
      )}
    </PanelSection>
  );
}
