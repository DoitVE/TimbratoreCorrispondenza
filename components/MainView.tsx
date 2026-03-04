
import React, { useRef, useState, useEffect } from 'react';
import { PageData, StampData } from '../types';
import { getUniformLabelFontSizeCqw } from '../services/stampUtils';

const THICK_WHITE_HALO = '0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff';
const EXTRA_THICK_HALO = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff, 0 0 4px #fff';

interface MainViewProps {
  pages: PageData[];
  onUpdateStamp: (pageIndex: number, stamp: StampData) => void;
  onRemoveStamp?: (pageIndex: number, stampId: string) => void; 
  activePageIndex: number;
  onPageVisible?: (index: number) => void;
  onConfirm: () => void;
  onSkip: () => void; 
  isLastDocument: boolean;
  docStatus?: string;
  appMode: 'segreteria' | 'dirigente';
  workMode: 'standard' | 'archive';
  activeTool?: 'none' | 'check' | 'text' | 'signature';
  onToolPlace?: (pageIndex: number, x: number, y: number) => void;
  doitSignatureUrl?: string;
  onExportArchive?: () => void;
  onPrevDocument?: () => void;
  currentDocIndex?: number;
}

export const MainView: React.FC<MainViewProps> = ({ 
  pages, 
  onUpdateStamp,
  onRemoveStamp,
  activePageIndex,
  onPageVisible,
  onConfirm,
  onSkip,
  isLastDocument,
  docStatus,
  appMode,
  workMode,
  activeTool,
  onToolPlace,
  doitSignatureUrl,
  onExportArchive,
  onPrevDocument,
  currentDocIndex = 0
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [activeStampId, setActiveStampId] = useState<string | null>(null);
  const [activeStampPageIndex, setActiveStampPageIndex] = useState<number>(-1);
  const [interactionMode, setInteractionMode] = useState<'none' | 'dragging' | 'resizing'>('none');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [initialDims, setInitialDims, getInitialDims] = useGetState({ x: 0, y: 0, width: 0, height: 0 });
  const [focusLastAdded, setFocusLastAdded] = useState(false);
  const rafScheduledRef = useRef(false);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  
  function useGetState<T>(initialValue: T): [T, (val: T) => void, () => T] {
    const [state, setState] = useState<T>(initialValue);
    const stateRef = useRef(state);
    const set = (val: T) => {
      stateRef.current = val;
      setState(val);
    };
    const get = () => stateRef.current;
    return [state, set, get];
  }

  const isStandardStamp = (type: string) => {
      return ['DOIT_VE', 'INGEGNERIA_VE', 'UT_NORD', 'UT_SUD_VE'].includes(type);
  };

  // Logic to focus the last added text box
  useEffect(() => {
    if (focusLastAdded) {
      const allStamps = pages.flatMap(p => p.stamps);
      if (allStamps.length > 0) {
        const lastStamp = allStamps[allStamps.length - 1];
        if (lastStamp.type === 'FREE_TEXT') {
          const el = document.getElementById(`textarea-${lastStamp.id}`) as HTMLTextAreaElement;
          if (el) {
            el.focus();
            setFocusLastAdded(false);
          }
        } else {
          setFocusLastAdded(false);
        }
      }
    }
  }, [pages, focusLastAdded]);

  // Logic to auto-expand all textareas on render
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(ta => {
      if (ta.classList.contains('resize-none')) {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      }
    });
  }, [pages]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const options = {
        root: containerRef.current,
        rootMargin: '-40% 0px -40% 0px', 
        threshold: 0
    };

    observerRef.current = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = Number(entry.target.getAttribute('data-page-index'));
                if (!isNaN(idx) && onPageVisible) {
                    onPageVisible(idx);
                }
            }
        });
    }, options);

    const pageElements = containerRef.current?.querySelectorAll('.page-wrapper');
    pageElements?.forEach(el => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [pages.length, onPageVisible]);

  const scrollToTop = () => {
    if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!pages || pages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4">
        <p className="text-center text-sm">Carica un PDF o un Archivio JSON per iniziare.</p>
      </div>
    );
  }

  const handlePointerDownMove = (e: React.PointerEvent, pageIndex: number, stamp: StampData, isLocked: boolean) => {
    if (interactionMode !== 'none' || (activeTool && activeTool !== 'none') || isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setActiveStampId(stamp.id);
    setActiveStampPageIndex(pageIndex);
    setInteractionMode('dragging');
    setStartPos({ x: e.clientX, y: e.clientY });
    setInitialDims({ x: stamp.x, y: stamp.y, width: stamp.width, height: stamp.height });
  };

  const handlePointerDownResize = (e: React.PointerEvent, pageIndex: number, stamp: StampData, isLocked: boolean) => {
    if ((activeTool && activeTool !== 'none') || isLocked) return;
    e.preventDefault();
    e.stopPropagation(); 
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setActiveStampId(stamp.id);
    setActiveStampPageIndex(pageIndex);
    setInteractionMode('resizing');
    setStartPos({ x: e.clientX, y: e.clientY });
    setInitialDims({ x: stamp.x, y: stamp.y, width: stamp.width, height: stamp.height });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (interactionMode === 'none' || !activeStampId || activeStampPageIndex === -1) return;
    pendingMoveRef.current = { x: e.clientX, y: e.clientY };
    if (rafScheduledRef.current) return;
    rafScheduledRef.current = true;
    requestAnimationFrame(() => {
      try {
        const coords = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (!coords) return;
        const pageEl = document.getElementById(`page-container-${activeStampPageIndex}`);
        if (!pageEl) return;
        const page = pages[activeStampPageIndex];
        const stamp = page.stamps.find(s => s.id === activeStampId);
        if (!stamp) return;
        const rect = pageEl.getBoundingClientRect();
        const deltaX = coords.x - startPos.x;
        const deltaY = coords.y - startPos.y;
        const scaleFactorX = 1000 / rect.width;
        const scaleFactorY = 1000 / rect.height;
        const dims = getInitialDims();
        if (interactionMode === 'dragging') {
          const newX = Math.max(0, Math.min(1000 - stamp.width, dims.x + (deltaX * scaleFactorX)));
          const newY = Math.max(0, Math.min(1000 - stamp.height, dims.y + (deltaY * scaleFactorY)));
          onUpdateStamp(activeStampPageIndex, { ...stamp, x: newX, y: newY });
        } else if (interactionMode === 'resizing') {
          const minSize = 20;
          const newWidth = Math.max(minSize, dims.width + (deltaX * scaleFactorX));
          const newHeight = Math.max(minSize, dims.height + (deltaY * scaleFactorY));
          onUpdateStamp(activeStampPageIndex, { ...stamp, width: newWidth, height: newHeight });
        }
      } finally {
        rafScheduledRef.current = false;
      }
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setInteractionMode('none');
    setActiveStampId(null);
    setActiveStampPageIndex(-1);
  };

  const handlePageClick = (e: React.MouseEvent, pageIndex: number) => {
      if (activeTool && activeTool !== 'none' && onToolPlace) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 1000;
        const y = ((e.clientY - rect.top) / rect.height) * 1000;
        
        if (activeTool === 'text') {
            setFocusLastAdded(true);
        }
        
        onToolPlace(pageIndex, x, y);
      }
  };

  const toggleCheck = (pageIndex: number, stamp: StampData, rowIndex: number, side: 'left' | 'right') => {
    if (stamp.type === 'SIGNATURE' || stamp.type === 'FREE_CHECK' || stamp.type === 'FREE_TEXT') return;
    const newRows = [...stamp.rows];
    const field = newRows[rowIndex][side];
    if (field) {
        newRows[rowIndex][side] = { ...field, checked: !field.checked };
        onUpdateStamp(pageIndex, { ...stamp, rows: newRows });
    }
  };

  const handleNotesChange = (pageIndex: number, stamp: StampData, val: string) => {
    if (val === undefined || val === null) return;
    onUpdateStamp(pageIndex, { ...stamp, notes: val.toUpperCase() });
  };

  const renderOverlayContent = (pageIndex: number, stamp: StampData) => {
    const isLocked = appMode === 'dirigente' && isStandardStamp(stamp.type);
    const isDirigentePdfFlow = appMode === 'dirigente' && workMode === 'standard';
    const hideStructureOnly = isDirigentePdfFlow && isStandardStamp(stamp.type);
    
    if (stamp.type === 'SIGNATURE') {
        return <img src={stamp.imageUrl} alt="Firma" className="w-full h-full object-contain pointer-events-none" />;
    }

    if (stamp.type === 'FREE_CHECK') {
        return (
            <div className="w-full h-full flex items-center justify-center pointer-events-none relative">
                 <svg viewBox="0 0 24 24" className="w-[160%] h-[160%] text-black drop-shadow-[0_0_8px_white] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <path fill="currentColor" stroke="black" strokeWidth="1.2" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                 </svg>
            </div>
        );
    }

    if (stamp.type === 'FREE_TEXT') {
        const isDirigentePdfFlow = appMode === 'dirigente' && workMode === 'standard';
        const hideStructureOnly = isDirigentePdfFlow;
        const isTransparent = stamp.isTransparent ?? true;

        return (
            <div className="w-full h-full p-0 relative overflow-visible flex flex-col items-center group/text bg-transparent">
                 {/* Highlighter Mirror (Visual Only - simula l'effetto highlighter del PDF) */}
                 {isTransparent && (
                    <div 
                        aria-hidden="true"
                        className="absolute top-0 left-0 w-full h-full p-2 font-sans font-normal leading-tight text-center pointer-events-none z-[105]"
                        style={{ 
                            fontSize: `5.5cqw`, 
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: 'transparent',
                            marginTop: '0',
                        }}
                    >
                        <span style={{ 
                            backgroundColor: 'white', 
                            boxDecorationBreak: 'clone',
                            WebkitBoxDecorationBreak: 'clone',
                            padding: '0.12em 0.22em'
                        }}>
                            {stamp.notes}
                        </span>
                    </div>
                 )}

                 <textarea 
                    id={`textarea-${stamp.id}`}
                    value={stamp.notes}
                    onChange={(e) => {
                        handleNotesChange(pageIndex, stamp, e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onMouseDown={(e) => e.stopPropagation()} 
                    onPointerDown={(e) => e.stopPropagation()} 
                    className="resize-none outline-none text-black font-sans font-normal leading-tight text-center w-full block p-2 overflow-visible relative z-[110]"
                    placeholder={hideStructureOnly ? "" : "SCRIVI QUI..."}
                    style={{ 
                        fontSize: `5.5cqw`, 
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        height: 'auto',
                        minHeight: '100%',
                        textShadow: EXTRA_THICK_HALO,
                        backgroundColor: isTransparent ? 'rgba(0,0,0,0)' : 'white',
                        marginTop: isTransparent ? '0' : '-1px', // Copre la linea di chiusura del timbro
                        border: hideStructureOnly ? 'none' : '1px dashed rgba(128,128,128,0.6)',
                        boxShadow: isTransparent ? 'none' : '0 1px 0 0 white',
                        color: 'black'
                    }}
                />
            </div>
        );
    }

    const borderColor = isLocked ? 'rgba(0, 0, 0, 0.4)' : '#000000'; // Tutte le etichette nere
    const displayBorderColor = hideStructureOnly ? 'transparent' : '#c60c30'; // La struttura del timbro resta rossa
    const totalUnits = Math.max(5, stamp.rows.length + 2.5);
    const uniformFontSizeCqw = getUniformLabelFontSizeCqw(stamp.rows);
    const cellBorder = '0.5px solid transparent'; 

    return (
        <div className="flex flex-col h-full w-full bg-transparent overflow-visible relative" 
             style={{ 
                border: 'none'
             }}>
            
            {/* Overlay Struttura Rossa (Sempre sopra gli highlighter) */}
            {!hideStructureOnly && (
                <div className="absolute inset-0 pointer-events-none z-[120]">
                    {/* Bordo Esterno (Solo per Header + Righe, esclude area Note) */}
                    <div className="absolute top-0 left-0 right-0" 
                         style={{ 
                            height: `${((1.25 + stamp.rows.length) / totalUnits) * 100}%`,
                            borderTop: '1.5px solid #c60c30', 
                            borderLeft: '1.5px solid #c60c30', 
                            borderRight: '1.5px solid #c60c30' 
                         }} />
                    
                    {/* Divisore Header */}
                    <div className="absolute left-0 right-0" 
                         style={{ 
                            top: `${(1.25 / totalUnits) * 100}%`, 
                            height: '0', 
                            borderTop: '1.5px solid #c60c30' 
                         }} />
                    
                    {/* Divisori Righe */}
                    {stamp.rows.map((row, idx) => (
                        <React.Fragment key={idx}>
                            {/* Linea Orizzontale Sotto la Riga */}
                            <div className="absolute left-0 right-0" 
                                 style={{ 
                                    top: `${((1.25 + idx + 1) / totalUnits) * 100}%`, 
                                    height: '0', 
                                    borderTop: '1.5px solid #c60c30' 
                                 }} />
                            
                            {/* Linea Verticale Centrale (Sempre presente al 50% per dividere le celle, tranne se fullWidth) */}
                            {!row.isFullWidth && (
                                <div className="absolute" 
                                     style={{ 
                                        top: `${((1.25 + idx) / totalUnits) * 100}%`, 
                                        left: '50%', 
                                        width: '0', 
                                        height: `${(1 / totalUnits) * 100}%`, 
                                        borderLeft: '1.5px solid #c60c30' 
                                     }} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Header */}
            <div className={`relative flex items-stretch justify-between text-white overflow-hidden shrink-0 z-20`} 
                 style={{ 
                    height: `${(1.25 / totalUnits) * 100}%`, 
                    backgroundColor: hideStructureOnly ? 'transparent' : '#c60c30',
                    borderBottom: 'none',
                    opacity: 1, 
                    pointerEvents: hideStructureOnly ? 'none' as any : 'auto'
                 }}>
                 
                {/* Left Cell - 25% width - VUOTA (Cella Trasparente) */}
                <div className="w-[25%] bg-transparent h-full"></div>

                {/* Center Cell - 50% width - TESTO CENTRATO (Cella Trasparente) */}
                <div className="w-[50%] flex items-center justify-center relative h-full bg-transparent">
                    {!hideStructureOnly && (
                        <span className="block uppercase font-extrabold text-center relative z-10 w-full" 
                              style={{ 
                                fontSize: '7.8cqw', 
                                lineHeight: 1,
                                color: 'white',
                                whiteSpace: 'nowrap'
                              }}>
                            {stamp.title}
                        </span>
                    )}
                </div>

                {/* Right Cell (FIRMA) - 25% width - DESTRA (Cella Trasparente) */}
                <div className="w-[25%] flex items-center justify-end h-full relative overflow-hidden bg-transparent">
                    {!hideStructureOnly && (
                        <>
                            {(stamp.type === 'DOIT_VE' && doitSignatureUrl) && (
                                <img 
                                    src={doitSignatureUrl} 
                                    alt="Firma" 
                                    className="absolute right-0 top-0 h-full w-full object-fill pointer-events-none"
                                    style={{ 
                                        maxWidth: 'none',
                                        display: 'block'
                                    }}
                                />
                            )}
                            {(isStandardStamp(stamp.type) && stamp.type !== 'DOIT_VE') && (
                                <img 
                                    src="https://i.imgur.com/pGhDap2.png" 
                                    alt="Firma" 
                                    className="absolute right-0 top-0 h-full w-full object-fill pointer-events-none"
                                    style={{ 
                                        maxWidth: 'none',
                                        display: 'block'
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Rows */}
            {stamp.rows.map((row, idx) => (
                <div 
                    key={idx} 
                    className={`relative flex shrink-0 z-10 bg-transparent`} 
                    style={{ 
                        height: `${(1 / totalUnits) * 100}%`, 
                        borderBottom: 'none'
                    }}
                >
                    {/* Full Width Row (e.g. SEGRETERIA) */}
                     {row.isFullWidth && row.left && (
                         <div className="flex w-full h-full items-stretch">
                             {/* Empty left cell */}
                            <div className="w-1/2 bg-transparent" style={{ borderRight: 'none' }}></div>
                            {/* Right cell split into Label Cell (75%) and Checkbox Cell (25%) */}
                            <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent">
                                 {/* Label Cell */}
                                <div className={`w-[75%] flex items-center justify-center relative z-[5] px-1 ${hideStructureOnly ? 'bg-transparent' : 'bg-white'}`}>
                                    <span className={`uppercase font-bold text-center leading-none shrink select-none whitespace-normal ${hideStructureOnly ? 'hidden' : 'block'}`}
                                           style={{ 
                                             fontSize: `${uniformFontSizeCqw}cqw`, 
                                             color: '#c60c30',
                                             textShadow: THICK_WHITE_HALO
                                           }}>
                                         {row.left.label}
                                     </span>
                                 </div>
                                 {/* Checkbox Cell (Cella Trasparente) */}
                                 <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                     <div className={`aspect-square h-[84%] flex items-center justify-center shrink-0 cursor-pointer relative z-20 ${hideStructureOnly ? 'bg-transparent border-transparent' : 'bg-transparent'}`}
                                          style={{ border: hideStructureOnly ? 'none' : `1.5px solid #c60c30` }}
                                          onPointerDown={(e) => e.stopPropagation()} 
                                          onClick={() => toggleCheck(pageIndex, stamp, idx, 'left')}>
                                         {row.left.checked && (
                                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                                                 <svg viewBox="0 0 24 24" className={`${hideStructureOnly ? 'w-[180%] h-[180%]' : 'w-[160%] h-[160%]'} text-black drop-shadow-[0_0_8px_white]`}>
                                                     <path fill="currentColor" stroke="black" strokeWidth="1.2" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                                 </svg>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             </div>
                         </div>
                     )}
 
                     {/* Split Row */}
                     {!row.isFullWidth && (
                         <div className="flex w-full h-full items-stretch">
                             {/* Left Cell split into Label Cell (75%) and Checkbox Cell (25%) */}
                             <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent"
                                  style={{ borderRight: 'none' }}>
                                 {row.left && (
                                     <>
                                         {/* Label Cell */}
                                        <div className={`w-[75%] flex items-center justify-center relative z-[5] px-1 ${hideStructureOnly ? 'bg-transparent' : 'bg-white'}`}>
                                            <span className={`uppercase font-bold text-center leading-none shrink select-none whitespace-normal ${hideStructureOnly ? 'hidden' : 'block'}`}
                                          style={{ 
                                            fontSize: `${uniformFontSizeCqw}cqw`, 
                                            color: '#c60c30',
                                            textShadow: THICK_WHITE_HALO
                                          }}>
                                        {row.left.label}
                                    </span>
                                         </div>
                                         {/* Checkbox Cell (Cella Trasparente) */}
                                         <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                             <div className={`aspect-square h-[84%] flex items-center justify-center shrink-0 cursor-pointer relative z-20 ${hideStructureOnly ? 'bg-transparent border-transparent' : 'bg-transparent'}`}
                                                  style={{ border: hideStructureOnly ? 'none' : `1.5px solid #c60c30` }}
                                                  onPointerDown={(e) => e.stopPropagation()} 
                                                  onClick={() => toggleCheck(pageIndex, stamp, idx, 'left')}>
                                                 {row.left.checked && (
                                                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                                                         <svg viewBox="0 0 24 24" className={`${hideStructureOnly ? 'w-[160%] h-[160%]' : 'w-[125%] h-[125%]'} text-black drop-shadow-[0_0_8px_white]`}>
                                                             <path fill="currentColor" stroke="black" strokeWidth="1.2" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                                         </svg>
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     </>
                                 )}
                             </div>
                             {/* Right Cell split into Label Cell (75%) and Checkbox Cell (25%) */}
                             <div className="w-1/2 flex items-stretch h-full overflow-hidden bg-transparent">
                                 {row.right && (
                                     <>
                                         {/* Label Cell */}
                                        <div className={`w-[75%] flex items-center justify-center relative z-[5] px-1 ${hideStructureOnly ? 'bg-transparent' : 'bg-white'}`}>
                                           <span className={`uppercase font-bold text-center leading-none shrink select-none whitespace-normal ${hideStructureOnly ? 'hidden' : 'block'}`}
                                         style={{ 
                                           fontSize: `${uniformFontSizeCqw}cqw`, 
                                           color: '#c60c30',
                                           textShadow: THICK_WHITE_HALO
                                         }}>
                                       {row.right.label}
                                   </span>
                                        </div>
                                         {/* Checkbox Cell (Cella Trasparente) */}
                                         <div className="w-[25%] flex items-center justify-end pr-[4%] bg-transparent">
                                             <div className={`aspect-square h-[84%] flex items-center justify-center shrink-0 cursor-pointer relative z-20 ${hideStructureOnly ? 'bg-transparent border-transparent' : 'bg-transparent'}`}
                                                  style={{ border: hideStructureOnly ? 'none' : `1.5px solid #c60c30` }}
                                                  onPointerDown={(e) => e.stopPropagation()} 
                                                  onClick={() => toggleCheck(pageIndex, stamp, idx, 'right')}>
                                                 {row.right.checked && (
                                                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                                                         <svg viewBox="0 0 24 24" className={`${hideStructureOnly ? 'w-[180%] h-[180%]' : 'w-[160%] h-[160%]'} text-black drop-shadow-[0_0_8px_white]`}>
                                                             <path fill="currentColor" stroke="black" strokeWidth="1.2" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                                         </svg>
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     </>
                                 )}
                             </div>
                         </div>
                     )}
                </div>
            ))}

            <div className={`flex-1 notes-area p-0 relative overflow-visible z-[105] flex flex-col pt-0.5`}>
                {/* Placeholder "NOTE" Grigio Chiarissimo */}
                <div className="absolute inset-0 bg-[#f9f9f9] flex items-center justify-center pointer-events-none z-[100] border-t-0"
                     style={{ marginTop: '-1px' }}>
                    <span className="text-gray-300 italic font-medium select-none uppercase" style={{ fontSize: '4.5cqw', letterSpacing: '0.1em' }}>
                        Note
                    </span>
                </div>

                <textarea 
                    value={stamp.notes}
                    onChange={(e) => {
                        handleNotesChange(pageIndex, stamp, e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()} 
                    className="w-full resize-none outline-none text-black font-sans font-normal leading-tight text-center relative z-[106] p-2 block overflow-visible"
                    style={{ 
                        fontSize: `5.5cqw`, 
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        height: 'auto',
                        textShadow: EXTRA_THICK_HALO,
                        backgroundColor: stamp.notes ? 'white' : 'transparent',
                        marginTop: '-1px', 
                        boxShadow: stamp.notes ? '0 1px 0 0 white' : 'none' 
                    }}
                />
            </div>
        </div>
    );
  };

  let cursorStyle = 'default';
  if (activeTool === 'check') {
     // Cursor with DARK GRAY fill and white outline for contrast
     cursorStyle = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24'%3E%3Cpath fill='%23333333' stroke='white' stroke-width='1.5' d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E") 12 12, auto`;
  } else if (activeTool === 'text') {
     // Dashed gray box with white fill and "Apponi Testo" text
     cursorStyle = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40' viewBox='0 0 120 40'%3E%3Crect x='1' y='1' width='118' height='38' fill='white' fill-opacity='0.9' stroke='gray' stroke-width='2' stroke-dasharray='4' /%3E%3Ctext x='60' y='24' font-family='sans-serif' font-size='10' font-weight='bold' fill='black' text-anchor='middle'%3EApponi Campo di Testo%3C/text%3E%3C/svg%3E") 60 20, text`;
  } else if (activeTool === 'signature') {
     cursorStyle = 'crosshair';
  }

  return (
    <div className="flex-1 flex flex-col h-full relative bg-slate-100 overflow-hidden" 
         onPointerUp={handlePointerUp} onPointerMove={handlePointerMove}>
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-[100] shrink-0">
        <div className="flex items-center gap-2">
           <span className="font-semibold text-gray-700">Pagina {activePageIndex + 1}</span>
           <button onClick={scrollToTop} className="ml-2 text-xs font-bold text-[#c60c30] hover:bg-red-50 px-2 py-1 rounded uppercase border border-[#c60c30]/20">INIZIO DOCUMENTO</button>
        </div>
        <div className="flex items-center gap-3">
            {workMode === 'archive' && appMode === 'segreteria' ? (
                <>
                    <button onClick={onPrevDocument} disabled={currentDocIndex <= 0} className="px-3 py-2 rounded-lg text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-30"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                    <button onClick={onConfirm} className="px-3 py-2 rounded-lg text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-30">
                        {isLastDocument ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        )}
                    </button>
                    <button onClick={onExportArchive} className="px-4 py-1.5 rounded-lg text-white bg-[#006341] hover:bg-[#004d33] font-bold text-xs uppercase">ESPORTA JSON</button>
                </>
            ) : (
                <>
                    <button onClick={onSkip} className="px-4 py-1.5 rounded-lg text-white bg-gray-600 hover:bg-gray-700 font-bold text-xs uppercase">LETTO</button>
                    <button onClick={onConfirm} className="px-4 py-1.5 rounded-lg text-white bg-[#c60c30] hover:bg-[#a10a26] font-bold text-xs uppercase">{appMode === 'dirigente' ? 'FINALIZZA' : 'SALVA MODIFICHE'}</button>
                </>
            )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-8 flex flex-col items-center scroll-smooth" style={{ touchAction: 'pan-y' }}>
        {pages.map((page, index) => (
            <div key={page.pageNumber} id={`page-container-${index}`} data-page-index={index} 
                 className="page-wrapper relative bg-white shadow-xl page-image mb-8 border border-gray-200" 
                 style={{ width: 'fit-content', cursor: cursorStyle }} 
                 onClick={(e) => handlePageClick(e, index)}>
                
                {/* Rendering logic for pages */}
                {page.imageUrl ? (
                    <img 
                        src={page.imageUrl} 
                        alt={`Page ${page.pageNumber}`} 
                        className="max-w-full md:max-w-[1000px] block select-none pointer-events-none" 
                        draggable={false} 
                    />
                ) : (
                    <div className="w-[1000px] aspect-[1/1.41] bg-white flex flex-col items-center justify-center gap-4">
                         <div className="w-12 h-12 border-4 border-[#c60c30] border-t-transparent rounded-full animate-spin"></div>
                         <p className="text-gray-400 font-bold text-sm uppercase tracking-widest">Rendering Pagina {page.pageNumber}...</p>
                    </div>
                )}

                {[...page.stamps].sort((a, b) => {
                    const weight = (s: any) => s.type === 'FREE_TEXT' ? 2 : (s.type === 'SIGNATURE' ? 1 : 0);
                    return weight(a) - weight(b);
                }).map(stamp => {
                    const isLocked = appMode === 'dirigente' && isStandardStamp(stamp.type);
                    const mainBorderColor = isLocked ? 'rgba(198, 12, 48, 0.4)' : '#c60c30';
                    const isOverlayVisible = !(appMode === 'dirigente' && workMode === 'standard' && isStandardStamp(stamp.type));
                    
                    return (
                    <div key={stamp.id} className="absolute select-none group stamp-container"
                        style={{
                            left: `${stamp.x / 10}%`, top: `${stamp.y / 10}%`,
                            width: `${stamp.width / 10}%`, height: `${stamp.height / 10}%`,
                            zIndex: (stamp.type === 'FREE_TEXT' || stamp.type === 'FREE_CHECK') ? 150 : (activeStampId === stamp.id ? 80 : 70),
                            backgroundColor: 'transparent', boxSizing: 'border-box', fontFamily: 'Inter, Helvetica, sans-serif', fontWeight: 'bold',
                            border: (!isOverlayVisible || stamp.type === 'SIGNATURE' || stamp.type === 'FREE_CHECK' || isStandardStamp(stamp.type)) ? 'none' : `1.5px solid ${mainBorderColor}`, 
                            color: '#c60c30', touchAction: isLocked ? 'auto' : 'none',
                            overflow: 'visible' 
                        }}
                        onPointerDown={(e) => handlePointerDownMove(e, index, stamp, isLocked)}>
                
                <style>{`
                    .stamp-container { container-type: size; }
                `}</style>
                {renderOverlayContent(index, stamp)}
                
                {(!isLocked && stamp.type === 'FREE_TEXT') && (
                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center shadow-md z-[160] cursor-move hover:bg-black"
                         title="Sposta">
                         <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                         </svg>
                    </div>
                )}

                {!isLocked && (
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemoveStamp?.(index, stamp.id); }} 
                            className="absolute -top-3 -right-3 w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs shadow-md z-[160] hover:bg-black">✕</button>
                )}

                {!isLocked && (
                        <div className="absolute cursor-nwse-resize z-[110] flex items-end justify-end p-0.5" 
                             style={{ bottom: '1.5px', right: '1.5px' }}
                             onPointerDown={(e) => handlePointerDownResize(e, index, stamp, isLocked)}>
                            <div className="w-3 h-3 bg-[#c60c30]" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}></div>
                        </div>
                        )}
                    </div>
                )})}
            </div>
        ))}
      </div>
    </div>
  );
};
