import { Wallet } from 'ethers';

// Demo-only enclave key for Coston2 testnet (in production, key is generated inside TEE and never exposed)
const ENCLAVE_PK = process.env.TEE_PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
const wallet = new Wallet(ENCLAVE_PK);

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    status: 'OK',
    address: wallet.address
  });
}
