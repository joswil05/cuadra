import React, { useState } from 'react';
import { Input } from '../ui/Input';

export interface DataViewProps {
  title?: string;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  actions?: React.ReactNode;
  tableView: React.ReactNode;
  gridView: React.ReactNode;
  defaultView?: 'table' | 'grid';
  className?: string;
}

export function DataView({
  title,
  searchPlaceholder = 'Buscar...',
  onSearch,
  actions,
  tableView,
  gridView,
  defaultView = 'table',
  className = ''
}: DataViewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(defaultView);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    onSearch?.(e.target.value);
  };

  return (
    <div className={`flex flex-col gap-4 w-full ${className}`}>
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title && <h2 className="text-lg font-semibold text-text-1">{title}</h2>}

        <div className="flex items-center gap-2.5 ml-auto">
          <div className="w-64">
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={handleSearchChange}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>

          {/* View switcher */}
          <div className="flex items-center border border-border rounded-md bg-surface p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                viewMode === 'table' ? 'bg-surface-2 text-text-1 font-medium' : 'text-text-3 hover:text-text-2'
              }`}
              title="Vista en tabla"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                viewMode === 'grid' ? 'bg-surface-2 text-text-1 font-medium' : 'text-text-3 hover:text-text-2'
              }`}
              title="Vista en cuadrícula"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {actions}
        </div>
      </div>

      {/* Content */}
      <div className="w-full">{viewMode === 'table' ? tableView : gridView}</div>
    </div>
  );
}
