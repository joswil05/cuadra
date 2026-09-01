import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CreateCustomerParams } from '../../../../core/customers';

export interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: CreateCustomerParams) => void;
}

export function CustomerModal({ isOpen, onClose, onSave }: CustomerModalProps) {
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('RUC');
  const [docNumber, setDocNumber] = useState('');
  const [taxRegime, setTaxRegime] = useState('general');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimitStr, setCreditLimitStr] = useState('0.00');
  const [creditDays, setCreditDays] = useState('30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const creditLimitCents = creditLimitStr
      ? BigInt(Math.round(parseFloat(creditLimitStr) * 100))
      : 0n;

    onSave({
      name: name.trim(),
      docType: docType || undefined,
      docNumber: docNumber.trim() || undefined,
      taxRegime: taxRegime || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      creditLimitCents,
      creditDays: parseInt(creditDays, 10) || 0
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Cliente"
      description="Registre los datos comerciales, fiscales y condiciones de crédito del cliente."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Nombre o Razón Social"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ej. Distribuidora Central / Juan Pérez"
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de Identificación"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={[
              { value: 'RUC', label: 'RUC (Persona Jurídica / Negocio)' },
              { value: 'cedula', label: 'Cédula de Identidad (Nicaragüense)' },
              { value: 'pasaporte', label: 'Pasaporte (Extranjero)' }
            ]}
          />
          <Input
            label="No. de Documento"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="ej. J0310000123456"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Régimen Fiscal DGI"
            value={taxRegime}
            onChange={(e) => setTaxRegime(e.target.value)}
            options={[
              { value: 'general', label: 'Régimen General (Aplica IVA 15%)' },
              { value: 'cuota_fija', label: 'Cuota Fija (Sin IVA)' },
              { value: 'exento', label: 'Exento por Ley' }
            ]}
          />
          <Input
            label="Teléfono / Celular"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+505 8888-0000"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Límite de Crédito (C$)"
            type="number"
            step="0.01"
            value={creditLimitStr}
            onChange={(e) => setCreditLimitStr(e.target.value)}
            placeholder="0.00"
          />
          <Input
            label="Plazo de Crédito (Días)"
            type="number"
            value={creditDays}
            onChange={(e) => setCreditDays(e.target.value)}
            placeholder="30"
          />
        </div>

        <Input
          label="Correo Electrónico"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@empresa.com.ni"
        />

        <Input
          label="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Dirección del domicilio o negocio"
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Guardar Cliente
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
