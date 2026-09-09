/**
 * Servizio per la gestione e conversione di file PDF, P7M (CAdES) e documenti Word (.docx, .doc).
 * Supporta estrazione client-side al 100% (anche su Vercel, GitHub Pages e ambienti serverless)
 * e conversione ad alta fedeltà con fallback automatico.
 */
import * as mammoth from 'mammoth';
import * as docx from 'docx-preview';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
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
 * Inietta le regole @font-face per i font Microsoft Office (Calibri, Aptos, Cambria, Times, Arial)
 * mappandoli sui font web a metrica compatibile (Carlito, Caladea, Tinos, Arimo) e normalizza
 * l'interlinea e il box model tipico di Word.
 */
async function ensureMetricCompatibleFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined') return;

  const styleId = 'docx-metric-compatible-fonts';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      /* Calibri -> Carlito (metrica e kerning 100% identici) */
      @font-face {
        font-family: 'Calibri';
        font-style: normal;
        font-weight: 400;
        src: local('Calibri'), local('Carlito'), local('Carlito Regular'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn9SDPw3m-pk039DDeBTA.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Calibri';
        font-style: normal;
        font-weight: 700;
        src: local('Calibri Bold'), local('Carlito Bold'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn4SDPw3m-pk039BIykWXolUw.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Calibri';
        font-style: italic;
        font-weight: 400;
        src: local('Calibri Italic'), local('Carlito Italic'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn_SDPw3m-pk039DDKxTl0A.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Calibri';
        font-style: italic;
        font-weight: 700;
        src: local('Calibri Bold Italic'), local('Carlito Bold Italic'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn6SDPw3m-pk039DDK59XgVUcBG.woff2') format('woff2');
      }

      /* Aptos (nuovo default Word 365) -> fallback coerente Aptos, Calibri, Carlito */
      @font-face {
        font-family: 'Aptos';
        font-style: normal;
        font-weight: 400;
        src: local('Aptos'), local('Calibri'), local('Carlito'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn9SDPw3m-pk039DDeBTA.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Aptos';
        font-style: normal;
        font-weight: 700;
        src: local('Aptos Bold'), local('Calibri Bold'), local('Carlito Bold'),
             url('https://fonts.gstatic.com/s/carlito/v4/3Jn4SDPw3m-pk039BIykWXolUw.woff2') format('woff2');
      }

      /* Cambria -> Caladea (metrica e kerning 100% identici) */
      @font-face {
        font-family: 'Cambria';
        font-style: normal;
        font-weight: 400;
        src: local('Cambria'), local('Caladea'), local('Caladea Regular'),
             url('https://fonts.gstatic.com/s/caladea/v10/kJEsBugZ7AAjhybUvRZB.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Cambria';
        font-style: normal;
        font-weight: 700;
        src: local('Cambria Bold'), local('Caladea Bold'),
             url('https://fonts.gstatic.com/s/caladea/v10/kJEwBugZ7AAjhybUrT19_7F0.woff2') format('woff2');
      }

      /* Times New Roman -> Tinos */
      @font-face {
        font-family: 'Times New Roman';
        font-style: normal;
        font-weight: 400;
        src: local('Times New Roman'), local('Tinos'),
             url('https://fonts.gstatic.com/s/tinos/v26/buE4poGnedXvwjX7fmQ.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Times New Roman';
        font-style: normal;
        font-weight: 700;
        src: local('Times New Roman Bold'), local('Tinos Bold'),
             url('https://fonts.gstatic.com/s/tinos/v26/buE1poGnedXvwj1AW3Fu0C8.woff2') format('woff2');
      }

      /* Arial -> Arimo */
      @font-face {
        font-family: 'Arial';
        font-style: normal;
        font-weight: 400;
        src: local('Arial'), local('Arimo'),
             url('https://fonts.gstatic.com/s/arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk37cxsBw.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Arial';
        font-style: normal;
        font-weight: 700;
        src: local('Arial Bold'), local('Arimo Bold'),
             url('https://fonts.gstatic.com/s/arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk3CstsBw.woff2') format('woff2');
      }

      /* Normalizzazione tipografica Word e compattazione layout */
      .docx {
        font-family: 'Calibri', 'Carlito', Arial, sans-serif;
        line-height: 1.15 !important;
        letter-spacing: -0.015em !important;
        font-feature-settings: "kern" 1;
        text-rendering: geometricPrecision !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
      }

      .docx p {
        line-height: inherit;
        margin-top: 0;
        margin-bottom: 0pt;
      }

      .docx span {
        letter-spacing: inherit;
      }

      .docx table {
        border-collapse: collapse !important;
        table-layout: auto !important;
      }

      .docx table td, .docx table th {
        box-sizing: border-box !important;
        vertical-align: top !important;
      }

      .docx-wrapper {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      section.docx {
        box-shadow: none !important;
        margin: 0 !important;
        margin-bottom: 0 !important;
        box-sizing: border-box !important;
        background: #ffffff !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Attende che le metriche font siano pronte nel browser
  if ('fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Prosegui comunque in caso di browser con restrizioni di rete
    }
  }
}

/**
 * Estrae una mappa completa di immagini/loghi (Base64 data URI) direttamente dai media e dalle relazioni dell'archivio DOCX.
 * Mappa:
 * 1. Percorsi file: 'word/media/image1.png', 'media/image1.png', 'image1.png'
 * 2. ID di relazione Word: 'rId1', 'rIdImg1', ecc. estratti da tutti i file .rels (document, header, footer)
 * 3. Array ordinato di tutte le immagini Base64 trovate nel file
 */
async function extractDocxMediaMap(arrayBuffer: ArrayBuffer): Promise<{
  mediaMap: Map<string, string>;
  orderedImages: string[];
}> {
  const mediaMap = new Map<string, string>();
  const orderedImages: string[] = [];

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Estrai tutti i file binari da word/media/
    const mediaFiles: string[] = [];
    zip.forEach((path) => {
      if (path.toLowerCase().includes('media/') && !path.endsWith('/')) {
        mediaFiles.push(path);
      }
    });

    // Ordina i file media per nome numerico (es. image1.png, image2.png)
    mediaFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const path of mediaFiles) {
      const lower = path.toLowerCase();
      let mime = 'image/png';
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
      else if (lower.endsWith('.gif')) mime = 'image/gif';
      else if (lower.endsWith('.svg')) mime = 'image/svg+xml';
      else if (lower.endsWith('.webp')) mime = 'image/webp';
      else if (lower.endsWith('.bmp')) mime = 'image/bmp';
      else if (lower.endsWith('.emf') || lower.endsWith('.wmf')) mime = 'image/png';

      const base64 = await zip.file(path)?.async('base64');
      if (base64) {
        const dataUri = `data:${mime};base64,${base64}`;
        orderedImages.push(dataUri);

        const fileName = path.split('/').pop() || '';
        mediaMap.set(path, dataUri);
        mediaMap.set(path.toLowerCase(), dataUri);
        mediaMap.set(`media/${fileName}`, dataUri);
        mediaMap.set(`media/${fileName}`.toLowerCase(), dataUri);
        mediaMap.set(fileName, dataUri);
        mediaMap.set(fileName.toLowerCase(), dataUri);
      }
    }

    // 2. Analizza TUTTI i file di relazione (.rels) compresi footer, header e document
    const relFiles: string[] = [];
    zip.forEach((path) => {
      if (path.endsWith('.rels')) {
        relFiles.push(path);
      }
    });

    for (const relPath of relFiles) {
      const relXml = await zip.file(relPath)?.async('string');
      if (!relXml) continue;

      // Parsing delle relazioni XML: <Relationship Id="rIdX" ... Target="media/imageY.png"/>
      const relMatches = relXml.matchAll(/<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g);
      for (const match of relMatches) {
        const relId = match[1];
        const target = match[2];
        const targetFilename = target.split('/').pop()?.toLowerCase() || '';

        if (mediaMap.has(targetFilename)) {
          const dataUri = mediaMap.get(targetFilename)!;
          mediaMap.set(relId, dataUri);
          mediaMap.set(relId.toLowerCase(), dataUri);
          const relBase = relPath.replace(/^word\//, '').replace(/^_rels\//, '').replace(/\.rels$/, '');
          mediaMap.set(`${relBase}:${relId}`.toLowerCase(), dataUri);
        }
      }
    }
  } catch (err) {
    console.warn('Estrazione media e relazioni DOCX non riuscita:', err);
  }

  return { mediaMap, orderedImages };
}

/**
 * Assicura che tutte le immagini e i loghi all'interno del contenitore siano completamente
 * valorizzati con Base64 Data URL puro e decodificati in memoria grafica prima dello scatto canvas.
 */
async function ensureAllImagesLoaded(
  container: HTMLElement,
  mediaMap: Map<string, string>,
  orderedImages: string[]
): Promise<void> {
  const imgElements = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  const svgImages = Array.from(container.querySelectorAll<SVGImageElement>('image'));

  let fallbackIndex = 0;

  // 1. Processa tutti gli elementi <img>
  for (let i = 0; i < imgElements.length; i++) {
    const img = imgElements[i];
    img.crossOrigin = 'anonymous';
    img.loading = 'eager';

    const currentSrc = (img.getAttribute('src') || '').trim();
    const alt = (img.getAttribute('alt') || '').trim().toLowerCase();
    const title = (img.getAttribute('title') || '').trim().toLowerCase();

    // Cerca se esiste una corrispondenza nei media estratti dal DOCX
    let bestDataUri: string | null = null;

    if (currentSrc && mediaMap.has(currentSrc.toLowerCase())) {
      bestDataUri = mediaMap.get(currentSrc.toLowerCase())!;
    } else if (alt && mediaMap.has(alt)) {
      bestDataUri = mediaMap.get(alt)!;
    } else if (title && mediaMap.has(title)) {
      bestDataUri = mediaMap.get(title)!;
    } else if (currentSrc.startsWith('blob:') && i < orderedImages.length) {
      // Se è un Blob URL, sostituisci con il Data URL Base64 corrispondente per evitare blocchi CORS/Canvas-taint
      bestDataUri = orderedImages[i];
    } else if (!currentSrc || currentSrc === 'about:blank' || currentSrc.startsWith('rId')) {
      if (fallbackIndex < orderedImages.length) {
        bestDataUri = orderedImages[fallbackIndex++];
      }
    }

    if (bestDataUri) {
      img.src = bestDataUri;
    }

    // Forza le proprietà visive dell'immagine
    img.style.visibility = 'visible';
    img.style.opacity = '1';
    if (!img.style.display || img.style.display === 'none') {
      img.style.display = 'inline-block';
    }
    img.style.maxWidth = '100%';
  }

  // 2. Processa eventuali tag SVG <image>
  for (let i = 0; i < svgImages.length; i++) {
    const svgImg = svgImages[i];
    const href = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href') || '';
    let bestDataUri: string | null = null;
    if (href && mediaMap.has(href.toLowerCase())) {
      bestDataUri = mediaMap.get(href.toLowerCase())!;
    } else if (i < orderedImages.length) {
      bestDataUri = orderedImages[i];
    }
    if (bestDataUri) {
      svgImg.setAttribute('href', bestDataUri);
      svgImg.setAttribute('xlink:href', bestDataUri);
    }
  }

  // 3. Attende che tutte le immagini abbiano completato la decodifica grafica
  const loadPromises = imgElements.map(async (img) => {
    try {
      if (img.complete && img.naturalWidth > 0) {
        if ('decode' in img && typeof img.decode === 'function') {
          await img.decode();
        }
        return;
      }

      await new Promise<void>((resolve) => {
        const onFinish = () => {
          img.removeEventListener('load', onFinish);
          img.removeEventListener('error', onFinish);
          if ('decode' in img && typeof img.decode === 'function') {
            img.decode().then(resolve).catch(() => resolve());
          } else {
            resolve();
          }
        };

        img.addEventListener('load', onFinish);
        img.addEventListener('error', onFinish);
        setTimeout(onFinish, 1200);
      });
    } catch {
      // Non bloccare in caso di singola immagine anomala
    }
  });

  await Promise.all(loadPromises);
}

/**
 * Effettua il rendering grafico ad alta fedeltà di un file Word (.docx) direttamente nel browser.
 * Utilizza docx-preview per interpretare il layout Word originale (tabelle con bordi, immagini,
 * intestazioni, piè di pagina, colori, allineamenti, font) e html2canvas + pdf-lib per generare
 * un PDF A4 ad alta risoluzione (192 DPI), senza passare per alcun server.
 */
async function renderDocxWithHighFidelity(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Ambiente browser non disponibile.');
  }

  // 1. Assicura il caricamento preventivo dei font a metrica compatibile (Carlito, Caladea, Tinos, Arimo)
  await ensureMetricCompatibleFontsLoaded();

  // 2. Estrai preventivamente la mappa di tutte le immagini e loghi presenti nel pacchetto Word
  const { mediaMap, orderedImages } = await extractDocxMediaMap(arrayBuffer);

  // 3. Crea un contenitore montato a livello background con larghezza A4 esatta (210mm)
  const container = document.createElement('div');
  container.setAttribute('data-docx-render-stage', 'true');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '210mm'; // Standard ISO A4 esatto (793.7px @ 96 DPI)
  container.style.minWidth = '210mm';
  container.style.background = '#ffffff';
  container.style.color = '#000000';
  container.style.zIndex = '-99999';
  container.style.opacity = '1'; // CRITICO: 1 per permettere a html2canvas di fotografare i pixel a piena saturazione
  container.style.pointerEvents = 'none';
  container.style.overflow = 'visible';
  container.style.boxSizing = 'border-box';
  document.body.appendChild(container);

  try {
    await docx.renderAsync(arrayBuffer, container, undefined, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false, // Rispetta i salti pagina nativi calcolati da Microsoft Word!
      experimental: true,
      trimXmlDeclaration: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
    });

    const wrapper = container.querySelector<HTMLElement>('.docx-wrapper');
    if (wrapper) {
      wrapper.style.background = '#ffffff';
      wrapper.style.padding = '0';
      wrapper.style.margin = '0';
    }

    // Assicura il caricamento e decodifica completa di tutti i loghi e immagini
    await ensureAllImagesLoaded(container, mediaMap, orderedImages);

    // Breve stabilizzazione per il completamento del reflow del DOM
    await new Promise((resolve) => setTimeout(resolve, 200));

    let sections = Array.from(container.querySelectorAll<HTMLElement>('section.docx'));
    if (sections.length === 0) {
      const fallbackTarget = wrapper || container;
      sections = [fallbackTarget];
    }

    const pdfDoc = await PDFDocument.create();
    const a4WidthPt = 595.28;
    const a4HeightPt = 841.89;

    for (const section of sections) {
      // Elimina ombre e margini di anteprima schermo per una stampa PDF pulita
      section.style.boxShadow = 'none';
      section.style.margin = '0';
      section.style.marginBottom = '0';

      const canvas = await html2canvas(section, {
        scale: 2, // Scala 2x per garantire testo, loghi e linee grafiche nitide (192 DPI)
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Nel documento clonato interno di html2canvas, assicura che il contenitore sia al 100% visibile
          const clonedContainer = clonedDoc.querySelector('[data-docx-render-stage="true"]') as HTMLElement | null;
          if (clonedContainer) {
            clonedContainer.style.opacity = '1';
            clonedContainer.style.visibility = 'visible';
          }
          // Copia i Data URL verificati su tutte le immagini clonate
          const clonedImgs = clonedDoc.querySelectorAll<HTMLImageElement>('img');
          const origImgs = section.querySelectorAll<HTMLImageElement>('img');
          clonedImgs.forEach((cImg, idx) => {
            const orig = origImgs[idx];
            if (orig && orig.src) {
              cImg.src = orig.src;
            }
            cImg.style.visibility = 'visible';
            cImg.style.opacity = '1';
          });
        },
      });

      if (canvas.width <= 0 || canvas.height <= 0) continue;

      const isLandscape = canvas.width > canvas.height * 1.15;
      const pageWidth = isLandscape ? a4HeightPt : a4WidthPt;
      const pageHeight = isLandscape ? a4WidthPt : a4HeightPt;
      const targetRatio = pageHeight / pageWidth;
      const pageCanvasHeight = Math.round(canvas.width * targetRatio);

      // Criterio di forzatura 1:1 Pagina Word -> Pagina PDF:
      // Se docx-preview ha già separato il documento in sezioni/pagine (sections.length > 1),
      // ciascuna sezione corrisponde nativamente a una specifica pagina del documento Word.
      // Anche per documenti a sezione singola, se l'altezza rientra fino al 145% di un A4 (espansione tipica del DOM/font web),
      // forziamo l'intero contenuto della pagina Word in una singola pagina PDF (Fit-to-Page).
      // In questo modo, la prima e l'ultima parola di ciascun foglio Word restano rigorosamente nel loro rispettivo foglio PDF.
      const isMultiPageSection = canvas.height > pageCanvasHeight * (sections.length > 1 ? 1.70 : 1.45);

      if (!isMultiPageSection) {
        // Sezione che corrisponde a una singola pagina Word: la adattiamo esattamente alla singola pagina A4
        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const imgBase64 = imgDataUrl.split(',')[1];
        const imgBytes = Uint8Array.from(atob(imgBase64), (c) => c.charCodeAt(0));
        const embeddedImg = await pdfDoc.embedJpg(imgBytes);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        // Calcola la scala proporzionale per racchiudere tutto il foglio Word nella pagina PDF senza distorsioni
        const scaleX = pageWidth / canvas.width;
        const scaleY = pageHeight / canvas.height;
        const scale = Math.min(scaleX, scaleY);

        const drawWidth = canvas.width * scale;
        const drawHeight = canvas.height * scale;
        const drawX = (pageWidth - drawWidth) / 2;
        // In pdf-lib l'origine (0,0) è in basso a sinistra: allinea il documento in alto alla pagina
        const drawY = pageHeight - drawHeight;

        page.drawImage(embeddedImg, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      } else {
        // Sezione continua multi-pagina (documento privo di salti pagina nativi): impagina a fette di altezza A4
        const totalPages = Math.ceil(canvas.height / pageCanvasHeight);
        for (let p = 0; p < totalPages; p++) {
          const sliceH = Math.min(pageCanvasHeight, canvas.height - p * pageCanvasHeight);
          if (sliceH <= 10) continue;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = pageCanvasHeight;
          const sliceCtx = sliceCanvas.getContext('2d');
          if (!sliceCtx) continue;

          sliceCtx.fillStyle = '#ffffff';
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceCtx.drawImage(
            canvas,
            0,
            p * pageCanvasHeight,
            canvas.width,
            sliceH,
            0,
            0,
            canvas.width,
            sliceH
          );

          const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
          const sliceBase64 = sliceDataUrl.split(',')[1];
          const sliceBytes = Uint8Array.from(atob(sliceBase64), (c) => c.charCodeAt(0));
          const embeddedSlice = await pdfDoc.embedJpg(sliceBytes);

          const page = pdfDoc.addPage([pageWidth, pageHeight]);
          page.drawImage(embeddedSlice, {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
          });
        }
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      throw new Error('Nessuna pagina generata dal motore grafico.');
    }

    const pdfBytes = await pdfDoc.save();
    return pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Fallback testuale/strutturato per file Word (.doc legacy o formati non supportati da docx-preview)
 */
async function convertDocxToPdfTextFallback(file: File, arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
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
      color: rgb(0.1, 0.15, 0.25),
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
          color: rgb(0.15, 0.15, 0.15),
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
 * Converte un file Word (.docx / .doc) direttamente nel browser:
 * 1. Prova prima il motore ad ALTA FEDELTÀ grafica (docx-preview: tabelle, immagini, layout, stili).
 * 2. In caso di errore o formato legacy, ricorre al fallback testuale strutturato.
 */
export async function convertDocxToPdfClientSide(file: File): Promise<ArrayBuffer> {
  const arrayBuffer = await file.arrayBuffer();

  // Se è un file .docx moderno (archivio ZIP OOXML con signature PK)
  const isZipDocx =
    file.name.toLowerCase().endsWith('.docx') ||
    (new Uint8Array(arrayBuffer.slice(0, 2))[0] === 0x50 &&
      new Uint8Array(arrayBuffer.slice(0, 2))[1] === 0x4B);

  if (isZipDocx) {
    try {
      return await renderDocxWithHighFidelity(arrayBuffer);
    } catch (err) {
      console.warn('Rendering ad alta fedeltà docx-preview non riuscito, ricorro al fallback testuale:', err);
    }
  }

  // Fallback per file .doc legacy o documenti non convenzionali
  return await convertDocxToPdfTextFallback(file, arrayBuffer);
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
