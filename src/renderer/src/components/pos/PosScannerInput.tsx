import React, { useRef, useState, useEffect } from 'react';
import { useMagneticFocus } from '../../hooks/useMagneticFocus';
import { Kbd } from '../ui/Kbd';

export interface PosScannerInputProps {
  onScan: (code: string) => void;
  isModalOpen?: boolean;
}

export function PosScannerInput({ onScan, isModalOpen = false }: PosScannerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  // Re-enfocar automáticamente cuando no hay modales abiertos
  useMagneticFocus(inputRef, { enabled: !isModalOpen });

  useEffect(() => {
    if (!isModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isModalOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onScan(value.trim());
      setValue('');
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center w-full bg-surface border-2 border-border-strong rounded-lg shadow-xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft transition-all">
        <div className="pl-3 pr-2 text-text-3 flex items-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escanear código de barras o escribir (ej. 3*BEB-COC-600) [Enter]"
          className="w-full bg-transparent py-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none"
          autoComplete="off"
        />

        <div className="pr-3 flex items-center gap-1.5 text-text-3">
          <Kbd>Enter</Kbd>
        </div>
      </div>
    </div>
  );
}
