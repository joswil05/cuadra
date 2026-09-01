import React, { useState, useEffect, useRef } from 'react';
import { Kbd } from '../ui/Kbd';

export interface CommandItem {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  onSelect: () => void;
  icon?: React.ReactNode;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category?.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Box */}
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-border gap-2.5">
          <svg className="w-5 h-5 text-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando, cliente o producto..."
            className="w-full bg-transparent text-sm text-text-1 placeholder:text-text-3 focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Command List */}
        <div className="max-h-72 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-xs text-text-3">No se encontraron resultados</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <div
                key={cmd.id}
                onClick={() => {
                  cmd.onSelect();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors duration-fast ${
                  idx === selectedIndex ? 'bg-accent text-white' : 'text-text-1 hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {cmd.icon && <span className={idx === selectedIndex ? 'text-white' : 'text-text-3'}>{cmd.icon}</span>}
                  <div>
                    <span className="font-medium">{cmd.title}</span>
                    {cmd.category && (
                      <span className={`ml-2 text-[10px] ${idx === selectedIndex ? 'text-white/80' : 'text-text-3'}`}>
                        ({cmd.category})
                      </span>
                    )}
                  </div>
                </div>

                {cmd.shortcut && (
                  <Kbd className={idx === selectedIndex ? 'bg-white/20 text-white border-transparent' : ''}>
                    {cmd.shortcut}
                  </Kbd>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
