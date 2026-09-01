import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export interface AuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorize: (pin: string) => Promise<boolean> | boolean;
  title?: string;
  reason?: string;
}

export function AuthPrompt({
  isOpen,
  onClose,
  onAuthorize,
  title = 'Autorización de Supervisor Requerida',
  reason = 'Esta acción requiere confirmación de credenciales.'
}: AuthPromptProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Ingrese el PIN o contraseña de supervisor');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const ok = await onAuthorize(pin);
      if (ok) {
        onClose();
      } else {
        setError('PIN o contraseña incorrecta');
      }
    } catch {
      setError('Error al validar autorización');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={reason}
      maxWidth="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
            Autorizar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          type="password"
          label="PIN de Supervisor"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          error={error}
          autoComplete="off"
        />
      </form>
    </Dialog>
  );
}
