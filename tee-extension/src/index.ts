import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
import express, { Request, Response } from 'express';
import { keyManager } from './crypto/keyManager.js';
import { handleGenerate } from './handlers/generate.js';
import { handleCheckAndSign, getAgentNonce } from './handlers/checkAndSign.js';
import { CheckAndSignRequest } from './utils/types.js';

const app = express();
app.use(express.json());

// Allow browser console at localhost:3000 to call the TEE
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Initialize key manager on startup
keyManager.initialize();
console.log(`[KeyManager] Initialized. Enclave Address: ${keyManager.getAddress()}`);
console.log(`[KeyManager] WARNING: Key is stored in memory only. It will be lost on restart.`);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', address: keyManager.getAddress() });
});

app.post('/action', async (req: Request, res: Response) => {
  try {
    // In a real TEE, the payload would be encrypted and we'd call /decrypt here.
    // For TEE_MODE=1 (simulated), we accept plaintext.
    const isSimulated = process.env.TEE_MODE === '1';
    
    let payload = req.body;
    
    // If not simulated, this is where decryption would happen
    if (!isSimulated) {
      // Stub for decryption
      console.log('Would decrypt payload here in production mode');
    }

    const { instruction } = payload;

    if (instruction === 'GENERATE') {
      const result = handleGenerate();
      return res.json(result);
    } 

    if (instruction === 'GET_NONCE') {
      const nonce = getAgentNonce(payload.agentId || '');
      return res.json({ success: true, nonce });
    }
    
    if (instruction === 'CHECK_AND_SIGN') {
      const result = await handleCheckAndSign(payload as CheckAndSignRequest);
      return res.json(result);
    }

    return res.status(400).json({ success: false, reason: 'UNKNOWN_INSTRUCTION' });
  } catch (error: any) {
    console.error('Error processing action:', error);
    return res.status(500).json({ success: false, reason: 'INTERNAL_SERVER_ERROR', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TEE Extension listening on port ${PORT}`);
});
