/// <reference types="vite/client" />

import type { VideoDeckApi } from '../shared/api.js';

declare global {
  interface Window {
    videoDeck: VideoDeckApi;
  }
}
