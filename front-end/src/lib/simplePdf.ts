// Minimal dependency-free PDF generator (text only).
// Produces a one-page PDF using a built-in Helvetica font.
// This avoids bringing in heavy libraries for a small "Download PDF" feature.

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function escapePdfText(s: string) {
  // escape backslash and parentheses for PDF literal strings
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function wrapLines(text: string, maxChars = 90): string[] {
  const out: string[] = [];
  const paras = String(text || "").split(/\n/);
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (next.length <= maxChars) {
        line = next;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

export function buildSimplePdf(lines: string[], opts?: { title?: string }): Uint8Array {
  const pageWidth = 612; // letter
  const pageHeight = 792;

  const title = opts?.title?.trim();
  const all: string[] = [];
  if (title) {
    all.push(title);
    all.push("");
  }
  for (const l of lines) all.push(...wrapLines(l, 92));

  const fontSize = 12;
  const leading = 14;
  const marginLeft = 48;
  const startY = 760;
  const maxLines = Math.floor((startY - 48) / leading);
  const trimmed = all.slice(0, clamp(all.length, 0, maxLines));

  const textOps: string[] = [];
  textOps.push("BT");
  textOps.push(`/F1 ${fontSize} Tf`);
  textOps.push(`${marginLeft} ${startY} Td`);
  for (let i = 0; i < trimmed.length; i++) {
    const line = escapePdfText(trimmed[i] ?? "");
    if (i > 0) textOps.push(`0 -${leading} Td`);
    textOps.push(`(${line}) Tj`);
  }
  textOps.push("ET");
  const stream = textOps.join("\n");

  // --- Build PDF objects
  const objects: string[] = [];
  objects.push("%PDF-1.4\n");

  // 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // 3: Page
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Font
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  // 5: Content stream
  const streamBytes = new TextEncoder().encode(stream);
  objects.push(
    `5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  );

  // xref offsets
  let offset = 0;
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(offset);
    offset += new TextEncoder().encode(obj).length;
  }

  // xref table
  const xrefStart = offset;
  let xref = "xref\n0 6\n";
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    const off = offsets[i + 1];
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const full = objects.join("") + xref + trailer;
  return new TextEncoder().encode(full);
}

export function downloadPdf(filename: string, bytes: Uint8Array) {
  // TS can be strict about Uint8Array buffers being ArrayBuffer vs SharedArrayBuffer.
  // Slice into a real ArrayBuffer for Blob compatibility.
  const ab = (bytes.buffer as any).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
