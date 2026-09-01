import React, { useEffect, useRef } from 'react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md'
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-normal"
        onClick={onClose}
      />

      {/* Dialog Box */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidthClass} bg-surface border border-border rounded-xl shadow-2xl overflow-hidden transition-all duration-normal`}
      >
        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-5 pb-3">
            {title && <h3 className="text-base font-semibold text-text-1">{title}</h3>}
            {description && <p className="mt-1 text-xs text-text-2">{description}</p>}
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border bg-surface-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
