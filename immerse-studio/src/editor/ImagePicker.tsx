import React, { useId, useRef, useState } from 'react';

/**
 * One image control everywhere: paste a URL or upload a file. Uploads are
 * embedded as data URIs so exports stay fully self-contained — nothing to
 * host, nothing to break when the course moves between systems.
 */
const WARN_BYTES = 1.5 * 1024 * 1024;

export function ImagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (src: string) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setNote('That file is not an image.');
      return;
    }
    if (file.size > WARN_BYTES) {
      setNote(
        `Heads up: this image is ${(file.size / 1024 / 1024).toFixed(1)} MB. It will work, but big images make big course files — consider resizing it first.`
      );
    } else {
      setNote(null);
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  const isData = value.startsWith('data:');

  return (
    <div className="ed-field">
      <label htmlFor={id}>{label}</label>
      <div className="ed-imagepicker">
        <input
          id={id}
          type="text"
          placeholder="Paste an image address, or upload →"
          value={isData ? '(uploaded image)' : value}
          readOnly={isData}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="ed-mini ed-mini-primary" onClick={() => fileRef.current?.click()}>
          Upload…
        </button>
        {value && (
          <button type="button" className="ed-mini ed-mini-danger" onClick={() => { onChange(''); setNote(null); }}>
            Clear
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="ip-visually-hidden"
        aria-label={`Upload file for ${label}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {note && <p className="ed-hint" role="status">{note}</p>}
      {value && <img className="ed-image-thumb" src={value} alt="" />}
    </div>
  );
}
