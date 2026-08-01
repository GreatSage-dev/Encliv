import { keyManager } from '../crypto/keyManager.js';

export function handleGenerate(): { instruction: string; address: string } {
  // Ensure the key manager is initialized
  keyManager.initialize();
  
  return {
    instruction: 'GENERATE',
    address: keyManager.getAddress()
  };
}
