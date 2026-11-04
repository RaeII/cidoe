type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  valueLabel?: string;
};

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
}: RangeFieldProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="mono-label text-foreground">{label}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {valueLabel ?? value.toString()}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </label>
  );
}
