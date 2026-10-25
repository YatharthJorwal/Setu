interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  name: string;
  legend: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
}

/** A radio group drawn as a segmented control. Native radios underneath, so keyboard and screen readers work. */
export function Segmented<T extends string>({ name, legend, options, value, onChange }: Props<T>) {
  return (
    <fieldset className="field-group">
      <legend className="field-label">{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value} className="segment">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
