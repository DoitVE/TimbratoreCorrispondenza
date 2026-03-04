
import { DocumentData, PageData, StampData } from '../types';

interface ArchivedDocument {
  id: string;
  name: string;
  pdfBase64: string;
  pages: PageData[];
  status: 'pending' | 'processing' | 'ready' | 'completed';
}

interface ArchiveFile {
  version: string;
  createdAt: string;
  documents: ArchivedDocument[];
}

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const createArchiveJSON = async (documents: DocumentData[]): Promise<string> => {
  const archivedDocs: ArchivedDocument[] = await Promise.all(documents.map(async (doc) => {
    let base64 = '';
    if (doc.pdfBytes) {
      base64 = arrayBufferToBase64(doc.pdfBytes);
    } else {
      const buffer = await doc.file.arrayBuffer();
      base64 = arrayBufferToBase64(buffer);
    }

    // Soluzione 1: Escludiamo le imageUrl per evitare corruzioni da dimensione eccessiva
    // I dati dei timbri (stamps) vengono preservati integralmente
    const sanitizedPages = doc.pages.map(p => ({
        ...p,
        imageUrl: "", // Verrà rigenerata dal PDF all'apertura del JSON
    }));

    return {
      id: doc.id,
      name: doc.name,
      pdfBase64: base64,
      pages: sanitizedPages,
      status: doc.status
    };
  }));

  const archive: ArchiveFile = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    documents: archivedDocs
  };

  return JSON.stringify(archive, null, 2);
};

export const parseArchiveJSON = (jsonString: string): DocumentData[] => {
  try {
    const archive: ArchiveFile = JSON.parse(jsonString);
    
    return archive.documents.map(archDoc => {
      const pdfBytes = base64ToArrayBuffer(archDoc.pdfBase64);
      const file = new File([pdfBytes], archDoc.name, { type: 'application/pdf' });
      
      return {
        id: archDoc.id,
        name: archDoc.name,
        file: file,
        pages: archDoc.pages,
        status: archDoc.status,
        pdfBytes: pdfBytes
      };
    });
  } catch (e) {
    console.error("Failed to parse archive", e);
    throw new Error("File archivio non valido o corrotto.");
  }
};
