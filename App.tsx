
import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MainView } from './components/MainView';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MailModal } from './components/MailModal'; 
import { convertPdfToImages, convertPdfToImagesProgressive, savePdfWithAnnotations, extractStampDataFromPdf } from './services/pdf';
import { createStamp, StampType } from './services/stampUtils';
import { PageData, DocumentData, StampData, AppMode, WorkMode } from './types';
import { processSignatureImage } from './services/imageUtils';
import { createArchiveJSON, parseArchiveJSON } from './services/dataUtils';

const doitSignaturePath = "/timbri/DOIT_VE.png";

function App() {
  const [appMode, setAppMode] = useState<AppMode>('selection');
  const [workMode, setWorkMode] = useState<WorkMode>('standard');
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [currentDocIndex, setCurrentDocIndex] = useState<number>(-1);
  const [visiblePageIndex, setVisiblePageIndex] = useState<number>(0);
  
  const [activeTool, setActiveTool] = useState<'none' | 'check' | 'text' | 'signature'>('none');
  const [pendingSignatureUrl, setPendingSignatureUrl] = useState<string | null>(null);
  const [showMailModal, setShowMailModal] = useState<boolean>(false);
  const [lastArchiveJson, setLastArchiveJson] = useState<string | undefined>(undefined);

  const resetSession = useCallback(() => {
      setAppMode('selection');
      setWorkMode('standard');
      setDocuments([]); 
      setCurrentDocIndex(-1); 
      setVisiblePageIndex(0);
      setActiveTool('none');
      setPendingSignatureUrl(null);
      setShowMailModal(false);
      setLastArchiveJson(undefined);
  }, []);

  const handleGoHome = useCallback(() => {
      const shouldAbort = window.confirm(
        "ATTENZIONE:\nTornando alla Home, l'elaborazione corrente verrà INTERROTTA e tutti i dati non salvati andranno PERSI definitivamente.\n\nVuoi abortire l'operazione?"
      );
      if (shouldAbort) {
        resetSession();
      }
  }, [resetSession]);

  const handleSelectMode = (mode: AppMode, workMode: WorkMode = 'standard') => {
      setAppMode(mode);
      setWorkMode(workMode);
  };

  const updateCurrentDocument = (updates: Partial<DocumentData>) => {
    setDocuments(prev => {
      const newDocs = [...prev];
      if (newDocs.length === 0) return newDocs;
      
      if (currentDocIndex >= 0 && currentDocIndex < newDocs.length) {
        newDocs[currentDocIndex] = { ...newDocs[currentDocIndex], ...updates };
      }
      return newDocs;
    });
  };

  const updateCurrentDocumentPage = (pageIndex: number, updates: Partial<PageData>) => {
    setDocuments(prev => {
      const newDocs = [...prev];
      if (newDocs.length === 0) return newDocs;

      if (currentDocIndex >= 0 && currentDocIndex < newDocs.length) {
        const doc = { ...newDocs[currentDocIndex] };
        const newPages = [...doc.pages];
        newPages[pageIndex] = newPages[pageIndex] ? { ...newPages[pageIndex], ...updates } : (updates as PageData);
        doc.pages = newPages;
        newDocs[currentDocIndex] = doc;
      }
      return newDocs;
    });
  };

  const handleFiles = async (fileList: File[]) => {
      if (fileList.length === 0) return;

      const jsonFile = fileList.find(f => f.name.endsWith('.json'));
      
      if (jsonFile) {
          try {
              const text = await jsonFile.text();
              const archivedDocs = parseArchiveJSON(text);
              setDocuments(prev => [...prev, ...archivedDocs]);
              if (appMode === 'dirigente') {
                  setWorkMode('archive');
              }
              
              if (currentDocIndex === -1) {
                  setCurrentDocIndex(0);
                  setVisiblePageIndex(0);
              }
              return;
          } catch (err) {
              alert("Errore nel caricamento del file Archivio.");
              console.error(err);
          }
      }

      const newDocs: DocumentData[] = fileList
        .filter(f => f.type === 'application/pdf')
        .map((file: File) => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            name: file.name,
            pages: [],
            status: 'pending'
        }));

      setDocuments(prev => [...prev, ...newDocs]);
      
      if (currentDocIndex === -1 && newDocs.length > 0) {
        setCurrentDocIndex(0);
        setVisiblePageIndex(0);
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDroppedFiles = (files: File[]) => {
      handleFiles(files);
  };

  useEffect(() => {
    const processDocument = async () => {
      if (currentDocIndex === -1 || !documents[currentDocIndex]) return;
      const doc = documents[currentDocIndex];
      
      // Rigenera se pendente o se le immagini mancano (caso tipico caricamento da JSON ottimizzato)
      const needsRendering = doc.status === 'pending' || (doc.pages.length > 0 && !doc.pages[0].imageUrl);

      if (needsRendering && doc.status !== 'processing') {
        const originalStatus = doc.status;
        updateCurrentDocument({ status: 'processing' });
        
        try {
          const pdfBytes = doc.pdfBytes || await doc.file.arrayBuffer();
          
          const renderedPages = await convertPdfToImagesProgressive(pdfBytes, (page, idx) => {
             setDocuments(prevDocs => {
               if (currentDocIndex < 0 || currentDocIndex >= prevDocs.length) return prevDocs;
               const newDocs = [...prevDocs];
               const currentDoc = { ...newDocs[currentDocIndex] };
               if (!currentDoc || !currentDoc.pages) return prevDocs;
               const currentPages = [...currentDoc.pages];
               const existingPage = currentPages[idx];
               
               currentPages[idx] = {
                 ...page,
                 stamps: (existingPage?.stamps && existingPage.stamps.length > 0) ? existingPage.stamps : page.stamps,
                 userAnnotation: existingPage?.userAnnotation || page.userAnnotation
               };
               
               currentDoc.pages = currentPages;
               newDocs[currentDocIndex] = currentDoc;
               return newDocs;
             });
           });
 
           // Final merge: Ensure we keep any stamps added during the entire rendering process
           setDocuments(prevDocs => {
             if (currentDocIndex < 0 || currentDocIndex >= prevDocs.length) return prevDocs;
             const newDocs = [...prevDocs];
             const currentDoc = { ...newDocs[currentDocIndex] };
             if (!currentDoc || !currentDoc.pages) return prevDocs;
             
             let mergedPages = renderedPages.map((newPage, idx) => {
               const existing = currentDoc.pages[idx];
               return {
                 ...newPage,
                 stamps: (existing?.stamps && existing.stamps.length > 0) ? existing.stamps : newPage.stamps,
                 userAnnotation: existing?.userAnnotation || newPage.userAnnotation
               };
             });
             
             currentDoc.pages = mergedPages;
             currentDoc.status = originalStatus === 'pending' ? 'ready' : originalStatus;
             currentDoc.pdfBytes = pdfBytes;
             newDocs[currentDocIndex] = currentDoc;
             return newDocs;
           });

          // Check for extracted stamps only if we don't have any yet
          const checkExtraction = async () => {
             const extractedStamps = await extractStampDataFromPdf(pdfBytes);
             if (extractedStamps) {
               setDocuments(prevDocs => {
                 if (currentDocIndex < 0 || currentDocIndex >= prevDocs.length) return prevDocs;
                 const newDocs = [...prevDocs];
                 const currentDoc = { ...newDocs[currentDocIndex] };
                 if (!currentDoc || !currentDoc.pages) return prevDocs;
                 const newPages = [...currentDoc.pages];
                 Object.keys(extractedStamps).forEach(pageIdx => {
                   const idx = Number(pageIdx);
                   // FIX: Apply extracted stamps ONLY if there are no existing stamps (user or otherwise)
                   // This prevents overwriting user actions that happened during processing
                   if (newPages[idx]) {
                       const currentStamps = newPages[idx].stamps;
                       if (!currentStamps || currentStamps.length === 0) {
                           newPages[idx].stamps = extractedStamps[idx];
                       }
                   }
                 });
                 currentDoc.pages = newPages;
                 newDocs[currentDocIndex] = currentDoc;
                 return newDocs;
               });
             }
          };
          checkExtraction();

        } catch (err) {
          console.error("PDF Conversion failed", err);
          updateCurrentDocument({ status: originalStatus === 'pending' ? 'pending' : originalStatus });
        }
      }
    };
    processDocument();
  }, [currentDocIndex, documents[currentDocIndex]?.status]); 

  const handleAddStamp = (type: StampType) => {
    if (currentDocIndex === -1) return;
    const currentPage = documents[currentDocIndex].pages[visiblePageIndex];
    const baseFontSize = currentPage?.baseFontSize;
    const newStamp = createStamp(type, baseFontSize);
    updateCurrentDocumentPage(visiblePageIndex, { stamps: [...(currentPage.stamps || []), newStamp] });
  };

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentDocIndex === -1) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const transparentImageUrl = await processSignatureImage(file);
        setPendingSignatureUrl(transparentImageUrl);
        setActiveTool('signature');
    } catch (err) {
        console.error("Signature processing error", err);
        alert("Errore caricamento firma");
    }
  };

  const handleToolPlace = (pageIndex: number, x: number, y: number) => {
    if (currentDocIndex === -1 || activeTool === 'none') return;
    
    let stamp: StampData | null = null;
    if (activeTool === 'check') {
        stamp = {
            id: `check-${Date.now()}`,
            type: 'FREE_CHECK',
            title: 'Spunta',
            rows: [], notes: '',
            x: x - 12.5, y: y - 12.5,
            width: 25, height: 25, scale: 1
        };
    } else if (activeTool === 'text') {
        stamp = {
            id: `text-${Date.now()}`,
            type: 'FREE_TEXT',
            title: 'Testo',
            rows: [], notes: '',
            x: x - 100, y: y - 25,
            width: 200, height: 50, scale: 1,
            isTransparent: true 
        };
    } else if (activeTool === 'signature' && pendingSignatureUrl) {
        stamp = {
            id: `sig-${Date.now()}`,
            type: 'SIGNATURE',
            title: 'Firma',
            rows: [],
            notes: '',
            x: x - 100, y: y - 50,
            width: 200, height: 100,
            scale: 1,
            imageUrl: pendingSignatureUrl
        };
        setPendingSignatureUrl(null);
    }

    if (stamp) {
        const currentPage = documents[currentDocIndex].pages[pageIndex];
        updateCurrentDocumentPage(pageIndex, { stamps: [...(currentPage.stamps || []), stamp] });
        
        // Only disable tool for text or signature, allow 'check' to stay active for multiple placements
        if (activeTool !== 'check') {
            setActiveTool('none');
        }
    }
  };

  const handleUpdateStamp = (pageIndex: number, stamp: StampData) => {
      const currentPage = documents[currentDocIndex].pages[pageIndex];
      if (!currentPage || !currentPage.stamps) return;
      const newStamps = currentPage.stamps.map(s => s.id === stamp.id ? stamp : s);
      updateCurrentDocumentPage(pageIndex, { stamps: newStamps });
  }

  const handleRemoveStamp = (pageIndex: number, stampId: string) => {
      const currentPage = documents[currentDocIndex].pages[pageIndex];
      if (!currentPage || !currentPage.stamps) return;
      const newStamps = currentPage.stamps.filter(s => s.id !== stampId);
      updateCurrentDocumentPage(pageIndex, { stamps: newStamps });
  }

  const handleCompletion = async () => {
    if (window.confirm("Elaborazione completata! Vuoi generare una mail per notificare?")) {
        if (appMode === 'segreteria' && workMode === 'archive') {
            try {
                const jsonString = await createArchiveJSON(documents);
                setLastArchiveJson(jsonString);
            } catch (err) {
                console.error("Failed to pre-generate JSON for mail", err);
            }
        }
        setShowMailModal(true);
    } else {
        resetSession();
    }
  };

  const writeWithTimeout = async (handle: any, blob: Blob, timeoutMs: number): Promise<void> => {
    let writable: any = null;
    let timeoutId: any;

    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(async () => {
        if (writable) {
          try {
            await writable.abort();
          } catch (abortErr) {
            console.warn("Failed to abort stream on timeout", abortErr);
          }
        }
        reject(new Error("TIMEOUT_LOCKED"));
      }, timeoutMs);
    });

    const writePromise = (async () => {
      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    })();

    try {
      await Promise.race([writePromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleNextDocument = async () => {
    if (currentDocIndex === -1 || !documents[currentDocIndex]) return;
    const doc = documents[currentDocIndex];

    if (appMode === 'segreteria' && workMode === 'archive') {
         updateCurrentDocument({ status: 'completed' });
         if (currentDocIndex < documents.length - 1) {
             setCurrentDocIndex(prev => prev + 1);
             setVisiblePageIndex(0);
         } else {
             if (window.confirm("Tutti i documenti della coda sono stati elaborati.\nVuoi generare la mail di notifica ora?\n(Assicurati di esportare il JSON per non perdere il lavoro)")) {
                 try {
                     const jsonString = await createArchiveJSON(documents);
                     setLastArchiveJson(jsonString);
                 } catch (err) {
                     console.error("Failed to pre-generate JSON for mail", err);
                 }
                 setShowMailModal(true);
             }
         }
         return;
    }

    let saveSuccess = false;
    let userCancelled = false;

    try {
      let sourceData: ArrayBuffer | File = doc.file;
      if (doc.pdfBytes) sourceData = doc.pdfBytes;

      const modifiedPdfBytes = await savePdfWithAnnotations(sourceData, doc.pages, appMode, doitSignaturePath);
      const blob = new Blob([modifiedPdfBytes.buffer], { type: 'application/pdf' });
      
      if ('showSaveFilePicker' in window) {
        let handle: any = null;
        try {
          handle = await (window as any).showSaveFilePicker({
            suggestedName: doc.name,
            types: [{
              description: 'PDF',
              accept: { 'application/pdf': ['.pdf'] }
            }],
          });
        } catch (e: any) {
          console.error("Errore apertura file picker:", e);
          if (e.name === 'AbortError') {
            userCancelled = true;
          } else {
            alert("Errore durante la scelta del file: " + (e.message || e));
          }
        }

        if (handle) {
          try {
            await writeWithTimeout(handle, blob, 5000); // 5 secondi di timeout
            saveSuccess = true;
          } catch (e: any) {
            console.error("Dettaglio errore scrittura:", e);
            if (e.message === "TIMEOUT_LOCKED") {
              alert("⚠️ L'operazione di salvataggio sta impiegando troppo tempo.\n\nControlla che il documento '" + doc.name + "' non sia aperto in un programma esterno alla web app (come Adobe Reader).\n\nPER FAVORE: Chiudi il programma esterno e riprova a salvare.");
            } else {
              alert("⚠️ IMPOSSIBILE SALVARE IL FILE\n\nNon riesco a scrivere il documento '" + doc.name + "'.\n\nQuasi certamente il file è aperto in Adobe Acrobat o un altro programma.\n\nPER FAVORE:\n1. Chiudi il PDF nel lettore esterno (es. Adobe Acrobat).\n2. Riprova a premere il pulsante di salvataggio/finalizzazione.");
            }
          }
        }
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = doc.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        saveSuccess = true;
      }

      // LOGICA INTELLIGENTE: Se il salvataggio è riuscito, procedi.
      // Se NON è riuscito e NON hai annullato tu, allora c'è un blocco (es. Adobe).
      if (saveSuccess) {
        if (currentDocIndex < documents.length - 1) {
          updateCurrentDocument({ status: 'completed' });
          setCurrentDocIndex(prev => prev + 1);
          setVisiblePageIndex(0);
        } else {
          updateCurrentDocument({ status: 'completed' });
          handleCompletion();
        }
      }

    } catch (globalError: any) {
      console.error("Global Save Error:", globalError);
      alert("ERRORE CRITICO: Si è verificato un problema tecnico durante l'elaborazione del PDF.\n\n" + String(globalError?.message || globalError));
    }
  };
  
  const handlePrevDocument = () => {
    if (currentDocIndex > 0) {
        setCurrentDocIndex(prev => prev - 1);
        setVisiblePageIndex(0);
    }
  };

  const handleSkipDocument = () => {
    if (currentDocIndex === -1) return;
    if (currentDocIndex < documents.length - 1) {
      updateCurrentDocument({ status: 'completed' }); 
      setCurrentDocIndex(prev => prev + 1);
      setVisiblePageIndex(0);
    } else {
      handleCompletion();
    }
  };

  const handleExportArchive = async () => {
      try {
          const jsonString = await createArchiveJSON(documents);
          setLastArchiveJson(jsonString); // Salva per l'eventuale mail successiva
          
          const formatArchiveFileName = () => {
              const now = new Date();
              const pad2 = (n: number) => String(n).padStart(2, '0');
              const dd = pad2(now.getDate());
              const mm = pad2(now.getMonth() + 1);
              const yyyy = now.getFullYear();
              const hh = pad2(now.getHours());
              const min = pad2(now.getMinutes());
              return `Corrispondenza_${dd}.${mm}.${yyyy}_ore_${hh}.${min}.json`;
          };

          const suggestedName = formatArchiveFileName();

          // Prefer the File System Access API to ask the user where to save
          if (typeof (window as any).showSaveFilePicker === 'function') {
              const handle = await (window as any).showSaveFilePicker({
                  suggestedName,
                  types: [
                      {
                          description: 'JSON',
                          accept: { 'application/json': ['.json'] }
                      }
                  ]
              });
              const writable = await handle.createWritable();
              await writable.write(new Blob([jsonString], { type: 'application/json' }));
              await writable.close();
          } else {
              // Fallback: trigger a download with the suggested filename
              const blob = new Blob([jsonString], { type: 'application/json' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = suggestedName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }

          handleCompletion();
      } catch (err) {
          console.error("Export failed", err);
          alert("Errore esportazione archivio");
      }
  };

  const currentDoc = currentDocIndex !== -1 ? documents[currentDocIndex] : null;

  if (appMode === 'selection') {
      return <WelcomeScreen onSelectMode={handleSelectMode} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden">
      <Header onToggleSidebar={() => {}} onGoHome={handleGoHome} />
      <div className="flex flex-1 relative overflow-hidden">
        <Sidebar 
          pages={currentDoc?.pages || []}
          selectedPageIndex={visiblePageIndex} 
          onSelectPage={(idx) => {
              const el = document.getElementById(`page-container-${idx}`);
              if (el) { el.scrollIntoView({ behavior: 'smooth' }); setVisiblePageIndex(idx); }
          }}
          onUpload={handleFileUpload}
          onUploadFiles={handleDroppedFiles}
          documentName={currentDoc?.name}
          currentDocIndex={currentDocIndex}
          totalDocs={documents.length}
          isOpen={true}
          onClose={() => {}}
          onAddStamp={handleAddStamp}
          mode={appMode}
          onUploadSignature={handleUploadSignature}
          activeTool={activeTool}
          onSetActiveTool={setActiveTool}
          doitSignatureUrl={doitSignaturePath}
          workMode={workMode}
          onExportArchive={handleExportArchive}
        />
        <MainView 
          pages={currentDoc?.pages || []} 
          onUpdateStamp={handleUpdateStamp}
          onRemoveStamp={handleRemoveStamp}
          activePageIndex={visiblePageIndex}
          onPageVisible={setVisiblePageIndex}
          onConfirm={handleNextDocument}
          onSkip={handleSkipDocument}
          isLastDocument={currentDocIndex === documents.length - 1}
          docStatus={currentDoc?.status}
          appMode={appMode}
          workMode={workMode}
          activeTool={activeTool}
          onToolPlace={handleToolPlace}
          doitSignatureUrl={doitSignaturePath}
          onExportArchive={handleExportArchive}
          onPrevDocument={handlePrevDocument}
          currentDocIndex={currentDocIndex}
        />
      </div>
      <MailModal 
        isOpen={showMailModal} 
        mode={appMode} 
        onClose={resetSession} 
        archiveJson={appMode === 'segreteria' && workMode === 'archive' ? lastArchiveJson : undefined} 
      />
    </div>
  );
}

export default App;
