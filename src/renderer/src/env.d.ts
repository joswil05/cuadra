/// <reference types="vite/client" />

import { CuadraApi } from '../../preload';

declare global {
  interface Window {
    api: CuadraApi;
  }
}
