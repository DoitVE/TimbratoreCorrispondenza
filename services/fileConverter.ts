/**
 * Servizio per la gestione e conversione di file PDF, P7M (CAdES) e documenti Word (.docx, .doc).
 */

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
  if (name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.odt') || name.endsWith('.rtf') ||
      file.type.includes('word') || file.type.includes('officedocument.wordprocessingml')) {
    return 'word';
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  return 'unknown';
}

/**
 * Converte un file Word (.docx, .doc, .odt) in PDF inviandolo all'endpoint interno del server.
 */
export async function convertWordToPdf(file: File): Promise<{ pdfBytes: ArrayBuffer; pdfName: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/convert-word', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errMsg = 'Errore durante la conversione del file Word in PDF.';
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {
      // Ignora errore parsing json
    }
    throw new Error(errMsg);
  }

  const pdfBytes = await response.arrayBuffer();
  const baseName = file.name.replace(/\.(docx|doc|odt|rtf)$/i, '');
  const pdfName = `${baseName}.pdf`;

  return { pdfBytes, pdfName };
}

/**
 * Estrae il contenuto originario da una busta PKCS#7 / CAdES (.p7m).
 * Supporta estrazione sia via endpoint server sia fallback.
 */
export async function extractPdfFromP7m(file: File): Promise<{ pdfBytes: ArrayBuffer; pdfName: string }> {
  // Invio all'endpoint del server
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/extract-p7m', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errMsg = 'Errore durante l\'estrazione del file firmato .p7m.';
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {
      // Ignora
    }
    throw new Error(errMsg);
  }

  const pdfBytes = await response.arrayBuffer();
  
  // Calcolo nome: se finisce per .pdf.p7m -> .pdf, altrimenti sostituisce .p7m con .pdf
  let pdfName = file.name.replace(/\.p7m$/i, '');
  if (!pdfName.toLowerCase().endsWith('.pdf')) {
    pdfName = `${pdfName}.pdf`;
  }

  return { pdfBytes, pdfName };
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

  if (type === 'word') {
    const { pdfBytes, pdfName } = await convertWordToPdf(file);
    const convertedFile = new File([pdfBytes], pdfName, { type: 'application/pdf' });
    return {
      file: convertedFile,
      pdfBytes,
      name: pdfName
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

  // Fallback se il tipo non è riconosciuto esplicitamente ma potrebbe essere un PDF mascherato
  const pdfBytes = await file.arrayBuffer();
  const header = new Uint8Array(pdfBytes.slice(0, 5));
  const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // %PDF
  if (isPdf) {
    const pdfName = file.name.toLowerCase().endsWith('.pdf') ? file.name : `${file.name}.pdf`;
    return {
      file: new File([pdfBytes], pdfName, { type: 'application/pdf' }),
      pdfBytes,
      name: pdfName
    };
  }

  throw new Error(`Formato file non supportato: ${file.name}`);
}
