import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Source } from '../data/types';
import { Icon } from './Icon';

/**
 * Modal dialog on the native <dialog> element: focus is contained, Escape closes it,
 * and focus returns to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const autoId = useId();
  const titleId = labelledBy ?? `dlg-${autoId}`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      // Focus the first field or control rather than the close button.
      const first = d.querySelector<HTMLElement>('[data-autofocus], .dialog-body input, .dialog-body button, .dialog-body a');
      first?.focus();
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
      const o = opener.current as HTMLElement | null;
      if (o && document.contains(o)) o.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      style={wide ? { width: 'min(980px, calc(100vw - 24px))' } : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-inner">
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function RadioGroup<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
  hideLegend,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hideLegend?: boolean;
}) {
  return (
    <fieldset className="segmented">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      {options.map((o) => (
        <label className="choice" key={String(o.value)}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function SourceList({ sources, summary = 'Sources' }: { sources: Source[]; summary?: string }) {
  if (!sources.length) return null;
  return (
    <details className="sources">
      <summary>
        {summary} ({sources.length})
      </summary>
      <ul>
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>{' '}
            <span className="muted">for {s.supports.join(', ')}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
