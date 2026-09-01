import React from 'react';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Kbd({ children, className = '', ...props }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-mono font-medium text-text-2 bg-surface-2 border border-border-strong rounded shadow-xs select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
}
