import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface SupplierFormData {
  name: string;
  docNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditDays: number;
}

export interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SupplierFormData) => void;
}

export function SupplierModal({ isOpen, onClose, onSave }: SupplierModalProps) {
  const [name, setName] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditDays, setCreditDays] = useState('30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      docNumber: docNumber.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      creditDays: parseInt(creditDays, 10) || 0
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Proveedor"
      description="Registre la información comercial y condiciones de crédito del proveedor."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Nombre o Razón Social"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ej. Distribuidora La Famosa, S.A."
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="RUC / Cédula"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="ej. J0310000999999"
          />
          <Input
            label="Días de Crédito"
            type="number"
            value={creditDays}
            onChange={(e) => setCreditDays(e.target.value)}
            placeholder="30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Teléfono de Contacto"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+505 2222-0000"
          />
          <Input
            label="Correo Electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ventas@proveedor.com.ni"
          />
        </div>

        <Input
          label="Dirección Comercial"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Dirección del centro de distribución o bodega"
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Guardar Proveedor
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
