
import { StampData, StampRow } from "../types";

export type StampType = 'DOIT_VE' | 'INGEGNERIA_VE' | 'UT_NORD' | 'UT_SUD_VE';

// Definition helper
interface RowDef {
  left: string;
  right?: string;
  fullWidth?: boolean;
}

export const STAMP_DEFINITIONS: Record<StampType, { title: string, rows: RowDef[] }> = {
  'DOIT_VE': {
    title: 'DOIT VE',
    rows: [
      { left: 'INGEGNERIA', right: 'GPCT' },
      { left: 'UT NORD', right: 'SICUREZZA' },
      { left: 'UT SUD', right: 'MAI' }, 
      { left: 'SEGRETERIA', fullWidth: true } 
    ]
  },
  'INGEGNERIA_VE': {
    title: 'ING VE',
    rows: [
      { left: 'CIVILE', right: 'TECNOLOGIE' },
      { left: 'PCC E AMIS', right: 'SEGRETERIA' }
    ]
  },
  'UT_NORD': {
    title: 'UT NORD VE', 
    rows: [
      { left: 'UM LV TV-BL', right: 'TGL' },
      { left: 'UM LV CSTLFR', right: 'SPC. OP. ARTE' },
      { left: 'UM IS TV-BL', right: 'PROG. E CTRL' }, 
      { left: 'UM IS CSTLFR', right: 'SPC. MATERIALI' }, 
      { left: 'UM TE TV-CSTLFR', right: 'SEGRETERIA' }
    ]
  },
  'UT_SUD_VE': {
    title: 'UT SUD VE', 
    rows: [
      { left: 'UM LV PD-RO', right: 'TGL' },
      { left: 'UM LV MESTRE', right: 'SPC. OP. ARTE' },
      { left: 'UM IS PD-RO', right: 'PROG. E CTRL' },
      { left: 'UM IS MESTRE', right: 'SPC. MATERIALI' }, 
      { left: 'UM TE PD-RO', right: 'C.P.M.' }, 
      { left: 'UM TE MESTRE', right: 'SEGRETERIA' } 
    ]
  }
};

export const createStamp = (type: StampType, referenceFontSize: number = 14): StampData => {
  if (type === 'FREE_TEXT' as any) {
      return {
          id: `text-${Date.now()}`,
          type: 'FREE_TEXT' as any,
          title: 'Testo',
          rows: [], notes: '',
          x: 100, y: 100, width: 200, height: 50, scale: 1,
          isTransparent: true 
      };
  }

  const def = STAMP_DEFINITIONS[type];
  
  const rows: StampRow[] = def.rows.map(rowDef => ({
    left: rowDef.left !== undefined ? { label: rowDef.left.toUpperCase(), checked: false } : null,
    right: (rowDef.right !== undefined && !rowDef.fullWidth) ? { label: rowDef.right.toUpperCase(), checked: false } : null,
    isFullWidth: rowDef.fullWidth
  }));

  let maxCharLength = 10;
  rows.forEach(r => {
      if (r.left) maxCharLength = Math.max(maxCharLength, r.left.label.length);
      if (r.right) maxCharLength = Math.max(maxCharLength, r.right.label.length);
  });
  
  const targetFontSize = referenceFontSize * 0.80; 
  const estimatedTextWidth = maxCharLength * (targetFontSize * 0.54);
  
  // Divisore aumentato per rendere il timbro più stretto
  let calculatedWidth = estimatedTextWidth / 0.44;

  // Clamp ridotto significativamente per rispecchiare lo screenshot "desiderato"
  calculatedWidth = Math.max(220, Math.min(480, calculatedWidth));

  const width = calculatedWidth;

  // Altezza righe (1.9) e note/header (1.25) per farli assomigliare alla sidebar
  const rowHeight = targetFontSize * 1.9; 
  const headerHeight = rowHeight * 1.25;
  const notesHeight = rowHeight * 1.25;
  const totalHeight = (rowHeight * rows.length) + headerHeight + notesHeight;
  
  return {
    id: `stamp-${Date.now()}`,
    type,
    title: def.title,
    rows,
    notes: '',
    x: 720, 
    y: 50,
    width, 
    height: totalHeight,
    scale: 1,
    isTransparent: false
  };
};

export const getUniformLabelFontSizeCqw = (rows: StampRow[]): number => {
    let maxWordLen = 1;
    rows.forEach(r => {
        [r.left, r.right].forEach(field => {
            if (field && field.label) {
                // Split by spaces or hyphens to find the longest individual word
                const words = field.label.split(/[\s-]+/);
                words.forEach(word => {
                    maxWordLen = Math.max(maxWordLen, word.length);
                });
            }
        });
    });
    
    /**
     * Calcolo proporzionale del font:
     * L'obiettivo è far stare la parola più lunga in metà della larghezza del timbro (cella standard),
     * considerando lo spazio occupato dalla checkbox e dai padding.
     * 
     * In pdf.ts, una cella è larga il 50% del timbro (0.50w).
     * Lo spazio occupato da checkbox e padding è circa il 15-20% della cella.
     * Quindi rimane circa il 40% della larghezza totale del timbro per il testo (0.40w).
     * 
     * Se una parola ha N caratteri, e ogni carattere è largo circa il 55% del font size:
     * N * (fontSize * 0.55) <= 0.40w
     * fontSize <= (0.40 / (N * 0.55)) * w
     * fontSizeCqw <= 72 / N
     * 
     * Usiamo un fattore più conservativo (52 invece di 72) per garantire margini di sicurezza
     * e per gestire meglio i timbri con molte righe (dove le checkbox sono più grandi in proporzione).
     */
    const baseFactor = 52; 
    const calculated = baseFactor / maxWordLen;
    
    // Clamp tra 3.4 (leggibile) e 6.0 (non eccessivo)
    return Math.max(3.4, Math.min(6.0, calculated));
};
