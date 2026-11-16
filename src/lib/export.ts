import "server-only";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

/** CSV cell escaping, with formula-injection protection for spreadsheet apps. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function fileResponse(body: string | ArrayBuffer, filename: string, type: string) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export interface PdfReport {
  title: string;
  subtitle: string;
  meta: [string, string][];
  headers: string[];
  rows: (string | number)[][];
  summary?: [string, string][];
  footnote?: string;
  columnStyles?: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number | "auto" | "wrap" }>;
}

/** Clean, printable A4 report used for timesheets and expenses. */
export function renderPdf(r: PdfReport): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: r.headers.length > 7 ? "landscape" : "portrait" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 40;
  const blue: [number, number, number] = [47, 111, 235];

  doc.setFillColor(...blue);
  doc.roundedRect(margin, margin - 4, 22, 22, 5, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("A", margin + 7, margin + 11.5);
  doc.setTextColor(20, 24, 33);
  doc.setFontSize(11);
  doc.text("Apprentice OS", margin + 30, margin + 11.5);

  doc.setFontSize(18);
  doc.text(r.title, margin, margin + 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 108, 122);
  doc.text(r.subtitle, margin, margin + 70);

  let y = margin + 92;
  doc.setFontSize(9);
  for (const [k, v] of r.meta) {
    doc.setTextColor(100, 108, 122);
    doc.text(k, margin, y);
    doc.setTextColor(20, 24, 33);
    doc.text(v, margin + 110, y);
    y += 14;
  }

  autoTable(doc, {
    startY: y + 8,
    head: [r.headers],
    body: r.rows.map((row) => row.map((c) => String(c))),
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: [20, 24, 33], lineColor: [230, 232, 236], lineWidth: 0.5 },
    headStyles: { fillColor: [244, 246, 249], textColor: [80, 88, 102], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [251, 252, 253] },
    columnStyles: r.columnStyles,
  });

  let after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  if (r.summary?.length) {
    after += 20;
    if (after > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      after = margin;
    }
    doc.setFontSize(10);
    for (const [k, v] of r.summary) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 108, 122);
      doc.text(k, w - margin - 200, after);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 24, 33);
      doc.text(v, w - margin, after, { align: "right" });
      after += 16;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 146, 158);
    const h = doc.internal.pageSize.getHeight();
    if (r.footnote) doc.text(r.footnote, margin, h - 24, { maxWidth: w - margin * 2 - 60 });
    doc.text(`Page ${i} of ${pages}`, w - margin, h - 24, { align: "right" });
  }
  return doc.output("arraybuffer");
}
