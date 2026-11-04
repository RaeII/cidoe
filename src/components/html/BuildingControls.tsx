import type { BuildingSettings } from "../../scene/types";
import { ColorField } from "./controls/ColorField";
import { PanelSection } from "./controls/PanelSection";
import { RangeField } from "./controls/RangeField";

type BuildingControlsProps = {
  value: BuildingSettings;
  onChange: (settings: BuildingSettings) => void;
};

export function BuildingControls({ value, onChange }: BuildingControlsProps) {
  return (
    <PanelSection
      title="Edifícios e material"
      description="A cor é aplicada diretamente no material dos edifícios em tempo real."
    >
      <ColorField
        label="Cor dos edifícios"
        value={value.color}
        onChange={(color) => onChange({ ...value, color })}
        placeholder="#d4d4d4"
      />

      <RangeField
        label="Rugosidade"
        value={value.roughness}
        min={0}
        max={1}
        step={0.01}
        valueLabel={value.roughness.toFixed(2)}
        onChange={(roughness) => onChange({ ...value, roughness })}
      />

      <RangeField
        label="Metalness"
        value={value.metalness}
        min={0}
        max={1}
        step={0.01}
        valueLabel={value.metalness.toFixed(2)}
        onChange={(metalness) => onChange({ ...value, metalness })}
      />
    </PanelSection>
  );
}
