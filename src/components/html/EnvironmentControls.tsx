import type { EnvironmentSettings } from "../../scene/types";
import { PanelSection } from "./controls/PanelSection";
import { RangeField } from "./controls/RangeField";

type EnvironmentControlsProps = {
  value: EnvironmentSettings;
  onChange: (settings: EnvironmentSettings) => void;
};

export function EnvironmentControls({ value, onChange }: EnvironmentControlsProps) {
  return (
    <PanelSection
      title="Ambiente"
      description="Ajuste a posição da imagem de fundo para alinhar o horizonte com o chão. O brilho das janelas só aparece com o modo noite ligado (menu do usuário)."
    >
      <RangeField
        label="Posição vertical (horizonte)"
        value={value.offsetY}
        min={-0.5}
        max={0.5}
        step={0.005}
        onChange={(offsetY) => onChange({ ...value, offsetY })}
        valueLabel={value.offsetY.toFixed(3)}
      />
      <RangeField
        label="Rotação horizontal"
        value={value.offsetX}
        min={-3.14}
        max={3.14}
        step={0.01}
        onChange={(offsetX) => onChange({ ...value, offsetX })}
        valueLabel={value.offsetX.toFixed(2)}
      />
      <RangeField
        label="Rotação vertical"
        value={value.offsetZ}
        min={-3.14}
        max={3.14}
        step={0.01}
        onChange={(offsetZ) => onChange({ ...value, offsetZ })}
        valueLabel={value.offsetZ.toFixed(2)}
      />
      <RangeField
        label="Brilho das janelas (noite)"
        value={value.windowIntensity}
        min={0}
        max={6}
        step={0.1}
        onChange={(windowIntensity) => onChange({ ...value, windowIntensity })}
        valueLabel={value.windowIntensity.toFixed(1)}
      />
    </PanelSection>
  );
}
