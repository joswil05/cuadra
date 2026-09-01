import { z } from 'zod';

export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export interface IpcContract<TIn, TOut> {
  channel: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
}

// Contrato de prueba para verificación de fontanería Fase 0
export const PingContract: IpcContract<{ message: string }, { reply: string; timestamp: number }> = {
  channel: 'system:ping',
  inputSchema: z.object({
    message: z.string().min(1)
  }),
  outputSchema: z.object({
    reply: z.string(),
    timestamp: z.number()
  })
};

// Contrato de prueba de lectura/escritura SQLite para la Fase 0
export const DbTestContract: IpcContract<{ key: string; value: string }, { key: string; value: string; updatedAt: string }> = {
  channel: 'db:test-entry',
  inputSchema: z.object({
    key: z.string().min(1),
    value: z.string()
  }),
  outputSchema: z.object({
    key: z.string(),
    value: z.string(),
    updatedAt: z.string()
  })
};
