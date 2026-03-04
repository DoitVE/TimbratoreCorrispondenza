

export type AppMode = 'selection' | 'segreteria' | 'dirigente';
export type WorkMode = 'standard' | 'archive'; // standard = file by file, archive = json bundle

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface StampField {
  label: string;
  checked: boolean;
}

// A generic row in the stamp grid
export interface StampRow {
  left: StampField | null; // null represents an empty cell if layout requires
  right: StampField | null;
  isFullWidth?: boolean;
}

export interface StampData {
  id: string;
  type: 'DOIT_VE' | 'INGEGNERIA_VE' | 'UT_NORD' | 'UT_SUD_VE' | 'SIGNATURE' | 'FREE_CHECK' | 'FREE_TEXT';
  title: string; // Used for alt text or generic title
  rows: StampRow[]; // Empty for signatures/free text
  notes: string; // Used for Free Text content
  x: number; // Normalized 0-1000 relative to page width
  y: number; // Normalized 0-1000 relative to page height
  width: number; // Normalized width
  height: number; // Normalized height
  scale: number;
  imageUrl?: string; // For Signatures
  isTransparent?: boolean; // New: toggle background transparency
}

export interface PageData {
  pageNumber: number;
  imageUrl: string; 
  width: number;
  height: number;
  baseFontSize?: number; 
  stamps: StampData[]; // Changed to array to support multiple items
  userAnnotation?: string;
}

export interface DocumentData {
  id: string;
  file: File;
  name: string;
  pages: PageData[];
  status: 'pending' | 'processing' | 'ready' | 'completed';
  pdfBytes?: ArrayBuffer; // Stored file content to prevent "file not readable" errors
}

declare global {
  const pdfjsLib: any;
  interface Window {
    pdfjsLib: any;
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
}