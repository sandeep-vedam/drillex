import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportDoc } from './report-types';

@Injectable()
export class ReportRendererService {
  async xlsx(doc: ReportDoc): Promise<Buffer> {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Drillex Ops';
    const s = wb.addWorksheet('Summary');
    s.addRow([doc.title]).font = { bold: true, size: 16 }; s.addRow([doc.subtitle]); s.addRow([`Generated ${doc.generatedAt.toISOString()}`]); s.addRow([]);
    s.addRow(['KPI', 'Value', 'Note']).font = { bold: true };
    doc.kpis.forEach((k) => s.addRow([k.label, k.value, k.hint ?? '']));
    s.columns = [{ width: 32 }, { width: 20 }, { width: 30 }];
    for (const sec of doc.sections) {
      const ws = wb.addWorksheet(sec.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
      const head = ws.addRow(sec.columns); head.font = { bold: true, color: { argb: 'FFFFFFFF' } }; head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132B4A' } }; });
      sec.rows.forEach((r) => ws.addRow(r));
      ws.columns = sec.columns.map((c, i) => ({ width: Math.min(50, Math.max(12, c.length + 4, ...sec.rows.slice(0, 50).map((r) => String(r[i] ?? '').length + 2))) }));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      if (sec.note) ws.addRow([]).getCell(1).value = sec.note;
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  pdf(doc: ReportDoc): Promise<Buffer> {
    return new Promise((resolve) => {
      const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: doc.title, Author: 'Drillex Ops' } });
      const chunks: Buffer[] = []; pdf.on('data', (c) => chunks.push(c)); pdf.on('end', () => resolve(Buffer.concat(chunks)));
      const W = pdf.page.width - 72; const navy = '#132B4A'; const hazard = '#E06A10';
      const header = () => { pdf.rect(36, 24, W, 4).fill(hazard); pdf.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('DRILLEX OPS', 36, 34); pdf.fillColor('#5B6877').font('Helvetica').fontSize(8).text(`${doc.title} · ${doc.subtitle}`, 36, 34, { width: W, align: 'right' }); pdf.moveDown(1.5); };
      header();
      pdf.fillColor(navy).font('Helvetica-Bold').fontSize(20).text(doc.title, 36, 56); pdf.fillColor('#5B6877').font('Helvetica').fontSize(10).text(`${doc.subtitle} · generated ${doc.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      // KPI tiles
      let y = pdf.y + 10; const tw = (W - 12 * (doc.kpis.length - 1)) / Math.max(1, doc.kpis.length);
      doc.kpis.forEach((k, i) => { const x = 36 + i * (tw + 12); pdf.rect(x, y, tw, 54).fillAndStroke('#F2F5F9', '#D6DEE8'); pdf.rect(x, y, 3, 54).fill(navy); pdf.fillColor('#5B6877').font('Helvetica-Bold').fontSize(7).text(k.label.toUpperCase(), x + 10, y + 8, { width: tw - 14, characterSpacing: 0.8 }); pdf.fillColor('#18232F').font('Helvetica-Bold').fontSize(18).text(String(k.value), x + 10, y + 20, { width: tw - 14 }); if (k.hint) pdf.fillColor('#5B6877').font('Helvetica').fontSize(7).text(k.hint, x + 10, y + 42, { width: tw - 14 }); });
      y += 70; pdf.y = y;
      for (const sec of doc.sections) {
        if (pdf.y > pdf.page.height - 120) { pdf.addPage(); header(); pdf.y = 60; }
        pdf.fillColor(navy).font('Helvetica-Bold').fontSize(12).text(sec.title, 36, pdf.y + 6); pdf.moveDown(0.4);
        const colW = W / Math.max(1, sec.columns.length); let rowY = pdf.y;
        const drawHead = () => { pdf.rect(36, rowY, W, 16).fill(navy); sec.columns.forEach((c, i) => pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(c.toUpperCase(), 40 + i * colW, rowY + 4.5, { width: colW - 8, ellipsis: true, lineBreak: false })); rowY += 16; };
        drawHead();
        if (!sec.rows.length) { pdf.fillColor('#5B6877').font('Helvetica-Oblique').fontSize(8).text('No data for this period.', 40, rowY + 4); rowY += 18; }
        sec.rows.forEach((r, ri) => { if (rowY > pdf.page.height - 50) { pdf.addPage(); header(); rowY = 60; drawHead(); } if (ri % 2) pdf.rect(36, rowY, W, 14).fill('#F6F8FB'); r.forEach((v, i) => pdf.fillColor('#18232F').font(typeof v === 'number' ? 'Helvetica' : 'Helvetica').fontSize(8).text(v == null ? '' : String(v), 40 + i * colW, rowY + 3.5, { width: colW - 8, ellipsis: true, lineBreak: false, align: typeof v === 'number' ? 'right' : 'left' })); rowY += 14; });
        if (sec.note) { pdf.fillColor('#5B6877').font('Helvetica-Oblique').fontSize(7.5).text(sec.note, 36, rowY + 3); rowY += 14; }
        pdf.y = rowY + 8;
      }
      const pages = pdf.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) { pdf.switchToPage(i); pdf.fillColor('#97A6B6').font('Helvetica').fontSize(7).text(`CONFIDENTIAL — Drillex Ops · Internal use only · page ${i + 1} of ${pages.count}`, 36, pdf.page.height - 26, { width: W, align: 'center', lineBreak: false }); }
      pdf.end();
    });
  }
}
