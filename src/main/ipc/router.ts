import { z } from 'zod';
import { IpcContract, IpcResponse } from '../../shared/ipc';

type HandlerFunction = (input: unknown) => Promise<unknown> | unknown;

interface RegisteredRoute {
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  handler: HandlerFunction;
}

export interface IpcRouter {
  register<TIn, TOut>(
    contract: IpcContract<TIn, TOut>,
    handler: (input: TIn) => Promise<TOut> | TOut
  ): void;
  handle(channel: string, payload: unknown): Promise<IpcResponse<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function createIpcRouter(): IpcRouter {
  const routes = new Map<string, RegisteredRoute>();

  return {
    register<TIn, TOut>(
      contract: IpcContract<TIn, TOut>,
      handler: (input: TIn) => Promise<TOut> | TOut
    ) {
      routes.set(contract.channel, {
        inputSchema: contract.inputSchema,
        outputSchema: contract.outputSchema,
        handler: handler as HandlerFunction
      });
    },

    async handle(channel: string, payload: unknown): Promise<IpcResponse<any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
      const route = routes.get(channel);
      if (!route) {
        return {
          ok: false,
          code: 'CHANNEL_NOT_FOUND',
          message: `El canal '${channel}' no está registrado en el router IPC.`
        };
      }

      // Validar entrada con esquema Zod
      const parsedInput = route.inputSchema.safeParse(payload);
      if (!parsedInput.success) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: `Validation error en canal '${channel}': ${parsedInput.error.message}`,
          details: parsedInput.error.errors
        };
      }

      try {
        const rawResult = await route.handler(parsedInput.data);

        // Validar salida con esquema Zod
        const parsedOutput = route.outputSchema.safeParse(rawResult);
        if (!parsedOutput.success) {
          return {
            ok: false,
            code: 'INVALID_OUTPUT',
            message: `Validation error en salida de canal '${channel}': ${parsedOutput.error.message}`,
            details: parsedOutput.error.errors
          };
        }

        return {
          ok: true,
          data: parsedOutput.data
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          code: 'HANDLER_ERROR',
          message: `Error ejecutando handler de '${channel}': ${message}`
        };
      }
    }
  };
}
