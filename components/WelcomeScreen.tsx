

import React, { useState } from 'react';
import { AppMode, WorkMode } from '../types';

interface WelcomeScreenProps {
  onSelectMode: (mode: AppMode, workMode: WorkMode) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectMode }) => {
  const [showSegreteriaOptions, setShowSegreteriaOptions] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      
      {/* Logo Area */}
      <div className="mb-4 flex flex-col items-center animate-fade-in-up">
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Rete_Ferroviaria_Italiana_logo.svg/960px-Rete_Ferroviaria_Italiana_logo.svg.png" 
          alt="Rete Ferroviaria Italiana" 
          className="h-24 md:h-32 w-auto object-contain mb-6"
        />
        <h1 className="text-2xl md:text-3xl font-bold text-[#006341] text-center uppercase">
          WEB APP CORRISPONDENZA
        </h1>
      </div>

      {/* Credits Area */}
      <div className="mb-12 flex justify-center animate-fade-in-up">
        <div className="group relative flex items-center justify-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-300 hover:text-gray-500 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <div className="absolute top-8 w-max bg-gray-50 border border-gray-200 text-gray-400 text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col items-center leading-none gap-0.5">
                <div className="font-normal text-gray-400">Powered by</div>
                <div className="font-normal text-gray-400">Simone Giungato (964217)</div>
                <div className="font-normal text-gray-400">DOIT VE</div>
             </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 text-gray-600 font-medium text-xs select-none">
        v1.0
      </div>

      {/* Buttons Container */}
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl transition-all duration-300">
        
        {/* Segreteria Button Group */}
        {!showSegreteriaOptions ? (
          <button
            onClick={() => setShowSegreteriaOptions(true)}
            className="flex-1 group relative overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-[#006341] transition-colors"></div>
            <div className="relative p-8 md:p-12 flex flex-col items-center justify-center h-full text-white">
              
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" className="text-white/40" />
                <path d="M14 2v6h6" className="text-white/40" />
                <g className="origin-center -translate-y-[4px] group-hover:translate-y-[1.5px] transition-transform duration-500 ease-out">
                   <g transform="scale(0.5)" transform-origin="12 12">
                       <path d="M12 1 C 10 1 8.5 2.5 8.5 4.5 V 9 H 15.5 V 4.5 C 15.5 2.5 14 1 12 1 Z" className="fill-white/10 text-white" />
                       <path d="M 10.5 9 H 13.5 V 12 H 10.5 Z" className="fill-white/10 text-white" />
                       <path d="M 6 12 H 18 V 16 H 6 Z" className="fill-white/10 text-white" />
                       <line x1="6" y1="16" x2="18" y2="16" className="text-white" strokeWidth="2" />
                   </g>
                </g>
              </svg>

              <span className="text-2xl md:text-3xl font-bold tracking-wider">SEGRETERIA</span>
              <span className="mt-2 text-green-100 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Predisposizione documenti
              </span>
            </div>
          </button>
        ) : (
          <div className="flex-1 flex flex-col gap-4 animate-fade-in-up">
              <button
                onClick={() => onSelectMode('segreteria', 'standard')}
                className="flex-1 bg-white border-2 border-[#006341] text-[#006341] rounded-2xl p-6 shadow-md hover:bg-[#006341] hover:text-white transition-all flex items-center gap-4 group"
              >
                  <div className="p-3 bg-green-50 rounded-full group-hover:bg-white/20 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l5.414 5.414a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" />
                      </svg>
                  </div>
                  <div className="text-left">
                      <div className="font-bold text-lg uppercase">MODALITÀ DOCUMENTALE CLASSICA</div>
                      <div className="text-xs opacity-80">Elabora, salva e scarica i PDF.</div>
                  </div>
              </button>

              <button
                onClick={() => onSelectMode('segreteria', 'archive')}
                className="flex-1 bg-white border-2 border-[#006341] text-[#006341] rounded-2xl p-6 shadow-md hover:bg-[#006341] hover:text-white transition-all flex items-center gap-4 group"
              >
                  <div className="p-3 bg-green-50 rounded-full group-hover:bg-white/20 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                  </div>
                  <div className="text-left">
                      <div className="font-bold text-lg uppercase">MODALITÀ DOCUMENTALE AVANZATA</div>
                      <div className="text-xs opacity-80">Genera un unico file JSON contenente lo stato di elaborazione.</div>
                  </div>
              </button>
              
              <button 
                onClick={() => setShowSegreteriaOptions(false)}
                className="text-gray-400 text-xs hover:text-gray-600 underline text-center py-2"
              >
                  Indietro
              </button>
          </div>
        )}

        {/* Dirigente Button */}
        {!showSegreteriaOptions && (
        <button
          onClick={() => onSelectMode('dirigente', 'standard')} // Dirigente always standard output
          className="flex-1 group relative overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
        >
          <div className="absolute inset-0 bg-[#c60c30] transition-colors"></div>
          <div className="relative p-8 md:p-12 flex flex-col items-center justify-center h-full text-white">
            
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" className="text-white/40" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" className="text-white/40" />
              <g className="translate-x-[14px] translate-y-[1px] group-hover:translate-x-[10px] group-hover:translate-y-[5px] transition-transform duration-500 ease-out origin-center">
                <g transform="scale(0.5)"> 
                    <path d="M19.07 4.93L17.07 2.93C16.68 2.54 16.05 2.54 15.66 2.93L4.24 14.35C4.09 14.5 4 14.7 4 14.91V19C4 19.55 4.45 20 5 20H9.09C9.3 20 9.5 19.91 9.65 19.76L21.07 8.34C21.46 7.95 21.46 7.32 21.07 6.93L19.07 4.93Z" className="fill-white/10 text-white" />
                </g>
              </g>
            </svg>

            <span className="text-2xl md:text-3xl font-bold tracking-wider">DIRIGENTE</span>
            <span className="mt-2 text-red-100 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              Finalizzazione documenti
            </span>
          </div>
        </button>
        )}

      </div>
    </div>
  );
};
