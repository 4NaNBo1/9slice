import { FigmaAdapter } from './figma';
import { MasterGoAdapter } from './mastergo';
import type { PlatformAdapter } from './types';

declare const mg: any;

export function createPlatformAdapter(): PlatformAdapter {
  if (typeof mg !== 'undefined') {
    return new MasterGoAdapter();
  }

  return new FigmaAdapter();
}
