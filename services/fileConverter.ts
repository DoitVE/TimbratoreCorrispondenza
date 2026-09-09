/**
 * Servizio per la gestione e conversione di file PDF, P7M (CAdES) e documenti Word (.docx, .doc).
 * Supporta estrazione client-side al 100% (anche su Vercel, GitHub Pages e ambienti serverless)
 * e conversione ad alta fedeltà con fallback automatico.
 */
import * as mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ProcessedDocumentFile {
  file: File;
  pdfBytes: ArrayBuffer;
  name: string;
}

/**
 * Rileva il tipo di file in base al nome e al MIME type
 */
export function getFileType(file: File): 'pdf' | 'p7m' | 'word' | 'json' | 'unknown' {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.p7m') || file.type.includes('pkcs7') || file.type.includes('p7m')) return 'p7m';
  if (
    name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.odt') || name.endsWith('.rtf') ||
    file.type.includes('word') || file.type.includes('officedocument.wordprocessingml')
  ) {
    return 'word';
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  return 'unknown';
}

/**
 * Estrae direttamente nel browser il PDF da un buffer binario (es. busta PKCS#7 / CAdES .p7m,
 * file rinominato, file con header o firma allegata).
 */
export function extractPdfFromBytes(rawBuffer: ArrayBuffer): ArrayBuffer {
  let bytes = new Uint8Array(rawBuffer);

  // 1. Verifica immediata: il file è già un PDF nativo (inizia con %PDF-)
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2D    // -
  ) {
    return rawBuffer;
  }

  // 2. Verifica se il file è codificato in Base64 / PEM (es. -----BEGIN PKCS7-----)
  let isAscii = true;
  for (let i = 0; i < Math.min(64, bytes.length); i++) {
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32 && bytes[i] !== 0)) {
      isAscii = false;
      break;
    }
  }

  if (isAscii) {
    try {
      const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 1024 * 1024 * 10)));
      if (text.includes('-----BEGIN') || /^[A-Za-z0-9+/=\r\n]+$/.test(text.substring(0, 160))) {
        const cleanBase64 = text.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '');
        const binaryStr = atob(cleanBase64);
        const decoded = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          decoded[i] = binaryStr.charCodeAt(i);
        }
        bytes = decoded;
      }
    } catch {
      // Procedi con i byte originali in caso di errore base64
    }
  }

  // Se dopo eventuale decodifica base64 il file comincia con %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2D
  ) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  // 3. Ricerca della sequenza magica '%PDF-' all'interno della busta binaria (CAdES / PKCS#7)
  let pdfStart = -1;
  for (let i = 0; i < bytes.length - 5; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2D
    ) {
      pdfStart = i;
      break;
    }
  }

  if (pdfStart !== -1) {
    // Tentativo A: Lettura della lunghezza esatta da ASN.1 OCTET STRING (0x04) immediatamente precedente
    let definiteLen = -1;
    if (pdfStart >= 2) {
      if (bytes[pdfStart - 2] === 0x04 && bytes[pdfStart - 1] < 0x80) {
        definiteLen = bytes[pdfStart - 1];
      } else if (pdfStart >= 3 && bytes[pdfStart - 3] === 0x04 && bytes[pdfStart - 2] === 0x81) {
        definiteLen = bytes[pdfStart - 1];
      } else if (pdfStart >= 4 && bytes[pdfStart - 4] === 0x04 && bytes[pdfStart - 3] === 0x82) {
        definiteLen = (bytes[pdfStart - 2] << 8) | bytes[pdfStart - 1];
      } else if (pdfStart >= 5 && bytes[pdfStart - 5] === 0x04 && bytes[pdfStart - 4] === 0x83) {
        definiteLen = (bytes[pdfStart - 3] << 16) | (bytes[pdfStart - 2] << 8) | bytes[pdfStart - 1];
      } else if (pdfStart >= 6 && bytes[pdfStart - 6] === 0x04 && bytes[pdfStart - 5] === 0x84) {
        definiteLen =
          (bytes[pdfStart - 4] << 24) |
          (bytes[pdfStart - 3] << 16) |
          (bytes[pdfStart - 2] << 8) |
          bytes[pdfStart - 1];
      }
    }

    if (definiteLen > 0 && pdfStart + definiteLen <= bytes.length) {
      const candidate = bytes.slice(pdfStart, pdfStart + definiteLen);
      const subStr = new TextDecoder('latin1').decode(candidate.slice(Math.max(0, candidate.length - 512)));
      if (subStr.includes('%%EOF')) {
        return candidate.buffer.slice(candidate.byteOffset, candidate.byteOffset + candidate.byteLength);
      }
    }

    // Tentativo B: Ricerca all'indietro del marcatore %%EOF (fine standard del documento PDF)
    let lastEof = -1;
    for (let i = bytes.length - 5; i >= pdfStart; i--) {
      if (
        bytes[i] === 0x25 &&
        bytes[i + 1] === 0x25 &&
        bytes[i + 2] === 0x45 &&
        bytes[i + 3] === 0x4F &&
        bytes[i + 4] === 0x46
      ) {
        lastEof = i;
        break;
      }
    }

    if (lastEof !== -1) {
      let pdfEnd = lastEof + 5;
      while (
        pdfEnd < bytes.length &&
        (bytes[pdfEnd] === 0x0A || bytes[pdfEnd] === 0x0D || bytes[pdfEnd] === 0x20)
      ) {
        pdfEnd++;
      }
      const extracted = bytes.slice(pdfStart, pdfEnd);
      return extracted.buffer.slice(extracted.byteOffset, extracted.byteOffset + extracted.byteLength);
    }

    // Fallback C: da pdfStart fino alla fine del file
    const extracted = bytes.slice(pdfStart);
    return extracted.buffer.slice(extracted.byteOffset, extracted.byteOffset + extracted.byteLength);
  }

  throw new Error('Nessun flusso PDF valido rilevato nella busta.');
}

/**
 * Sanitizza il testo per la codifica WinAnsi (Windows-1252) supportata dai font standard di pdf-lib.
 * Sostituisce trattini non divisibili (0x2011), virgolette tipografiche, elenchi puntati e simboli Unicode
 * con i rispettivi equivalenti compatibili, garantendo che non si verifichino errori WinAnsi.
 */
function sanitizeTextForFont(str: string, allowedCodes: Set<number>): string {
  if (!str) return '';
  const preProcessed = str
    .replace(/[\u2010\u2011\u2012\u2212]/g, '-')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB\u25A0]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/\t/g, '    ');

  let result = '';
  for (const ch of preProcessed) {
    const code = ch.charCodeAt(0);
    if (allowedCodes.has(code)) {
      result += ch;
    } else {
      // Prova a scomporre (es. lettere con accenti particolari)
      const decomp = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      if (decomp && allowedCodes.has(decomp.charCodeAt(0))) {
        result += decomp;
      } else {
        result += ' ';
      }
    }
  }
  return result;
}

/**
 * Disegna testo su pagina PDF in modo sicuro al 100%, con fallback automatico anti-eccezione.
 */
function safeDrawText(
  page: any,
  text: string,
  options: any,
  font: any,
  allowedCodes: Set<number>
): void {
  const sanitized = sanitizeTextForFont(text, allowedCodes);
  if (!sanitized.trim()) return;

  try {
    page.drawText(sanitized, { ...options, font });
  } catch {
    try {
      // Secondo tentativo: converti solo in ASCII stampabile
      const asciiOnly = sanitized.replace(/[^\x20-\x7E]/g, ' ');
      page.drawText(asciiOnly, { ...options, font });
    } catch {
      // Ignora se la riga è completamente indecifrabile per evitare crash
    }
  }
}

/**
 * Estrae testo da file binario Word (.doc legacy) in caso di fallback da mammoth
 */
function extractTextFromBinaryDoc(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = '';
  let curUtf16 = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || code === 10 || code === 13) {
      curUtf16 += String.fromCharCode(code);
    } else {
      if (curUtf16.trim().length >= 4) text += curUtf16 + '\n';
      curUtf16 = '';
    }
  }
  if (curUtf16.trim().length >= 4) text += curUtf16 + '\n';

  if (text.length < 50) {
    let curAscii = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || (b >= 160 && b <= 255) || b === 10 || b === 13) {
        curAscii += String.fromCharCode(b);
      } else {
        if (curAscii.trim().length >= 4) text += curAscii + '\n';
        curAscii = '';
      }
    }
    if (curAscii.trim().length >= 4) text += curAscii + '\n';
  }
  return text;
}

/**
 * Converte un file Word (.docx / .doc) direttamente nel browser in un documento PDF impaginato
 */
export async function convertDocxToPdfClientSide(file: File): Promise<ArrayBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  let rawText = '';

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    rawText = result.value || '';
  } catch (extractErr) {
    console.warn('Mammoth estrazione diretta non riuscita, tentativo di lettura binaria:', extractErr);
    rawText = extractTextFromBinaryDoc(arrayBuffer);
  }

  if (!rawText.trim()) {
    rawText = extractTextFromBinaryDoc(arrayBuffer);
  }

  const lines = rawText.split(/\r?\n/);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const allowedCodes = new Set(fontRegular.getCharacterSet());

  const pageWidth = 595.28; // A4 width in pt
  const pageHeight = 841.89; // A4 height in pt
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  const fontSize = 11;
  const lineHeight = 16;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin;

  // Intestazione del documento con sanitizzazione del nome file
  const docTitle = file.name.replace(/\.(docx|doc|odt|rtf)$/i, '');
  safeDrawText(
    currentPage,
    docTitle,
    {
      x: margin,
      y: currentY,
      size: 14,
      color: rgb(0.1, 0.15, 0.25)
    },
    fontBold,
    allowedCodes
  );
  currentY -= 28;

  const wrapText = (text: string, width: number): string[] => {
    const words = text.split(' ');
    const wrapped: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const sanitizedWord = sanitizeTextForFont(word, allowedCodes);
      const testLine = currentLine ? `${currentLine} ${sanitizedWord}` : sanitizedWord;
      let textWidth = 0;
      try {
        textWidth = fontRegular.widthOfTextAtSize(testLine, fontSize);
      } catch {
        textWidth = testLine.length * (fontSize * 0.55);
      }

      if (textWidth <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) wrapped.push(currentLine);
        currentLine = sanitizedWord;
      }
    }
    if (currentLine) wrapped.push(currentLine);
    return wrapped.length > 0 ? wrapped : [''];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentY -= lineHeight * 0.75;
      if (currentY < margin + lineHeight) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }
      continue;
    }

    const wrappedLines = wrapText(trimmed, contentWidth);
    for (const wl of wrappedLines) {
      if (currentY < margin + lineHeight) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }
      safeDrawText(
        currentPage,
        wl,
        {
          x: margin,
          y: currentY,
          size: fontSize,
          color: rgb(0.15, 0.15, 0.15)
        },
        fontRegular,
        allowedCodes
      );
      currentY -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
}

/**
 * Converte un file Word (.docx, .doc, .odt) in PDF:
 * 1. Prova prima tramite server (LibreOffice ad alta fedeltà).
 * 2. Se l'endpoint non è raggiungibile (es. hosting Vercel statico), effettua il fallback locale client-side.
 */
export async function convertWordToPdf(file: File): Promise<{ pdfBytes: ArrayBuffer; pdfName: string }> {
  const baseName = file.name.replace(/\.(docx|doc|odt|rtf)$/i, '');
  const pdfName = `${baseName}.pdf`;

  // Tentativo 1: Server endpoint (LibreOffice)
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/convert-word', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const pdfBytes = await response.arrayBuffer();
      return { pdfBytes, pdfName };
    }
  } catch (err) {
    console.warn('Endpoint /api/convert-word non raggiungibile o fallito, procedo con conversione client-side:', err);
  }

  // Tentativo 2: Fallback client-side (funziona direttamente su Vercel e ovunque)
  try {
    const pdfBytes = await convertDocxToPdfClientSide(file);
    return { pdfBytes, pdfName };
  } catch (clientErr: any) {
    throw new Error(
      `Impossibile convertire il documento Word "${file.name}": ` +
      (clientErr?.message || 'conversione non riuscita.')
    );
  }
}

/**
 * Estrae il contenuto originario da una busta PKCS#7 / CAdES (.p7m):
 * 1. Esegue l'estrazione direttamente in locale nel browser (funziona al 100% su Vercel, offline, ecc.).
 * 2. Se necessario, effettua il fallback all'endpoint server.
 */
export async function extractPdfFromP7m(file: File): Promise<{ pdfBytes: ArrayBuffer; pdfName: string }> {
  let pdfName = file.name.replace(/\.p7m$/i, '');
  if (!pdfName.toLowerCase().endsWith('.pdf')) {
    pdfName = `${pdfName}.pdf`;
  }

  const fileBuffer = await file.arrayBuffer();

  // Tentativo 1: Estrazione locale client-side istantanea
  try {
    const extractedBuffer = extractPdfFromBytes(fileBuffer);
    // Verifica validità con pdf-lib
    const pdfDoc = await PDFDocument.load(extractedBuffer, { ignoreEncryption: true });
    if (pdfDoc.getPageCount() > 0) {
      return { pdfBytes: extractedBuffer, pdfName };
    }
  } catch (localErr) {
    console.warn('Estrazione client-side diretta completata con avviso:', localErr);
  }

  // Tentativo 2: Endpoint server /api/extract-p7m (OpenSSL) se disponibile
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/extract-p7m', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const pdfBytes = await response.arrayBuffer();
      return { pdfBytes, pdfName };
    }
  } catch (serverErr) {
    console.warn('Endpoint server /api/extract-p7m non raggiungibile:', serverErr);
  }

  // Tentativo 3: Se contiene Word all'interno del .p7m (ZIP o OLE)
  const bytes = new Uint8Array(fileBuffer);
  let wordStart = -1;
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      wordStart = i;
      break;
    }
  }
  if (wordStart !== -1) {
    const wordBytes = bytes.slice(wordStart);
    const wordFile = new File([wordBytes.buffer], `${pdfName.replace(/\.pdf$/i, '')}.docx`, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    return convertWordToPdf(wordFile);
  }

  throw new Error(
    `Impossibile estrarre il documento da "${file.name}". Il file potrebbe non contenere un documento PDF leggibile.`
  );
}

/**
 * Prende in carico un file qualsiasi (.pdf, .p7m, .docx, .doc) e restituisce un oggetto standardizzato
 * con PDF in memoria pronto all'uso identico a un normale file PDF.
 */
export async function processIncomingFile(file: File): Promise<ProcessedDocumentFile> {
  const type = getFileType(file);

  if (type === 'pdf') {
    const pdfBytes = await file.arrayBuffer();
    return {
      file,
      pdfBytes,
      name: file.name
    };
  }

  if (type === 'p7m') {
    const { pdfBytes, pdfName } = await extractPdfFromP7m(file);
    const extractedFile = new File([pdfBytes], pdfName, { type: 'application/pdf' });
    return {
      file: extractedFile,
      pdfBytes,
      name: pdfName
    };
  }

  if (type === 'word') {
    const { pdfBytes, pdfName } = await convertWordToPdf(file);
    const convertedFile = new File([pdfBytes], pdfName, { type: 'application/pdf' });
    return {
      file: convertedFile,
      pdfBytes,
      name: pdfName
    };
  }

  // Fallback: se il tipo non è riconosciuto esplicitamente, controlla se i byte corrispondono a un PDF
  try {
    const rawBytes = await file.arrayBuffer();
    const pdfBytes = extractPdfFromBytes(rawBytes);
    const pdfName = file.name.toLowerCase().endsWith('.pdf') ? file.name : `${file.name}.pdf`;
    return {
      file: new File([pdfBytes], pdfName, { type: 'application/pdf' }),
      pdfBytes,
      name: pdfName
    };
  } catch {
    throw new Error(`Formato file non supportato: ${file.name}`);
  }
}
