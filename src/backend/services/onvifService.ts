import type { Camera } from '../../shared/types.js';

export interface OnvifService {
  discover(): Promise<Camera[]>;
  getStreamUri(camera: Camera): Promise<string | null>;
}

export class StubOnvifService implements OnvifService {
  async discover(): Promise<Camera[]> {
    // TODO: Implement ONVIF WS-Discovery for local cameras.
    return [];
  }

  async getStreamUri(): Promise<string | null> {
    // TODO: Implement ONVIF GetStreamUri for cameras such as Nivian NVS-IPC-IS4.
    return null;
  }
}
