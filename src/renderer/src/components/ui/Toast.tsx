import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const duration = toast.duration ?? 4000;

      setToasts((prev) => [...prev, { ...toast, id }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string) => showToast({ type: 'success', message, title }), [showToast]);
  const error = useCallback((message: string, title?: string) => showToast({ type: 'error', message, title }), [showToast]);
  const warning = useCallback((message: string, title?: string) => showToast({ type: 'warning', message, title }), [showToast]);
  const info = useCallback((message: string, title?: string) => showToast({ type: 'info', message, title }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
}

export function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const typeStyles = {
    success: 'border-l-4 border-l-success',
    error: 'border-l-4 border-l-danger',
    warning: 'border-l-4 border-l-warning',
    info: 'border-l-4 border-l-info'
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 bg-surface text-text-1 border border-border rounded-lg shadow-lg transition-all duration-normal ${typeStyles}`}
    >
      <div className="flex-1">
        {toast.title && <div className="text-xs font-semibold text-text-1">{toast.title}</div>}
        <div className="text-xs text-text-2">{toast.message}</div>
      </div>
      <button
        onClick={onClose}
        className="text-text-3 hover:text-text-1 p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export const Toast = {
  Provider: ToastProvider,
  useToast,
  Item: ToastItem
};
