type NumberFieldProps = {
  label: string;
  value: number | string;
  onChange?: (value: number) => void;
  step?: number;
  readOnly?: boolean;
};

export function NumberField({
  label,
  value,
  onChange,
  step,
  readOnly = false,
}: NumberFieldProps) {
  return (
    <label className="block">
      <span className="mono-label mb-2 block text-foreground">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        readOnly={readOnly}
        onChange={
          onChange
            ? (event) => {
                onChange(Number(event.target.value));
              }
            : undefined
        }
        className="field h-8 w-full px-2 text-sm read-only:text-muted-foreground"
      />
    </label>
  );
}
