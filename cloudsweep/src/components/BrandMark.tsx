"use client";

import { useEffect, useRef, useState } from "react";

// The Harlem Hustle logo lives at public/brand/harlem-hustle.png. Until that file is
// added, fall back to the original CloudSweep mark so nothing shows as broken.
export const BRAND_LOGO = "/brand/harlem-hustle.png";
const FALLBACK = "/logo.svg";

export function BrandMark({ size }: { size: number }) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(BRAND_LOGO);
  // The image can fail before React hydrates, when onError never fires, so check on mount too.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setSrc(FALLBACK);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt="Harlem Hustle"
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      onError={() => setSrc(FALLBACK)}
    />
  );
}
