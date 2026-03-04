
import React from 'react';

interface HeaderProps {
  onToggleSidebar: () => void;
  onGoHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onGoHome }) => {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-2 md:px-4 shadow-sm z-50 relative justify-between gap-1 md:gap-2">
      {/* Left: Logo (Clickable as well) */}
      <div 
        onClick={() => onGoHome()}
        className="flex items-center shrink-0 w-auto md:w-1/4 md:min-w-[120px] cursor-pointer hover:opacity-80 transition-opacity"
      >
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Rete_Ferroviaria_Italiana_logo.svg/960px-Rete_Ferroviaria_Italiana_logo.svg.png" 
          alt="Rete Ferroviaria Italiana" 
          className="h-6 md:h-12 w-auto object-contain pointer-events-none"
        />
      </div>
      
      {/* Center: Title */}
      <div className="flex-1 flex justify-center overflow-hidden min-w-0 mx-1">
        <h1 
          className="font-bold text-center uppercase whitespace-nowrap" 
          style={{ 
            color: '#006341',
            fontSize: 'clamp(0.5rem, 2.5vw, 1.25rem)' 
          }}
        >
          WEB APP CORRISPONDENZA
        </h1>
      </div>
      
      {/* Right: Actions & Credits */}
      <div className="shrink-0 w-auto md:w-1/4 flex justify-end items-center gap-1 md:gap-2">
        {/* Home Button */}
        <button 
          type="button"
          onClick={() => onGoHome()} 
          className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-3 py-1.5 text-gray-600 hover:text-[#c60c30] hover:bg-red-50 rounded-lg transition-all active:scale-95 group cursor-pointer"
          title="Torna alla Home"
        >
           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="font-bold text-[10px] md:text-sm tracking-wide uppercase">HOME</span>
        </button>

        {/* Credits */}
        <div className="group relative flex items-center justify-center ml-0.5 md:ml-2">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 text-gray-400 hover:text-gray-600 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <div className="absolute right-0 top-8 w-max bg-gray-50 border border-gray-200 text-gray-400 text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col items-end leading-none gap-0.5">
                <div className="font-normal text-gray-400">Powered by</div>
                <div className="font-normal text-gray-400">Simone Giungato (964217)</div>
                <div className="font-normal text-gray-400">DOIT VE</div>
             </div>
        </div>
      </div>
    </header>
  );
};
