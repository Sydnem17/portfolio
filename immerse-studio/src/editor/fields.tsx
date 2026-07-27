import React, { useId } from 'react';

/**
 * Plain-language form primitives. Every field has a real <label>, an
 * optional hint wired up via aria-describedby, and no jargon — the editor
 * itself is held to ATAG Part A.
 */

export function TextField({
  label,
  value,
  onChange,
  hint,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="ed-field">
      <label htmlFor={id}>
        {label}
        {required && <span className="ed-req"> (required)</span>}
      </label>
      {hint && <p className="ed-hint" id={`${id}-hint`}>{hint}</p>}
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="ed-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="ed-hint" id={`${id}-hint`}>{hint}</p>}
      <textarea
        id={id}
        rows={rows}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="ed-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="ed-hint" id={`${id}-hint`}>{hint}</p>}
      <select id={id} value={value} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="ed-field ed-field-check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{label}</label>
      {hint && <p className="ed-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="ed-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="ed-hint" id={`${id}-hint`}>{hint}</p>}
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="ed-row">{children}</div>;
}

export function MiniButton({
  children,
  onClick,
  tone = 'normal',
  ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'normal' | 'danger' | 'primary';
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ed-mini ed-mini-${tone}`}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
