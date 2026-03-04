import { PageData, StampData, AppMode } from "../types";
import { getUniformLabelFontSizeCqw } from "./stampUtils";
import { PDFDocument, rgb, StandardFonts, PDFName, degrees, PDFPage } from 'pdf-lib';

const sanitizeText = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/\u00A0/g, " ") 
    .replace(/[\u2018\u2019]/g, "'") 
    .replace(/[\u201C\u201D]/g, '"') 
    .replace(/\u2013/g, "-") 
    .replace(/\u2014/g, "--") 
    .replace(/\u2026/g, "...") 
    .replace(/[^\x20-\x7FàèéìòùÀÈÉÌÒÙçÇ€\r\n]/g, ""); 
};

const safeNum = (n: any, fallback = 0): number => {
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    return fallback;
};

const safeDim = (n: any, min = 0.1, fallback = 10): number => {
    const val = safeNum(n, fallback);
    return Math.max(min, val);
};

export const convertPdfToImages = async (input: File | ArrayBuffer): Promise<PageData[]> => {
  const originalBuffer = input instanceof File ? await input.arrayBuffer() : input;
  const bufferCopy = originalBuffer.slice(0);
  const data = new Uint8Array(bufferCopy);
  
  if (!window.pdfjsLib) {
    throw new Error("PDF.js library not loaded");
  }

  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const numPages = pdf.numPages;
  const pages: PageData[] = [];

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); 
      
      let baseFontSize = 14; 
      try {
        const textContent = await page.getTextContent();
        const fontSizes: Record<number, number> = {};
        for (const item of textContent.items) {
           const h = Math.abs(item.height || item.transform[3]);
           if (h > 0 && Number.isFinite(h)) {
             const rounded = Math.round(h * 10) / 10;
             fontSizes[rounded] = (fontSizes[rounded] || 0) + 1;
           }
        }
        let maxCount = 0; let modeSize = 10; 
        for (const sizeStr in fontSizes) {
            const size = Number(sizeStr);
            if (fontSizes[size] > maxCount) { maxCount = fontSizes[size]; modeSize = size; }
        }
        const pdfPageHeight = (page.view[3] - page.view[1]) || viewport.height / 2;
        if (pdfPageHeight > 0 && Number.isFinite(pdfPageHeight)) {
             const calculated = (modeSize / pdfPageHeight) * 1000;
             if (Number.isFinite(calculated) && calculated > 5 && calculated < 50) baseFontSize = calculated;
        }
      } catch (err) { baseFontSize = 14; }

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        pages.push({
          pageNumber: i,
          imageUrl: canvas.toDataURL('image/png'),
          width: viewport.width,
          height: viewport.height,
          baseFontSize: baseFontSize,
          stamps: [], 
        });
      }
    } catch (e) { break; }
  }
  return pages;
};

export const convertPdfToImagesProgressive = async (
  input: File | ArrayBuffer,
  onPage?: (page: PageData, index: number, total: number) => void
): Promise<PageData[]> => {
  const originalBuffer = input instanceof File ? await input.arrayBuffer() : input;
  const bufferCopy = originalBuffer.slice(0);
  const data = new Uint8Array(bufferCopy);
  if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const numPages = pdf.numPages;
  const pages: PageData[] = [];
  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      let baseFontSize = 14;
      try {
        const textContent = await page.getTextContent();
        const fontSizes: Record<number, number> = {};
        for (const item of textContent.items) {
          const h = Math.abs(item.height || item.transform[3]);
          if (h > 0 && Number.isFinite(h)) {
            const rounded = Math.round(h * 10) / 10;
            fontSizes[rounded] = (fontSizes[rounded] || 0) + 1;
          }
        }
        let maxCount = 0; let modeSize = 10;
        for (const sizeStr in fontSizes) {
          const size = Number(sizeStr);
          if (fontSizes[size] > maxCount) { maxCount = fontSizes[size]; modeSize = size; }
        }
        const pdfPageHeight = (page.view[3] - page.view[1]) || viewport.height / 2;
        if (pdfPageHeight > 0 && Number.isFinite(pdfPageHeight)) {
          const calculated = (modeSize / pdfPageHeight) * 1000;
          if (Number.isFinite(calculated) && calculated > 5 && calculated < 50) baseFontSize = calculated;
        }
      } catch (err) { baseFontSize = 14; }
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      if (context) {
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const pd: PageData = {
          pageNumber: i,
          imageUrl: canvas.toDataURL('image/png'),
          width: viewport.width,
          height: viewport.height,
          baseFontSize,
          stamps: [],
        };
        pages.push(pd);
        if (onPage) onPage(pd, i - 1, numPages);
        await Promise.resolve();
      }
    } catch (e) { break; }
  }
  return pages;
};

export const extractStampDataFromPdf = async (input: File | ArrayBuffer): Promise<Record<number, StampData[]> | null> => {
    try {
        const arrayBuffer = input instanceof File ? await input.arrayBuffer() : input;
        const bufferCopy = arrayBuffer.slice(0);
        const pdfDoc = await PDFDocument.load(bufferCopy, { ignoreEncryption: true });
        const subject = pdfDoc.getSubject();

        if (subject && subject.startsWith('RFI_META:::')) {
            const jsonStr = subject.replace('RFI_META:::', '');
            const data = JSON.parse(jsonStr);
            const result: Record<number, StampData[]> = {};
            Object.keys(data).forEach(key => {
                const k = Number(key);
                if (Array.isArray(data[k])) {
                    result[k] = data[k];
                } else if (data[k]) {
                    result[k] = [data[k]];
                }
            });
            return result;
        }
    } catch (e) {
        console.warn("No compatible stamp metadata found or error parsing.", e);
    }
    return null;
};

export const savePdfWithAnnotations = async (
    sourcePdf: File | ArrayBuffer, 
    pages: PageData[], 
    mode: AppMode,
    doitSignatureUrl?: string
): Promise<Uint8Array> => {
  const arrayBuffer = sourcePdf instanceof File ? await sourcePdf.arrayBuffer() : sourcePdf;
  const bufferCopy = arrayBuffer.slice(0);

  // 1. Carichiamo il documento originale
  const originalPdf = await PDFDocument.load(bufferCopy, { ignoreEncryption: true });

  // Aggiungiamo flattening preliminare anche per SEGRETERIA (oltre che per Dirigente che lo fa alla fine)
  // Questo assicura che il documento di base sia "chiuso" prima di lavorarci sopra.
  if (mode === 'segreteria') {
      try {
          const form = originalPdf.getForm();
          form.flatten();
      } catch (e) {
          // Ignoriamo l'errore se non ci sono form da appiattire
      }
  }
  
  // 2. Creiamo un NUOVO documento vergine che farà da base
  const pdfDoc = await PDFDocument.create();

  // 3. Copiamo tutte le pagine dall'originale al nuovo documento (Embedding)
  //    Questa operazione "stampa" digitalmente il contenuto, risolvendo rotazioni e glitch.
  const pageIndices = originalPdf.getPageIndices();
  const copiedPages = await pdfDoc.copyPages(originalPdf, pageIndices);
  
  copiedPages.forEach((page) => {
      pdfDoc.addPage(page);
  });
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pdfPages = pdfDoc.getPages();
  const metaPayload: Record<number, StampData[]> = {};

  for (let index = 0; index < pages.length; index++) {
    if (index >= pdfPages.length) continue;
    const pageData = pages[index];
    const pdfPage = pdfPages[index];
    
    // Le dimensioni e rotazioni sono ora quelle della pagina "stampata" nel nuovo doc
    const { width, height } = pdfPage.getSize();
    const rotation = pdfPage.getRotation().angle;
    
    const cropBox = pdfPage.getCropBox() || pdfPage.getMediaBox();
    const offsetX = cropBox.x || 0;
    const offsetY = cropBox.y || 0;

    if (pageData.stamps && pageData.stamps.length > 0) {
      metaPayload[index] = pageData.stamps;
      const stampsOrdered = [...pageData.stamps].sort((a, b) => {
        const order = (s: any) => (s.type === 'FREE_TEXT' || s.type === 'FREE_CHECK') ? 3 : (s.type === 'SIGNATURE' ? 1 : 0);
        return order(a) - order(b);
      });

      // Fase 1: Sfondi e Highlighter (Highlighter sopra gli sfondi bianchi, ma sotto la struttura rossa)
      for (const stamp of stampsOrdered) {
        try {
            await drawStampOnPage(
                pdfDoc, 
                pdfPage, 
                stamp, 
                width, 
                height,
                offsetX,
                offsetY,
                rotation,
                helveticaBold, 
                helveticaRegular, 
                mode,
                doitSignatureUrl,
                false, // onlyStructure
                false, // onlyContent
                true  // onlyHighlighter - ABILITATO ANCHE PER DIRIGENTE (MA GESTITO INTERNAMENTE PER EVITARE MOSAICO)
            );
        } catch (e) {
            console.error("Error drawing stamp highlighter on page " + index, e);
        }
      }

      // Fase 2: Struttura Rossa (Sopra gli highlighter)
      for (const stamp of stampsOrdered) {
        try {
            await drawStampOnPage(
                pdfDoc, 
                pdfPage, 
                stamp, 
                width, 
                height,
                offsetX,
                offsetY,
                rotation,
                helveticaBold, 
                helveticaRegular, 
                mode,
                doitSignatureUrl,
                true, // onlyStructure - ABILITATO SEMPRE (anche per Dirigente, per stare sopra l'highlighter)
                false, // onlyContent
                false // onlyHighlighter
            );
        } catch (e) {
            console.error("Error drawing stamp structure on page " + index, e);
        }
      }

      // Fase 3: Contenuto Finale (Testo, Spunte, Firme)
      for (const stamp of stampsOrdered) {
        try {
            await drawStampOnPage(
                pdfDoc, 
                pdfPage, 
                stamp, 
                width, 
                height,
                offsetX,
                offsetY,
                rotation,
                helveticaBold, 
                helveticaRegular, 
                mode,
                doitSignatureUrl,
                false, // onlyStructure
                true,  // onlyContent
                false // onlyHighlighter
            );
        } catch (e) {
            console.error("Error drawing stamp content on page " + index, e);
        }
      }
    }
  }

  if (Object.keys(metaPayload).length > 0 && mode !== 'dirigente') {
      try {
        pdfDoc.setSubject('RFI_META:::' + JSON.stringify(metaPayload));
      } catch (e) { console.warn("Could not inject metadata", e); }
  }

  // Se siamo in modalità DIRIGENTE, proviamo ad appiattire eventuali form residui
  // Nota: Con l'embedding (copyPages) i form solitamente vengono persi o resi inattivi,
  // ma questo passaggio garantisce che il risultato sia "chiuso" se per caso fossero stati copiati.
  if (mode === 'dirigente') {
      try {
          const form = pdfDoc.getForm();
          form.flatten();
      } catch (e) { 
          // Ignoriamo l'errore se non ci sono form da appiattire
      }
      
      // PULIZIA TOTALE DEI METADATI (Richiesta specifica: "TOGLIERE TUTTI I MARKER")
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
  }

  return await pdfDoc.save();
};

const breakTextIntoLines = (text: string, fontSize: number, maxWidth: number, font: any): string[] => {
    const paragraphs = text.split('\n');
    const lines: string[] = [];

    paragraphs.forEach(paragraph => {
        const words = paragraph.split(' ');
        let currentLine = '';

        words.forEach(word => {
            let wordWidth = 0;
            try { wordWidth = font.widthOfTextAtSize(word, fontSize); } catch { wordWidth = maxWidth + 1; }

            if (wordWidth > maxWidth) {
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = '';
                }
                let tempWord = '';
                for (let i = 0; i < word.length; i++) {
                    const char = word[i];
                    const testWithChar = tempWord + char;
                    if (font.widthOfTextAtSize(testWithChar, fontSize) <= maxWidth) {
                        tempWord = testWithChar;
                    } else {
                        lines.push(tempWord);
                        tempWord = char;
                    }
                }
                currentLine = tempWord;
            } else {
                const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
                let testWidth = 0;
                try { testWidth = font.widthOfTextAtSize(testLine, fontSize); } catch { testWidth = maxWidth + 1; }

                if (testWidth <= maxWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine.length > 0) lines.push(currentLine);
                    currentLine = word;
                }
            }
        });
        if (currentLine.length > 0) lines.push(currentLine);
    });

    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    return lines;
};

const drawStampOnPage = async (
  pdfDoc: PDFDocument,
  pdfPage: PDFPage, 
  stamp: StampData, 
  mediaBoxWidth: number, 
  mediaBoxHeight: number,
  offsetX: number,
  offsetY: number,
  rotation: number,
  fontBold: any,
  fontRegular: any,
  mode: AppMode,
  doitSignatureUrl?: string,
  onlyStructure: boolean = false,
  onlyContent: boolean = false,
  onlyHighlighter: boolean = false
) => {
  if ((onlyStructure || onlyHighlighter) && (stamp.type === 'SIGNATURE' || stamp.type === 'FREE_CHECK')) {
      return;
  }

  const isDirigente = mode === 'dirigente';
  const isFixedStamp = ['DOIT_VE', 'INGEGNERIA_VE', 'UT_NORD', 'UT_SUD_VE'].includes(stamp.type);
  
  const hideStructure = onlyContent; 
  const useHalo = true;
  
  const isSwapped = rotation % 180 !== 0;
  const visualPageWidth = isSwapped ? mediaBoxHeight : mediaBoxWidth;
  const visualPageHeight = isSwapped ? mediaBoxWidth : mediaBoxHeight;

  const safeVisualWidth = safeDim(visualPageWidth, 1, 600);
  const safeVisualHeight = safeDim(visualPageHeight, 1, 800);

  const normX = safeNum(stamp.x, 0);
  const normY = safeNum(stamp.y, 0);
  const normW = safeNum(stamp.width, 100);
  const normH = safeNum(stamp.height, 100);

  const visualStampX = (normX / 1000) * safeVisualWidth;
  const visualStampW = (normW / 1000) * safeVisualWidth;
  const visualStampH = (normH / 1000) * safeVisualHeight;
  const visualStampYBottom = safeVisualHeight - ((normY / 1000) * safeVisualHeight) - visualStampH;

  if (visualStampW <= 2 || visualStampH <= 2) return;

  const WHITE_COLOR = rgb(1, 1, 1);
  const RED_COLOR = rgb(0.77, 0.05, 0.19);
  const BLACK_COLOR = rgb(0, 0, 0);

  const applyTransform = (vx: number, vy: number, vw: number, vh: number) => {
      let rx = vx; let ry = vy; let angle = degrees(0);
      if (rotation === 0) { rx = vx; ry = vy; } 
      else if (rotation === 90) { rx = mediaBoxWidth - vy; ry = vx; angle = degrees(90); }
      else if (rotation === 180) { rx = mediaBoxWidth - vx; ry = mediaBoxHeight - vy; angle = degrees(180); }
      else if (rotation === 270) { rx = vy; ry = mediaBoxHeight - vx; angle = degrees(270); }
      return { x: rx + offsetX, y: ry + offsetY, width: vw, height: vh, angle };
  };

  const dRect = (x: number, y: number, w: number, h: number, color?: any, borderColor?: any, borderWidth?: number) => {
      const { x: tx, y: ty, angle } = applyTransform(x, y, w, h);
      pdfPage.drawRectangle({
          x: tx, y: ty, width: w, height: h,
          color, borderColor, borderWidth,
          rotate: angle
      });
  };

  const dTextWithHalo = (text: string, x: number, y: number, options: any, haloWidth = 0.6, forceNoHalo = false, forceHalo = false) => {
      const { x: tx, y: ty, angle } = applyTransform(x, y, 0, 0);
      if ((useHalo || forceHalo) && !forceNoHalo) {
          const haloOptions = { ...options, color: WHITE_COLOR, x: tx, y: ty, rotate: angle };
          // Disegna l'alone in più direzioni per un effetto più marcato
          const offsets = [
              { dx: -haloWidth, dy: 0 }, { dx: haloWidth, dy: 0 },
              { dx: 0, dy: -haloWidth }, { dx: 0, dy: haloWidth },
              { dx: -haloWidth, dy: -haloWidth }, { dx: haloWidth, dy: haloWidth },
              { dx: -haloWidth, dy: haloWidth }, { dx: haloWidth, dy: -haloWidth }
          ];
          offsets.forEach(off => {
              pdfPage.drawText(text, { ...haloOptions, x: tx + off.dx, y: ty + off.dy });
          });
      }
      pdfPage.drawText(text, { ...options, x: tx, y: ty, rotate: angle });
  };

  const dImage = async (imgBytes: ArrayBuffer, x: number, y: number, w: number, h: number) => {
       const img = await pdfDoc.embedPng(imgBytes);
       const { x: tx, y: ty, angle } = applyTransform(x, y, w, h);
       pdfPage.drawImage(img, { x: tx, y: ty, width: w, height: h, rotate: angle });
  };

  const dCheckmark = (x: number, y: number, size: number) => {
      const thickness = size * 0.14; 
      
      // Disegniamo la spunta come due rettangoli sottili ruotati o usiamo drawLine
      // Se drawLine dà problemi con la rotazione, è meglio usare dRect ruotati, 
      // ma drawLine usa già applyTransform internamente. 
      // Tuttavia, per coerenza assoluta con la tua richiesta di evitare "linee",
      // potremmo ripensare dCheckmark. Ma per ora manteniamo dRect dove possibile.
      
      const tStart1 = applyTransform(x + size * 0.02, y + size * 0.50, 0, 0);
      const tEnd1 = applyTransform(x + size * 0.40, y + size * 0.05, 0, 0);
      pdfPage.drawLine({
          start: { x: tStart1.x, y: tStart1.y }, 
          end: { x: tEnd1.x, y: tEnd1.y },
          thickness: thickness, 
          color: BLACK_COLOR
      });

      const tStart2 = applyTransform(x + size * 0.40, y + size * 0.05, 0, 0);
      const tEnd2 = applyTransform(x + size * 0.98, y + size * 0.98, 0, 0);
      pdfPage.drawLine({
          start: { x: tStart2.x, y: tStart2.y }, 
          end: { x: tEnd2.x, y: tEnd2.y },
          thickness: thickness, 
          color: BLACK_COLOR
      });
  };


  if (stamp.type === 'SIGNATURE' && stamp.imageUrl) {
      try {
          const imgBytes = await fetch(stamp.imageUrl).then(res => res.arrayBuffer());
          await dImage(imgBytes, visualStampX, visualStampYBottom, visualStampW, visualStampH);
      } catch (e) {}
      return;
  }
  if (stamp.type === 'FREE_CHECK') {
      dCheckmark(visualStampX, visualStampYBottom, Math.min(visualStampW, visualStampH));
      return;
  }

  const drawHighlightedText = (text: string, x: number, y: number, w: number, font: any, color: any, isCentered = true, forceTransparent = false) => {
      const safeT = sanitizeText(text).toUpperCase();
      if (!safeT) return;

      const fontSize = Math.max(7.5, w * 0.055);
      const lineH = fontSize * 1.35;
      const lines = breakTextIntoLines(safeT, fontSize, w * 0.94, font);

      const hP = fontSize * 0.22;
      const vP = fontSize * 0.12;
      const startY = y - vP + 0.5; 

      lines.forEach((line, i) => {
          const lineY = startY - (i * lineH) - fontSize;
          const lineW = font.widthOfTextAtSize(line, fontSize);
          const lineX = isCentered ? x + (w - lineW) / 2 : x + (w * 0.03);
          
          if (onlyHighlighter) {
              dRect(lineX - hP, lineY - vP, lineW + hP * 2, fontSize + vP * 2, WHITE_COLOR);
          }
          
          if (onlyContent) {
              dTextWithHalo(line, lineX, lineY, { size: fontSize, font, color }, 0.6, false, false);
          }
      });
  };

  if (stamp.type === 'FREE_TEXT') {
      if (onlyStructure) return;
      const topY = visualStampYBottom + visualStampH;
      drawHighlightedText(stamp.notes, visualStampX, topY, visualStampW, fontRegular, BLACK_COLOR, true, stamp.isTransparent);
      return;
  }

  if (stamp.type === 'SIGNATURE' || stamp.type === 'FREE_CHECK') {
      if (onlyStructure || onlyHighlighter) return;
  }

  const totalUnits = Math.max(5, stamp.rows.length + 2.5);
  const rowHeight = visualStampH / totalUnits;
  const headerHeight = rowHeight * 1.25;
  const tableHeight = visualStampH;
  const boxSize = rowHeight * 0.72; 
  const headerYBottom = visualStampYBottom + tableHeight - headerHeight;

  const BORDER_THICK = 1.1;
  const INTERNAL_THICK = 1.1;
  const CHECKBOX_THICK = 1.1;

  const notesAreaHeight = (totalUnits - stamp.rows.length - 1.25) * rowHeight;
  const tableWithRowsHeight = tableHeight - notesAreaHeight;
  const tableWithRowsYBottom = visualStampYBottom + notesAreaHeight;

  // --- RENDERING STRUTTURA E SFONDI ---
  if (onlyHighlighter && !isDirigente) {
      // Fase 1: Sfondo bianco parziale (Mosaico)
      // Header
      dRect(visualStampX, headerYBottom, visualStampW, headerHeight, WHITE_COLOR);
      
      // Righe (escludendo i quadranti delle checkbox)
      stamp.rows.forEach((row, idx) => {
          const rowY = headerYBottom - ((idx + 1) * rowHeight);
          if (row.isFullWidth) {
              // Sfondo per cella sinistra (vuota ma bianca)
              dRect(visualStampX, rowY, visualStampW / 2, rowHeight, WHITE_COLOR);
              // Sfondo per cella destra (fino alla checkbox)
              const cellX = visualStampX + (visualStampW / 2);
              const cellW = visualStampW / 2;
              const padding = cellW * 0.05;
              const boxX = visualStampX + visualStampW - boxSize - (visualStampW / 2) * 0.05;
              // Rettangolo bianco che copre la cella tranne il box
              dRect(cellX, rowY, (boxX - cellX), rowHeight, WHITE_COLOR);
              // Rettangoli sopra e sotto il box per chiudere il bianco
              dRect(boxX, rowY, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR); // sopra
              dRect(boxX, rowY + (rowHeight + boxSize) / 2, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR); // sotto
              // Rettangolo a destra del box
              dRect(boxX + boxSize, rowY, (cellX + cellW) - (boxX + boxSize), rowHeight, WHITE_COLOR);
          } else {
              // Cella Sinistra
              const cellX1 = visualStampX;
              const cellW1 = visualStampW / 2;
              const padding1 = cellW1 * 0.05;
              const boxX1 = cellX1 + cellW1 - boxSize - padding1;
              dRect(cellX1, rowY, (boxX1 - cellX1), rowHeight, WHITE_COLOR);
              dRect(boxX1, rowY, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR);
              dRect(boxX1, rowY + (rowHeight + boxSize) / 2, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR);
              dRect(boxX1 + boxSize, rowY, (cellX1 + cellW1) - (boxX1 + boxSize), rowHeight, WHITE_COLOR);

              // Cella Destra
              if (row.right) {
                  const cellX2 = visualStampX + (visualStampW / 2);
                  const cellW2 = visualStampW / 2;
                  const padding2 = cellW2 * 0.05;
                  const boxX2 = cellX2 + cellW2 - boxSize - padding2;
                  dRect(cellX2, rowY, (boxX2 - cellX2), rowHeight, WHITE_COLOR);
                  dRect(boxX2, rowY, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR);
                  dRect(boxX2, rowY + (rowHeight + boxSize) / 2, boxSize, (rowHeight - boxSize) / 2, WHITE_COLOR);
                  dRect(boxX2 + boxSize, rowY, (cellX2 + cellW2) - (boxX2 + boxSize), rowHeight, WHITE_COLOR);
              } else {
                  dRect(visualStampX + (visualStampW / 2), rowY, visualStampW / 2, rowHeight, WHITE_COLOR);
              }
          }
      });

      // Area Note - RIMOSSO SFONDO BIANCO INTERO SU RICHIESTA UTENTE
      // if (notesAreaHeight > 0) {
      //    dRect(visualStampX, visualStampYBottom, visualStampW, notesAreaHeight, WHITE_COLOR);
      // }
  }

  if (onlyStructure) {
      // Fase 2: Elementi rossi strutturali
      dRect(visualStampX, headerYBottom, visualStampW, headerHeight, RED_COLOR);
      dRect(visualStampX, tableWithRowsYBottom, visualStampW, tableWithRowsHeight, undefined, RED_COLOR, BORDER_THICK);
      dRect(visualStampX, headerYBottom, visualStampW, INTERNAL_THICK, RED_COLOR);
  }

  const leftCellW = visualStampW * 0.25;
  const centerCellW = visualStampW * 0.50;
  const rightCellW = visualStampW * 0.25;
  const headerFontSize = Math.max(8, visualStampW * 0.078);
  const titleStr = sanitizeText(stamp.title || stamp.type.replace('_', ' ')).toUpperCase();
   
  // --- RENDERING CONTENUTO ---
  if (onlyContent) {
      // Titolo e firma nell'header (senza ridisegnare i bordi)

      if (true) { // ABILITATO PER TUTTI (anche Dirigente)
          const titleW = fontBold.widthOfTextAtSize(titleStr, headerFontSize);
          // Centratura nella cella centrale (50%)
          const titleX = visualStampX + leftCellW + (centerCellW - titleW) / 2; 
          const titleY = headerYBottom + (headerHeight - headerFontSize * 0.8) / 2;
          dTextWithHalo(titleStr, titleX, titleY, { size: headerFontSize, font: fontBold, color: WHITE_COLOR }, 0.6, true);
      }
 
      if (isFixedStamp) { // ABILITATO ANCHE PER DIRIGENTE
          let urlToUse: string | undefined;
          if (stamp.type === 'DOIT_VE') {
              urlToUse = doitSignatureUrl;
          } else {
              urlToUse = 'https://i.imgur.com/pGhDap2.png';
          }

          if (urlToUse) {
              try {
                  const sigBytes = await fetch(urlToUse).then(res => res.arrayBuffer());
                  // Firma a tutta altezza e larghezza della cella destra (25%)
                  const sigH = headerHeight; 
                  const sigW = rightCellW; 
                  const sigX = visualStampX + visualStampW - sigW;
                  const sigY = headerYBottom; 
                  await dImage(sigBytes, sigX, sigY, sigW, sigH);
              } catch (e) {}
          }
      }
  }

  const uniformFontSizeCqw = getUniformLabelFontSizeCqw(stamp.rows);
  const uniformFontSizePoints = visualStampW * (uniformFontSizeCqw / 100);

  stamp.rows.forEach((row, i) => {
    const rowYBottom = headerYBottom - ((i + 1) * rowHeight);
    
    // --- STRUTTURA RIGA ---
    if (onlyStructure) {
        // Usiamo dRect per il divisore orizzontale (linea molto sottile)
        dRect(visualStampX, rowYBottom, visualStampW, INTERNAL_THICK, RED_COLOR);
        
        if (!row.isFullWidth) {
            // Usiamo dRect per il divisore verticale
            dRect(visualStampX + (visualStampW / 2), rowYBottom, INTERNAL_THICK, rowHeight, RED_COLOR);
        }
    }

    // --- CONTENUTO RIGA ---
    const drawCell = (field: any, cellX: number, cellW: number, isRightColumn = false) => {
        if (!field || field.label === '') return;
        
        const padding = cellW * 0.05;
        let boxX = cellX + cellW - boxSize - padding;
        if (!isRightColumn && row.isFullWidth) {
            boxX = visualStampX + visualStampW - boxSize - (visualStampW / 2) * 0.05;
        }
        const boxY = rowYBottom + (rowHeight - boxSize) / 2;

        if (onlyStructure) {
            // Disegna solo il bordo rosso della checkbox
            dRect(boxX, boxY, boxSize, boxSize, undefined, RED_COLOR, CHECKBOX_THICK);
        }
        
        /* 
        if (onlyHighlighter) {
            // Disegna lo sfondo bianco della checkbox
            dRect(boxX, boxY, boxSize, boxSize, WHITE_COLOR);
        }
        */

        if (onlyContent || onlyHighlighter) {
            const labelStr = sanitizeText(field.label).toUpperCase();
            let lSize = uniformFontSizePoints;
            const hPad = cellW * 0.03;
            const vPad = rowHeight * 0.10;
            // COPYING SIDEBAR LOGIC: Limit text to 75% of cell width (matching Sidebar's w-[75%])
            const maxTextW = (cellW * 0.75) - hPad * 2;

            let lines = breakTextIntoLines(labelStr, lSize, maxTextW, fontBold);
            let lineH = lSize * 1.12;
            let blockH = lineH * lines.length;
            const availableH = Math.max(1, rowHeight - vPad * 2);
            if (blockH > availableH) {
                lineH = availableH / lines.length;
                blockH = lineH * lines.length;
            }
            const centerYRef = boxY + boxSize * 0.82;
            const downBias = lSize * 0.20;
            const extraDown = rowHeight * 0.30;

            lines.forEach((line, i) => {
                const lineW = fontBold.widthOfTextAtSize(line, lSize);
                // Centra il testo nella cella (tra cellX e boxX)
                const lineX = cellX + (boxX - cellX) / 2 - (lineW / 2);
                
                const relIndex = i - (lines.length - 1) / 2;
                const lineY = centerYRef - downBias - relIndex * lineH - extraDown;
                
                if (onlyHighlighter) {
                    const hlHP = lSize * 0.18;
                    const hlVP = lSize * 0.10;
                    dRect(lineX - hlHP, lineY - hlVP, lineW + hlHP * 2, lSize + hlVP * 2, WHITE_COLOR);
                }
                
                if (onlyContent) { // ABILITATO ANCHE PER DIRIGENTE
                    dTextWithHalo(line, lineX, lineY, { size: lSize, font: fontBold, color: RED_COLOR });
                }
            });
        }

        if (onlyContent) {
            if (field.checked) {
                const markSize = boxSize * 1.0;
                const markX = boxX + (boxSize - markSize) / 2;
                const markY = boxY + (boxSize - markSize) / 2;
                dCheckmark(markX, markY, markSize);
            }
        }
    };

    if (row.isFullWidth && row.left) {
        drawCell(row.left, visualStampX + (visualStampW / 2), visualStampW / 2, true);
    } else {
        if (row.left) drawCell(row.left, visualStampX, visualStampW / 2, false);
        if (row.right) drawCell(row.right, visualStampX + (visualStampW / 2), visualStampW / 2, true);
    }
  });

  if (stamp.notes && (onlyContent || onlyHighlighter)) {
      const notesYTop = headerYBottom - (stamp.rows.length * rowHeight);
      drawHighlightedText(stamp.notes, visualStampX, notesYTop, visualStampW, fontRegular, BLACK_COLOR, true, stamp.isTransparent);
  }
};
