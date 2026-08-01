import { Wallet, TransactionRequest } from 'ethers';
import * as crypto from 'crypto';
import { getProvider } from '../utils/rpc.js';

/**
 * KeyManager handles the secp256k1 private key for the enclave.
 * 
 * WARNING:
 * - This stores the key IN MEMORY ONLY.
 * - If the enclave process restarts, a new key is generated and the address changes.
 * - This means any funds sent to the old address are permanently lost.
 */
class KeyManager {
  private wallet: Wallet | null = null;
  private static instance: KeyManager;

  private constructor() {}

  public static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Initializes the wallet. First call generates the key. Subsequent calls are no-ops.
   */
  public initialize(): void {
    if (this.wallet) {
      return; // Already initialized
    }
    // Generate a random 32-byte private key
    const privateKeyBuffer = crypto.randomBytes(32);
    const privateKeyHex = '0x' + privateKeyBuffer.toString('hex');
    
    // Create an ethers Wallet from the key
    // We intentionally don't connect a provider here, as signing happens locally
    this.wallet = new Wallet(privateKeyHex);
  }

  /**
   * Returns whether the manager has been initialized.
   */
  public isInitialized(): boolean {
    return this.wallet !== null;
  }

  /**
   * Returns the derived Ethereum address.
   */
  public getAddress(): string {
    if (!this.wallet) {
      throw new Error('KeyManager not initialized');
    }
    return this.wallet.address;
  }

  /**
   * Signs a transaction request and returns the serialized signed transaction.
   */
  public async signTransaction(tx: TransactionRequest): Promise<string> {
    if (!this.wallet) {
      throw new Error('KeyManager not initialized');
    }
    const connectedWallet = this.wallet.connect(getProvider());
    return connectedWallet.signTransaction(tx);
  }
}

export const keyManager = KeyManager.getInstance();
