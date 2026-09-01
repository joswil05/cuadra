import React, { useState } from 'react';
import { IpcResponse, DbTestContract } from '../../shared/ipc';

interface DbEntryResult {
  key: string;
  value: string;
  updatedAt: string;
}

export default function App(): React.JSX.Element {
  const [keyInput, setKeyInput] = useState<string>('app.status');
  const [valueInput, setValueInput] = useState<string>('Fase 0 Andamiaje Verificada');
  const [savedRow, setSavedRow] = useState<DbEntryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleTestDatabase = async (): Promise<void> => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const response: IpcResponse<DbEntryResult> = await window.api.invoke(
        DbTestContract.channel,
        {
          key: keyInput,
          value: valueInput
        }
      );

      if (response.ok) {
        setSavedRow(response.data);
      } else {
        setErrorMsg(`[${response.code}] ${response.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Error de comunicación IPC: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--text-1)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <section
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '32px',
          maxWidth: '560px',
          width: '100%'
        }}
      >
        <header style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              margin: '0 0 8px 0',
              color: 'var(--text-1)'
            }}
          >
            Cuadra — Fase 0 (Andamiaje)
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-2)',
              margin: 0
            }}
          >
            Verificación de fontanería: IPC seguro con esquemas Zod + SQLite nativo.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="db-key"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-2)',
                marginBottom: '6px'
              }}
            >
              Clave de configuración (settings.key)
            </label>
            <input
              id="db-key"
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                color: 'var(--text-1)',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label
              htmlFor="db-val"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-2)',
                marginBottom: '6px'
              }}
            >
              Valor (settings.value_json)
            </label>
            <input
              id="db-val"
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                color: 'var(--text-1)',
                outline: 'none'
              }}
            />
          </div>

          <button
            id="btn-test-db"
            onClick={handleTestDatabase}
            disabled={loading}
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--surface)',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: '8px',
              transition: 'background-color 120ms cubic-bezier(0.2, 0, 0, 1)'
            }}
          >
            {loading ? 'Escribiendo en SQLite...' : 'Guardar y Leer en SQLite vía IPC'}
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: 'var(--surface-2)',
              borderLeft: '3px solid var(--danger)',
              borderRadius: '4px',
              fontSize: '13px',
              color: 'var(--danger)'
            }}
          >
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        {savedRow && (
          <div
            id="result-box"
            style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--success)',
                marginBottom: '8px'
              }}
            >
              ✓ Fila escrita y leída exitosamente de SQLite
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ color: 'var(--text-2)', padding: '4px 0', width: '90px' }}>Clave:</td>
                  <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>{savedRow.key}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-2)', padding: '4px 0' }}>Valor:</td>
                  <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>{savedRow.value}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-2)', padding: '4px 0' }}>Actualizado:</td>
                  <td style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {savedRow.updatedAt}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
