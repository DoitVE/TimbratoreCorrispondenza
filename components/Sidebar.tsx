
import React, { useState } from 'react';
import { PageData, AppMode, WorkMode } from '../types';
import { StampType, STAMP_DEFINITIONS, createStamp, getUniformLabelFontSizeCqw } from '../services/stampUtils';

const THICK_WHITE_HALO = '0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff';
const EXTRA_THICK_HALO = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff, 0 0 4px #fff';

interface SidebarProps {
  pages: PageData[];
  selectedPageIndex: number;
  onSelectPage: (index: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles?: (files: File[]) => void; 
  documentName?: string;
  currentDocIndex: number;
  totalDocs: number;
  isOpen: boolean;
  onClose: () => void;
  onAddStamp: (type: StampType) => void;
  mode: AppMode;
  onUploadSignature: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeTool?: 'none' | 'check' | 'text' | 'signature';
  onSetActiveTool?: (tool: 'none' | 'check' | 'text' | 'signature') => void;
  doitSignatureUrl?: string;
  workMode?: WorkMode;
  onExportArchive?: () => void;
}

interface StampPreviewButtonProps {
  type: StampType;
  onClick: () => void;
  doitSignatureUrl?: string;
}

const StampPreviewButton: React.FC<StampPreviewButtonProps> = ({ type, onClick, doitSignatureUrl }) => {
    const def = STAMP_DEFINITIONS[type];
    const dummyStamp = createStamp(type);
    const uniformFontSizeCqw = getUniformLabelFontSizeCqw(dummyStamp.rows);
    
    // Halo più simile alla MainView ma scalato per la sidebar
    const THICK_HALO_SMALL = `
        -0.4px -0.4px 0 #fff, 0.4px -0.4px 0 #fff, -0.4px 0.4px 0 #fff, 0.4px 0.4px 0 #fff,
        -0.8px -0.8px 0 #fff, 0.8px -0.8px 0 #fff, -0.8px 0.8px 0 #fff, 0.8px 0.8px 0 #fff,
        0 0 2px #fff
    `;

    const FIXED_HEADER_HEIGHT = 42;
    const FIXED_ROW_HEIGHT = 26;
    const FIXED_NOTES_HEIGHT = 20;

    return (
        <button 
            onClick={onClick}
            className="w-full group hover:scale-[1.01] transition-transform duration-200 outline-none focus:ring-2 focus:ring-[#c60c30] focus:ring-offset-1 rounded"
            title={`Inserisci timbro ${def.title}`}
        >
            <div className="stamp-preview-container bg-white text-[#c60c30] shadow-sm group-hover:shadow-md transition-shadow overflow-hidden flex flex-col relative"
                 style={{ height: 'auto', border: 'none' }}>
                <style>{`.stamp-preview-container{container-type:inline-size;}`}</style>
                
                {/* Overlay Struttura Rossa (Sempre sopra) */}
                <div className="absolute inset-0 pointer-events-none z-[120]">
                    {/* Bordo Esterno (Solo per Header + Righe, esclude area Note) */}
                    <div className="absolute top-0 left-0 right-0" 
                         style={{ 
                            height: `${FIXED_HEADER_HEIGHT + (def.rows.length * FIXED_ROW_HEIGHT)}px`,
                            borderTop: '1.5px solid #c60c30', 
                            borderLeft: '1.5px solid #c60c30', 
                            borderRight: '1.5px solid #c60c30' 
                         }} />
                </div>

                <div 
                    className="bg-[#c60c30] text-white font-extrabold uppercase tracking-tight leading-none relative overflow-hidden flex items-stretch shrink-0 px-2 py-1 z-20"
                    style={{ height: `${FIXED_HEADER_HEIGHT}px`, borderBottom: 'none' }}
                >
                    {/* Left Cell - 25% width - VUOTA */}
                    <div className="w-[25%] bg-transparent h-full"></div>

                    {/* Center Cell - 50% width - TESTO CENTRATO */}
                    <div className="w-[50%] h-full flex items-center justify-center relative bg-transparent">
                        <span className="relative z-10 text-center w-full px-2" style={{ fontSize: '7.8cqw', lineHeight: 1, whiteSpace: 'nowrap' }}>{def.title}</span>
                    </div>

                    {/* Right Cell (FIRMA) - 25% width - DESTRA */}
                    <div className="w-[25%] h-full bg-transparent flex items-center justify-end relative overflow-hidden">
                        {type === 'DOIT_VE' && doitSignatureUrl && (
                            <img 
                                src={doitSignatureUrl} 
                                alt="Firma" 
                                crossOrigin="anonymous" 
                                className="absolute right-0 top-0 h-full w-full object-fill pointer-events-none select-none" 
                            />
                        )}
                        {['INGEGNERIA_VE', 'UT_NORD', 'UT_SUD_VE'].includes(type) && (
                            <img 
                                src="https://i.imgur.com/pGhDap2.png" 
                                alt="Firma" 
                                crossOrigin="anonymous" 
                                className="absolute right-0 top-0 h-full w-full object-fill pointer-events-none select-none" 
                            />
                        )}
                    </div>
                </div>

                <div className="flex flex-col text-[10px] font-bold leading-none bg-transparent flex-1 z-10">
                    {def.rows.map((row, idx) => (
                        <div 
                            key={idx} 
                            className="flex relative"
                            style={{ height: `${FIXED_ROW_HEIGHT}px` }}
                        >
                            {/* Linea Orizzontale Rossa Sotto la Riga */}
                            <div className="absolute bottom-0 left-0 right-0 h-0 border-t-[1.5px] border-[#c60c30] z-[130]" />

                            {row.fullWidth ? (
                                <div className="flex w-full h-full">
                                    <div className="w-1/2 bg-transparent relative">
                                        {/* Linea Verticale Centrale RIMOSSA per fullWidth */}
                                    </div>
                                    <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent">
                                        {/* Label Cell (75% CENTERED) */}
                                        <div className="w-[75%] flex items-center justify-center bg-transparent px-1">
                                             <span className="uppercase font-bold text-center leading-none shrink select-none whitespace-normal text-[#c60c30]" 
                                                   style={{ fontSize: `${uniformFontSizeCqw}cqw`, textShadow: THICK_WHITE_HALO }}>{row.left}</span>
                                         </div>
                                        {/* Checkbox Cell (25% RIGHT) */}
                                        <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                            <div className="aspect-square h-[84%] border-[1.5px] border-[#c60c30] shrink-0 bg-white/10 shadow-[0_0_3px_white]"></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex w-full h-full">
                                    {/* Left Cell (75/25) */}
                                    <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent relative">
                                        {/* Linea Verticale Centrale */}
                                        <div className="absolute top-0 right-0 bottom-0 w-0 border-r-[1.5px] border-[#c60c30] z-[130]" />
                                        {/* Label Cell (75% CENTERED) */}
                                        <div className="w-[75%] flex items-center justify-center bg-transparent px-1">
                                             <span className="uppercase font-bold text-center leading-none shrink select-none whitespace-normal text-[#c60c30]" 
                                                   style={{ fontSize: `${uniformFontSizeCqw}cqw`, textShadow: THICK_WHITE_HALO }}>{row.left}</span>
                                         </div>
                                        {/* Checkbox Cell (25% RIGHT) */}
                                        <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                            <div className="aspect-square h-[84%] border-[1.5px] border-[#c60c30] shrink-0 bg-white/10 shadow-[0_0_3px_white]"></div>
                                        </div>
                                    </div>
                                    {/* Right Cell (75/25) */}
                                    <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent">
                                        {row.right && (
                                            <>
                                                {/* Label Cell (75% CENTERED) */}
                                                <div className="w-[75%] flex items-center justify-center bg-transparent px-1">
                                                     <span className="uppercase font-bold text-center leading-none shrink select-none whitespace-normal text-[#c60c30]" 
                                                           style={{ fontSize: `${uniformFontSizeCqw}cqw`, textShadow: THICK_WHITE_HALO }}>{row.right}</span>
                                                 </div>
                                                {/* Checkbox Cell (25% RIGHT) */}
                                                <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                                    <div className="aspect-square h-[84%] border-[1.5px] border-[#c60c30] shrink-0 bg-white/10 shadow-[0_0_3px_white]"></div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div 
                        className="bg-[#f9f9f9] w-full flex items-center justify-center pointer-events-none" 
                        style={{ height: `${FIXED_NOTES_HEIGHT}px` }}
                    >
                        <span className="text-gray-300 italic font-medium uppercase select-none" style={{ fontSize: '4.5cqw', letterSpacing: '0.1em' }}>
                            Note
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ 
  pages, 
  selectedPageIndex, 
  onSelectPage, 
  onUpload,
  onUploadFiles,
  documentName,
  currentDocIndex,
  totalDocs,
  isOpen,
  onClose,
  onAddStamp,
  mode,
  onUploadSignature,
  activeTool,
  onSetActiveTool,
  doitSignatureUrl,
  workMode,
  onExportArchive
}) => {
  const stampTypes = Object.keys(STAMP_DEFINITIONS) as StampType[];
  const [isDragOverPdf, setIsDragOverPdf] = useState(false);
  const [isDragOverJson, setIsDragOverJson] = useState(false);

  const handleDragOver = (e: React.DragEvent, type: 'pdf' | 'json') => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'pdf') setIsDragOverPdf(true);
      else setIsDragOverJson(true);
  };

  const handleDragLeave = (e: React.DragEvent, type: 'pdf' | 'json') => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'pdf') setIsDragOverPdf(false);
      else setIsDragOverJson(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'pdf' | 'json') => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'pdf') setIsDragOverPdf(false);
      else setIsDragOverJson(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onUploadFiles) {
          onUploadFiles(Array.from(e.dataTransfer.files));
      }
  };

  return (
    <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full shadow-lg z-20 overflow-hidden">
        
        {/* Upload Buttons */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
          {/* PDF Upload */}
          <label 
            className={`
                flex items-center justify-center w-full px-4 py-3
                bg-white border-2 border-dashed 
                ${isDragOverPdf ? 'border-[#c60c30] bg-red-50' : 'border-gray-300 hover:border-[#c60c30]'}
                rounded-xl cursor-pointer transition-all shadow-sm group
            `}
            onDragOver={(e) => handleDragOver(e, 'pdf')}
            onDragLeave={(e) => handleDragLeave(e, 'pdf')}
            onDrop={(e) => handleDrop(e, 'pdf')}
          >
            <div className="flex flex-col items-center gap-0.5">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-[#c60c30] mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div className="flex flex-col items-center leading-none">
                <span className="text-sm font-bold text-gray-700 group-hover:text-[#c60c30] text-center">
                    Carica PDF
                </span>
                <span className="text-[9px] text-gray-400 font-medium group-hover:text-[#c60c30] mt-0.5 text-center leading-tight">
                    (Possibile multiselezione o trascinamento)
                </span>
              </div>
              <input 
                type="file" 
                accept=".pdf" 
                multiple
                className="hidden" 
                onChange={onUpload}
                onClick={(e) => (e.target as HTMLInputElement).value = ''} 
              />
            </div>
          </label>

          {/* JSON Upload */}
          <label 
            className={`
                flex items-center justify-center w-full px-4 py-3
                bg-white border-2 border-dashed 
                ${isDragOverJson ? 'border-[#006341] bg-green-50' : 'border-gray-300 hover:border-[#006341]'}
                rounded-xl cursor-pointer transition-all shadow-sm group
            `}
            onDragOver={(e) => handleDragOver(e, 'json')}
            onDragLeave={(e) => handleDragLeave(e, 'json')}
            onDrop={(e) => handleDrop(e, 'json')}
          >
            <div className="flex flex-col items-center gap-0.5">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-[#006341] mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <div className="flex flex-col items-center leading-none">
                <span className="text-sm font-bold text-gray-700 group-hover:text-[#006341] text-center">
                    Carica JSON
                </span>
                <span className="text-[9px] text-gray-400 font-medium group-hover:text-[#006341] mt-0.5 text-center leading-tight">
                    (stato di elaborazione)
                </span>
              </div>
              <input 
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={onUpload}
                onClick={(e) => (e.target as HTMLInputElement).value = ''} 
              />
            </div>
          </label>
        </div>

        {/* MODE: SEGRETERIA (Stamps) */}
        {mode === 'segreteria' && (
            <div className="p-4 flex-1 overflow-y-auto">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Seleziona Timbro</h3>
                <div className="space-y-4">
                    {stampTypes.map(type => (
                        <StampPreviewButton 
                            key={type} 
                            type={type} 
                            onClick={() => onAddStamp(type)}
                            doitSignatureUrl={doitSignatureUrl}
                        />
                    ))}
                </div>
            </div>
        )}

        {/* MODE: DIRIGENTE (Signature & Tools) */}
        {mode === 'dirigente' && (
            <div className="p-4 flex-1 overflow-y-auto">
                 <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Strumenti Dirigente</h3>
                 
                 <div className="space-y-4">
                    {/* Dirigente Instructions */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4">
                        <p className="text-[10px] text-slate-500 italic leading-tight">
                            Caricando un PDF già elaborato con questa App, potrai sfruttare l'elaborabilità automatica dei campi. In alternativa, usa gli strumenti manuali per apporre spunte e testi liberi.
                        </p>
                    </div>

                    {/* Tools Check/Text */}
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => onSetActiveTool?.(activeTool === 'check' ? 'none' : 'check')}
                            className={`flex flex-col items-center justify-center p-3 border rounded transition-colors
                                ${activeTool === 'check' 
                                    ? 'border-[#c60c30] bg-red-100' 
                                    : 'border-gray-300 hover:border-[#c60c30] hover:bg-red-50'}
                            `}
                        >
                             <svg viewBox="0 0 24 24" className={`w-6 h-6 mb-1 ${activeTool === 'check' ? 'text-[#c60c30]' : 'text-black'}`}>
                                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                             </svg>
                             <span className={`text-xs font-bold ${activeTool === 'check' ? 'text-[#c60c30]' : 'text-gray-700'}`}>SPUNTA</span>
                        </button>
                        <button 
                            onClick={() => onSetActiveTool?.(activeTool === 'text' ? 'none' : 'text')}
                            className={`flex flex-col items-center justify-center p-3 border rounded transition-colors
                                ${activeTool === 'text' 
                                    ? 'border-[#c60c30] bg-red-100' 
                                    : 'border-gray-300 hover:border-[#c60c30] hover:bg-red-50'}
                            `}
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 mb-1 ${activeTool === 'text' ? 'text-[#c60c30]' : 'text-black'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2V8m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                             <span className={`text-xs font-bold ${activeTool === 'text' ? 'text-[#c60c30]' : 'text-gray-700'}`}>TESTO</span>
                        </button>
                    </div>

                    <div className="h-px bg-gray-200 my-4"></div>

                     {/* Upload Signature */}
                    <label className={`
                        flex items-center justify-center w-full px-4 py-4
                        bg-white border-2 hover:bg-red-50
                        rounded-lg cursor-pointer transition-all shadow-sm group
                        ${activeTool === 'signature' ? 'border-[#c60c30] bg-red-50' : 'border-[#c60c30]'}
                    `}>
                        <div className="flex flex-col items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#c60c30]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            <span className="text-sm font-bold text-[#c60c30]">CARICA FIRMA</span>
                            <span className="text-[9px] text-gray-400 text-center leading-tight">
                                {activeTool === 'signature' ? 'Clicca sul foglio per posizionare' : 'Rimuove sfondo bianco automaticamente'}
                            </span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                onChange={onUploadSignature}
                            />
                        </div>
                    </label>
                 </div>
            </div>
        )}

        {/* Doc Status */}
        {totalDocs > 0 && (
            <div className="p-4 border-t border-gray-200">
               <div className="flex items-center justify-between text-xs mb-2">
                 <span className="font-bold text-gray-500">Documento Attivo</span>
                 <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                   {currentDocIndex + 1}/{totalDocs}
                 </span>
               </div>
               <div className="text-sm font-medium text-gray-800 truncate" title={documentName}>
                 {documentName}
               </div>
            </div>
        )}
      </div>
  );
};
