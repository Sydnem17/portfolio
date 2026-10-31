// Admission-ticket keepsake for a double bill, drawn on a canvas and exported as a PNG.
// A personal souvenir, not a booking or a promise of streaming access.

export interface TicketData {
  first: { title: string; year: number };
  second: { title: string; year: number };
  note: string;
  date?: string;
  totalMinutes: number | null;
}

const W = 1600;
const H = 720;
const INK = '#0f1b3d';
const CHERRY = '#c41230';
const COBALT = '#1d58d6';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family: string) {
  let size = max;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > width && size > min) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export function formatTicketDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export async function drawTicket(canvas: HTMLCanvasElement, data: TicketData): Promise<void> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* fonts optional */
  }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  const display = "'Inter Tight Variable', 'Inter Tight', system-ui, sans-serif";
  const body = "'Inter Variable', 'Inter', system-ui, sans-serif";

  // Background and ticket shape with notches.
  ctx.fillStyle = '#eef1f6';
  ctx.fillRect(0, 0, W, H);
  const x = 40;
  const y = 40;
  const w = W - 80;
  const h = H - 80;
  const stub = 300;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 28);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15,27,61,0.16)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#eef1f6';
  for (const cy of [y, y + h]) {
    ctx.beginPath();
    ctx.arc(x + w - stub, cy, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Perforation
  ctx.strokeStyle = '#cfd5e1';
  ctx.lineWidth = 4;
  ctx.setLineDash([2, 14]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w - stub, y + 40);
  ctx.lineTo(x + w - stub, y + h - 40);
  ctx.stroke();
  ctx.setLineDash([]);

  // Left accent bar
  ctx.fillStyle = CHERRY;
  ctx.beginPath();
  ctx.roundRect(x, y, 22, h, [28, 0, 0, 28]);
  ctx.fill();

  const left = x + 80;
  const mainWidth = w - stub - 140;
  ctx.fillStyle = CHERRY;
  ctx.font = `700 26px ${body}`;
  ctx.fillText('TARYN’S MOVIE CLUB  ·  DOUBLE BILL', left, y + 82);

  const films = [data.first, data.second];
  let ty = y + 190;
  films.forEach((f, i) => {
    ctx.fillStyle = COBALT;
    ctx.font = `800 30px ${display}`;
    ctx.fillText(i === 0 ? 'FIRST' : 'THEN', left, ty - 4);
    const label = `${f.title}`;
    const size = fit(ctx, label, 800, 76, 40, mainWidth - 150, display);
    ctx.fillStyle = INK;
    ctx.font = `800 ${size}px ${display}`;
    ctx.fillText(label, left + 120, ty);
    ctx.fillStyle = '#586179';
    ctx.font = `600 28px ${body}`;
    ctx.fillText(String(f.year), left + 122, ty + 42);
    ty += 140;
  });

  ctx.fillStyle = '#2c3756';
  ctx.font = `italic 400 28px ${body}`;
  const lines = wrap(ctx, data.note, mainWidth).slice(0, 3);
  lines.forEach((l, i) => ctx.fillText(l, left, ty + 10 + i * 40));

  ctx.fillStyle = '#8a92a6';
  ctx.font = `500 20px ${body}`;
  ctx.fillText('A personal film-night keepsake. Not a cinema booking or a guarantee of streaming access.', left, y + h - 40);

  // Stub
  const sx = x + w - stub + 40;
  ctx.save();
  ctx.translate(sx + 30, y + h - 60);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = INK;
  ctx.font = `900 64px ${display}`;
  ctx.fillText('ADMIT ONE', 0, 0);
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.font = `700 22px ${body}`;
  const date = formatTicketDate(data.date);
  const stubText = [
    date ? 'DATE' : '',
    date ?? '',
    data.totalMinutes != null ? 'EVENING' : '',
    data.totalMinutes != null ? `${Math.floor(data.totalMinutes / 60)} hr ${data.totalMinutes % 60} min` : '',
  ].filter(Boolean);
  let syy = y + 90;
  const stubLeft = sx + 100;
  stubText.forEach((t, i) => {
    const isLabel = t === 'DATE' || t === 'EVENING';
    ctx.fillStyle = isLabel ? CHERRY : INK;
    ctx.font = isLabel ? `700 18px ${body}` : `600 24px ${body}`;
    for (const l of wrap(ctx, t, stub - 130)) {
      ctx.fillText(l, stubLeft, syy);
      syy += isLabel ? 30 : 34;
    }
    if (!isLabel && i < stubText.length - 1) syy += 18;
  });
  // Seat-style serial
  ctx.fillStyle = '#8a92a6';
  ctx.font = `600 18px ${body}`;
  ctx.fillText('ORDER: 1 → 2', stubLeft, y + h - 50);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
}

export function ticketFileName(a: string, b: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `double-bill-${slug(a)}-and-${slug(b)}.png`;
}
