import crypto from 'crypto';
import {
  PaymentProvider,
  PaymentProviderName,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
  WebhookEventResult
} from './types';

export class PaystackProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'paystack';
  readonly displayName = 'Paystack';
  private readonly baseUrl = 'https://api.paystack.co';

  private getSecretKey(): string {
    return (process.env.PAYSTACK_SECRET_KEY || '').trim();
  }

  getPublicKey(): string | null {
    const key = (process.env.PAYSTACK_PUBLIC_KEY || '').trim();
    return key || null;
  }

  isConfigured(): boolean {
    const key = this.getSecretKey();
    return Boolean(key && (key.startsWith('sk_') || key.length >= 10));
  }

  getMissingEnvVars(): string[] {
    const missing: string[] = [];
    if (!this.getSecretKey()) {
      missing.push('PAYSTACK_SECRET_KEY');
    }
    return missing;
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const secretKey = this.getSecretKey();
    if (!this.isConfigured()) {
      throw new Error('Paystack is not configured. Missing PAYSTACK_SECRET_KEY environment variable.');
    }

    // Paystack requires amount in KOBO (1 NGN = 100 Kobo)
    const amountInKobo = Math.round(params.amount * 100);

    const payload = {
      reference: params.reference,
      amount: amountInKobo,
      currency: 'NGN',
      email: params.email,
      callback_url: params.callbackUrl,
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      metadata: {
        custom_fields: [
          {
            display_name: 'Customer Name',
            variable_name: 'customer_name',
            value: params.name || 'SwiftPay Customer'
          },
          {
            display_name: 'Payment Purpose',
            variable_name: 'purpose',
            value: params.purpose === 'wdv_voucher' ? 'WDV Voucher Purchase' : 'SwiftPay Wallet Funding'
          }
        ],
        purpose: params.purpose || 'wdv_voucher',
        userId: params.email,
        phone: params.phone || '',
        ...(params.metadata || {})
      }
    };

    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.status) {
      const errMsg = data.message || `Paystack payment initiation failed with HTTP ${res.status}`;
      throw new Error(`Paystack error: ${errMsg}`);
    }

    const txData = data.data || {};

    return {
      success: true,
      authorizationUrl: txData.authorization_url,
      accessCode: txData.access_code,
      reference: txData.reference || params.reference,
      provider: this.name,
      message: data.message || 'Payment initialized successfully',
      rawResponse: data
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const secretKey = this.getSecretKey();
    if (!this.isConfigured()) {
      throw new Error('Paystack is not configured. Missing PAYSTACK_SECRET_KEY environment variable.');
    }

    const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.status) {
      return {
        success: false,
        status: 'failed',
        amount: 0,
        currency: 'NGN',
        reference,
        provider: this.name,
        message: data.message || 'Paystack transaction verification failed',
        rawResponse: data
      };
    }

    const txData = data.data || {};
    const isSuccess = txData.status === 'success';

    // Convert kobo back to NGN
    const amountInNgn = Number(txData.amount || 0) / 100;

    let normalizedStatus: 'successful' | 'failed' | 'pending' | 'abandoned' = 'pending';
    if (isSuccess) {
      normalizedStatus = 'successful';
    } else if (txData.status === 'failed') {
      normalizedStatus = 'failed';
    } else if (txData.status === 'abandoned') {
      normalizedStatus = 'abandoned';
    }

    return {
      success: isSuccess,
      status: normalizedStatus,
      amount: amountInNgn,
      currency: txData.currency || 'NGN',
      reference: txData.reference || reference,
      providerReference: String(txData.id || ''),
      customerEmail: txData.customer?.email || '',
      customerName: [txData.customer?.first_name, txData.customer?.last_name].filter(Boolean).join(' ') || '',
      paidAt: txData.paid_at || new Date().toISOString(),
      channel: txData.channel || 'card',
      provider: this.name,
      message: data.message || (isSuccess ? 'Verification successful' : 'Verification pending'),
      rawResponse: txData
    };
  }

  verifyWebhookSignature(headers: Record<string, any>, rawBody: string): boolean {
    const secret = this.getSecretKey();
    // Paystack signature is passed in header 'x-paystack-signature'
    const signature = String(headers['x-paystack-signature'] || '').trim();
    if (!secret || !signature || !rawBody) return false;

    try {
      // Paystack calculates HMAC SHA-512 over the raw request body
      const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(signature, 'utf8');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async parseWebhook(headers: Record<string, any>, rawBody: string, jsonBody: any): Promise<WebhookEventResult> {
    const isValid = this.verifyWebhookSignature(headers, rawBody);
    if (!isValid) {
      return {
        isValid: false,
        provider: this.name,
        message: 'Invalid Paystack webhook signature'
      };
    }

    const event = jsonBody?.event;
    const data = jsonBody?.data || {};
    const isSuccess = event === 'charge.success' || data.status === 'success';

    // Amount in Paystack payload is in kobo, convert to NGN
    const amountInNgn = Number(data.amount || 0) / 100;

    return {
      isValid: true,
      event,
      status: isSuccess ? 'successful' : 'pending',
      reference: data.reference,
      providerReference: String(data.id || ''),
      amount: amountInNgn,
      customerEmail: data.customer?.email,
      provider: this.name,
      rawData: jsonBody
    };
  }
}
