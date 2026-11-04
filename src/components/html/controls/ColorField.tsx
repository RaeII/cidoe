type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function ColorField({ label, value, onChange, placeholder }: ColorFieldProps) {
  return (
    <label className="block">
      <span className="mono-label mb-2 block text-foreground">{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field h-8 min-w-0 flex-1 px-2 text-sm"
        />
      </div>
    </label>
  );
}
