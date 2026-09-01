import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createIpcRouter } from '../../src/main/ipc/router';

describe('Canal IPC Tipado con Zod', () => {
  const router = createIpcRouter();

  const pingContract = {
    channel: 'system:ping',
    inputSchema: z.object({
      message: z.string().min(1)
    }),
    outputSchema: z.object({
      reply: z.string(),
      timestamp: z.number()
    })
  };

  router.register(pingContract, (input) => {
    return {
      reply: `Pong: ${input.message}`,
      timestamp: 1234567890
    };
  });

  it('procesa y responde correctamente cuando la carga cumple el esquema', async () => {
    const response = await router.handle('system:ping', { message: 'Hola Cuadra' });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.reply).toBe('Pong: Hola Cuadra');
      expect(response.data.timestamp).toBe(1234567890);
    }
  });

  it('rechaza una carga que no cumple el esquema Zod de entrada', async () => {
    const response = await router.handle('system:ping', { message: '' }); // min(1) falla
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe('INVALID_INPUT');
      expect(response.message).toContain('Validation error');
    }
  });

  it('rechaza una carga con tipos incorrectos', async () => {
    const response = await router.handle('system:ping', { message: 12345 });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe('INVALID_INPUT');
    }
  });

  it('devuelve error si el canal no está registrado', async () => {
    const response = await router.handle('canal:desconocido', {});
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe('CHANNEL_NOT_FOUND');
    }
  });
});
