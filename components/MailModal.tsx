import React, { useState, useEffect } from 'react';
import { AppMode } from '../types';

interface MailModalProps {
  isOpen: boolean;
  mode: AppMode;
  onClose: () => void; // Triggered when cancelled or finished
}

interface Recipient {
  label: string;
  email: string;
}

const SEGRETERIA_RECIPIENTS: Recipient[] = [
  { label: 'DOIT VE (P. Marini)', email: 'p.marini@rfi.it' },
  { label: 'ING VE (D. Demartini)', email: 'd.demartini@rfi.it' },
  { label: 'UTN VE (F. Zorzetto)', email: 'f.zorzetto@rfi.it' },
  { label: 'UTS VE (D. Galliccioli)', email: 'd.galliccioli@rfi.it' }
];

const DIRIGENTE_RECIPIENTS: Recipient[] = [
  { label: 'DOIT VE (Segreteria)', email: 'doit-ve-segreteria@rfi.it' },
  { label: 'ING VE (Segreteria)', email: 'Segr-ing.VE@rfi.it' },
  { label: 'UTN (A. Cappellesso)', email: 'a.cappellesso@rfi.it' },
  { label: 'UTS (G. Fabbri)', email: 'g.fabbri@rfi.it' }
];

export const MailModal: React.FC<MailModalProps> = ({ isOpen, mode, onClose }) => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [sharedPath, setSharedPath] = useState<string>('');
  
  // Set up data based on mode
  useEffect(() => {
    if (mode === 'segreteria') {
      setRecipients(SEGRETERIA_RECIPIENTS);
    } else {
      setRecipients(DIRIGENTE_RECIPIENTS);
    }
    setSelectedEmail('');
    setSharedPath('');
  }, [mode, isOpen]);

  // Autocompile shared path based on recipient
  useEffect(() => {
    if (!selectedEmail) return;

    let targetLabel = '';
    const recipient = recipients.find(r => r.email === selectedEmail);
    if (recipient) targetLabel = recipient.label.toUpperCase();

    // Check for DOIT VE
    if (targetLabel.includes('DOIT VE')) {
        setSharedPath('https://gruppofsitaliane.sharepoint.com/sites/RFI3/dtp-ve/SEGR/Forms/AllItems.aspx?e=5%3Acb1ba50305dd465c930ebfbd49c2d87e&sharingv2=true&fromShare=true&at=9&clickparams=eyAiWC1BcHBOYW1lIiA6ICJNaWNyb3NvZnQgT3V0bG9vayIsICJYLUFwcFZlcnNpb24iIDogIjE2LjAuMTY3MzEuMjA2MzYiLCAiT1MiIDogIldpbmRvd3MiIH0%3D&CID=bd612da1%2D10a1%2D8000%2De12c%2Dda5d38f46757&cidOR=SPO&FolderCTID=0x012000994FC3F634930B4E968190AF328C2E11&id=%2Fsites%2FRFI3%2Fdtp%2Dve%2FSEGR%2Fsegreteria%2F1CORRISPONDENZA&viewid=7b192df2%2D33be%2D4378%2D884e%2D1f223fed8c52');
    } 
    // Check for ING VE
    else if (targetLabel.includes('ING VE') || targetLabel.includes('INGEGNERIA')) {
        setSharedPath('https://gruppofsitaliane.sharepoint.com/sites/RFI3/dtp-ve/ING/Forms/AllItems.aspx?id=%2Fsites%2FRFI3%2Fdtp%2Dve%2FING%2FSEGR%2FCorrispondenza&viewid=d8eab92d%2D0dcc%2D4f6a%2D92b2%2D5205250bb6b8&p=true&fromShare=true&ovuser=4c8a6547%2D459a%2D4b75%2Da3dc%2Df66efe3e9c4e%2C964217%40rfi%2Eit&OR=Teams%2DHL&CT=1769767258238&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiI0OS8yNjAxMDQwMDkyNSIsIkhhc0ZlZGVyYXRlZFVzZXIiOmZhbHNlfQ%3D%3D');
    }
    else {
        setSharedPath('');
    }
  }, [selectedEmail, recipients]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    // Calcolo data e ora corrente
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateTimeStr = `${day}/${month}/${year} ore ${hours}:${minutes}`;

    let subject = "";
    let bodyHtml = "";
    
    // Formatta il link condivisa
    let sharedLinkHtml = "";
    if (sharedPath && sharedPath.trim().length > 0) {
        // Determina il nome da visualizzare
        let linkName = "LINK CONDIVISA";
        const recipient = recipients.find(r => r.email === selectedEmail);
        if (recipient) {
            const label = recipient.label.toUpperCase();
            if (label.includes("DOIT VE")) linkName = "LINK CONDIVISA DOIT VE";
            else if (label.includes("ING VE") || label.includes("INGEGNERIA")) linkName = "LINK CONDIVISA ING VE";
        }
        
        sharedLinkHtml = `<br><br><a href="${sharedPath}">${linkName}</a>`;
    }

    if (mode === 'segreteria') {
      subject = `NOTIFICA SEGRETERIA: Corrispondenza pronta per postille ${dateTimeStr}`;
      bodyHtml = `
        <p>NOTIFICA SEGRETERIA:</p>
        <p>Sono stati aggiunti nuovi documenti nella cartella condivisa della corrispondenza. Si prega il Dirigente di apporre postilla di inoltro.</p>
        ${sharedLinkHtml}
        <br><br>
        <p>Web App per elaborazione: <a href="https://doit-ve-gestore-corrispondenza.vercel.app/">https://doit-ve-gestore-corrispondenza.vercel.app/</a></p>
      `;
    } else {
      subject = `NOTIFICA DIRIGENTE: Corrispondenza pronta per inoltro ${dateTimeStr}`;
      bodyHtml = `
        <p>NOTIFICA DIRIGENTE:</p>
        <p>I documenti nella cartella condivisa della corrispondenza sono pronti per l'inoltro.</p>
        ${sharedLinkHtml}
        <br><br>
        <p>Web App per elaborazione: <a href="https://doit-ve-gestore-corrispondenza.vercel.app/">https://doit-ve-gestore-corrispondenza.vercel.app/</a></p>
      `;
    }

    // Construct EML content (HTML)
    const emlContent = `To: ${selectedEmail}
Subject: ${subject}
X-Unsent: 1
MIME-Version: 1.0
Content-Type: text/html; charset="UTF-8"

<!DOCTYPE html>
<html>
<body>
${bodyHtml}
</body>
</html>`;

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const fileName = `Notifica_${mode === 'segreteria' ? 'Dirigente' : 'Segreteria'}_${new Date().toISOString().slice(0, 10)}.eml`;

    // Save File logic
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Email Message',
            accept: { 'message/rfc822': ['.eml'] }
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback for browsers without File System Access API
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // Close and reset after successful save
      onClose();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Error saving EML:", err);
        alert("Errore durante il salvataggio del file mail.");
      }
    }
  };

  const isSegreteria = mode === 'segreteria';
  const themeColor = isSegreteria ? '#006341' : '#c60c30';
  const themeBg = isSegreteria ? 'bg-[#006341]' : 'bg-[#c60c30]';
  const themeBorder = isSegreteria ? 'border-[#006341]' : 'border-[#c60c30]';
  const themeHover = isSegreteria ? 'hover:bg-[#004d33]' : 'hover:bg-[#a10a26]';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-t-4 ${themeBorder}`}>
        
        {/* Header */}
        <div className={`p-4 ${themeBg} text-white`}>
          <h2 className="text-lg font-bold uppercase flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Invia Notifica Mail
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Genera un file <strong>.eml</strong> da inviare come notifica. Seleziona il destinatario e salva il file.
          </p>

          {/* Recipient Dropdown */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-700 uppercase">
              Destinatario ({isSegreteria ? 'Dirigente' : 'Segreteria'})
            </label>
            <select 
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-opacity-50 focus:outline-none text-sm"
              style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
            >
              <option value="">-- Seleziona --</option>
              {recipients.map(r => (
                <option key={r.email} value={r.email}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Shared Folder Path (Always visible now for both modes) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-700 uppercase">
              Percorso Cartella Condivisa (Opzionale)
            </label>
            <input 
              type="text"
              value={sharedPath}
              onChange={(e) => setSharedPath(e.target.value)}
              placeholder="es. \\server\condivisa\corrispondenza..."
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-opacity-50 focus:outline-none text-sm"
              style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50 transition-colors text-sm"
            >
              Annulla
            </button>
            <button
              onClick={handleGenerate}
              className={`flex-1 py-2 px-4 text-white font-medium rounded transition-colors text-sm shadow-md flex items-center justify-center gap-2 ${themeBg} ${themeHover}`}
            >
              <span>Genera Mail</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
