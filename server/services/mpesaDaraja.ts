/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Mock Service for Safaricom M-Pesa Daraja 2.0 API Integration
 * Simulates C2B, STK Push (Lipa Na M-Pesa Online), and Transaction Status Query
 */

export interface DarajaSTKPushRequest {
  phoneNumber: string;
  amountKSh: number;
  accountReference: string; // e.g. "KODIPAY-A101"
  transactionDesc?: string;
}

export interface DarajaSTKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface DarajaVerificationResult {
  verified: boolean;
  transactionCode: string;
  status: 'COMPLETED' | 'PENDING_VERIFICATION' | 'FAILED';
  statusDescription: string;
  amountKSh: number;
  amountCents: number;
  payerName: string;
  payerPhone: string;
  businessShortCode: string;
  timestamp: string;
  resultCode: number;
}

// In-memory simulated M-Pesa transaction ledger for realistic Daraja lookups
const simulatedDarajaLedger = new Map<string, DarajaVerificationResult>();

// Format Kenyan phone to standard 2547XXXXXXXX
export const formatKenyanPhone = (phone: string): string => {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '254' + cleaned.slice(1);
  }
  if (cleaned.length === 9) {
    return '254' + cleaned;
  }
  return cleaned;
};

// Generate authentic-looking Safaricom 10-char receipt code (e.g. QKJ47L90XP)
export const generateMockMpesaReceipt = (): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alphanumeric = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = letters.charAt(Math.floor(Math.random() * letters.length));
  for (let i = 1; i < 10; i++) {
    code += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
  }
  return code;
};

/**
 * 1. Simulate M-Pesa Daraja STK Push (Lipa Na M-Pesa Online Prompt)
 */
export const initiateDarajaSTKPush = async (
  req: DarajaSTKPushRequest
): Promise<DarajaSTKPushResponse> => {
  const standardPhone = formatKenyanPhone(req.phoneNumber);
  const checkoutId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const merchantId = uuidv4().slice(0, 18);

  // Generate simulated transaction code
  const transCode = generateMockMpesaReceipt();
  const now = new Date().toISOString();

  // Store in simulated Daraja ledger
  simulatedDarajaLedger.set(transCode.toUpperCase(), {
    verified: true,
    transactionCode: transCode.toUpperCase(),
    status: 'COMPLETED',
    statusDescription: 'The service request is processed successfully.',
    amountKSh: req.amountKSh,
    amountCents: Math.round(req.amountKSh * 100),
    payerName: 'Safaricom M-Pesa Verified Tenant',
    payerPhone: `+${standardPhone}`,
    businessShortCode: '400200',
    timestamp: now,
    resultCode: 0
  });

  return {
    MerchantRequestID: merchantId,
    CheckoutRequestID: checkoutId,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: `Success. An STK PIN prompt has been initiated on ${standardPhone} for KSh ${req.amountKSh.toLocaleString()}. Expected Ref: ${transCode}`
  };
};

/**
 * 2. Simulate Daraja Transaction Status Query & Verification
 * Validates reference format, simulates live query to Safaricom network
 */
export const verifyDarajaTransaction = async (
  transactionCode: string,
  expectedAmountKSh?: number,
  expectedPhone?: string
): Promise<DarajaVerificationResult> => {
  const code = (transactionCode || '').trim().toUpperCase();

  // 1. Basic format validation for Kenyan M-Pesa code:
  // Must be 10 characters alphanumeric (e.g. QKJ47L90XP)
  const codePattern = /^[A-Z0-9]{10}$/;
  if (!codePattern.test(code)) {
    return {
      verified: false,
      transactionCode: code,
      status: 'FAILED',
      statusDescription: 'Invalid M-Pesa reference code format. Must be a 10-character alphanumeric code.',
      amountKSh: 0,
      amountCents: 0,
      payerName: 'Unknown',
      payerPhone: expectedPhone || '—',
      businessShortCode: '400200',
      timestamp: new Date().toISOString(),
      resultCode: 2001
    };
  }

  // 2. Check if already known in our simulated ledger
  if (simulatedDarajaLedger.has(code)) {
    return simulatedDarajaLedger.get(code)!;
  }

  // 3. For any valid 10-character M-Pesa code submitted by user in testing/demo:
  // Generate a verified Safaricom Daraja confirmation
  const now = new Date().toISOString();
  const verifiedRecord: DarajaVerificationResult = {
    verified: true,
    transactionCode: code,
    status: 'COMPLETED',
    statusDescription: 'The transaction is confirmed and verified on the Safaricom Daraja ledger.',
    amountKSh: expectedAmountKSh || 0,
    amountCents: expectedAmountKSh ? Math.round(expectedAmountKSh * 100) : 0,
    payerName: 'Safaricom Verified Subscriber',
    payerPhone: expectedPhone ? `+${formatKenyanPhone(expectedPhone)}` : '+2547XXXXXXXX',
    businessShortCode: '400200',
    timestamp: now,
    resultCode: 0
  };

  simulatedDarajaLedger.set(code, verifiedRecord);
  return verifiedRecord;
};
