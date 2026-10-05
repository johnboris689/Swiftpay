import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Zap,
  Lock,
  Copy,
  Check
} from 'lucide-react';

export interface PaymentConfigProvider {
  name: 'korapay';
  displayName: string;
  isConfigured: boolean;
  missingEnvVars: string[];
  publicKey?: string;
}

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAmount?: number;
  purpose?: 'wallet_funding' | 'wdv_voucher';
  userEmail?: string;
  userName?: string;
  token?: string;
  onSuccess?: (result: any) => void;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function sanitizeClientPaymentError(rawMessage: any, fallback: string): string {
  const msg = String(rawMessage || '').trim();
  if (!msg) return fallback;
  const technicalPatterns = [
    /getaddrinfo/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /[a-z]{3}-[a-z0-9]{16,}-[a-z]/i,
    /postgres/i,
    /DATABASE_URL/i,
    /PGHOST/i,
    /KORAPAY_/i,
    /SECRET_KEY/i,
    /stack/i,
    /SyntaxError/i,
    /TypeError/i,
    /Failed to fetch/i,
    /NetworkError/i
  ];
  if (technicalPatterns.some((pattern) => pattern.test(msg))) {
    return fallback;
  }
  return msg;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  defaultAmount = 6500,
  purpose = 'wdv_voucher',
  userEmail = '',
  userName = '',
  token = '',
  onSuccess,
  onToast
}) => {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [customAmountStr, setCustomAmountStr] = useState<string>(String(defaultAmount));
  const [isKorapayReady, setIsKorapayReady] = useState<boolean>(true);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Flow states: 'select' | 'processing' | 'awaiting_payment' | 'verifying' | 'success'
  const [flowState, setFlowState] = useState<'select' | 'processing' | 'awaiting_payment' | 'verifying' | 'success'>('select');
  const [activeReference, setActiveReference] = useState<string>('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successData, setSuccessData] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const isSubmittingRef = useRef(false);

  const getAuthToken = (): string => {
    if (token) return token;
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('swiftpay_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('swiftpay_admin_token') ||
        ''
      );
    }
    return '';
  };

  const getResolvedUser = () => {
    let resolvedEmail = userEmail;
    let resolvedName = userName;
    if ((!resolvedEmail || !resolvedName) && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('swiftpay_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!resolvedEmail && parsed.email) resolvedEmail = parsed.email;
          if (!resolvedName && parsed.fullName) resolvedName = parsed.fullName;
        }
      } catch (_e) {
        // ignore parse errors
      }
    }
    return {
      email: resolvedEmail || '',
      name: resolvedName || 'SwiftPay Customer'
    };
  };

  const fetchConfig = async () => {
    try {
      setLoadingConfig(true);
      const authToken = getAuthToken();
      const res = await fetch('/api/payment/config', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.providers)) {
        const korapay = data.providers.find((p: any) => p.name === 'korapay');
        setIsKorapayReady(korapay ? Boolean(korapay.isConfigured) : true);
      }
    } catch (_err) {
      // Keep UI ready; server validates on initialize
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setAmount(defaultAmount);
      setCustomAmountStr(String(defaultAmount));
      setFlowState('select');
      setErrorMessage('');
      setSuccessData(null);
      isSubmittingRef.current = false;
    }
  }, [isOpen, defaultAmount]);

  if (!isOpen) return null;

  const presetAmounts = [1000, 2000, 5000, 10000, 20000, 50000];
  const formattedPrice = Number(amount || 6500).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const handleInitiatePayment = async () => {
    if (isSubmittingRef.current || flowState === 'processing') return;
    if (!amount || isNaN(amount) || amount < 100) {
      setErrorMessage('Please enter a valid amount (minimum ₦100).');
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage('');
    setFlowState('processing');

    try {
      const authToken = getAuthToken();
      const { email, name } = getResolvedUser();
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${purpose === 'wdv_voucher' ? '/dashboard/buy-wdv' : '/payment/callback'}`
          : undefined;

      const res = await fetch('/api/payment/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          amount,
          provider: 'korapay',
          purpose,
          name,
          email,
          token: authToken,
          callbackUrl
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.authorizationUrl) {
        throw new Error(
          sanitizeClientPaymentError(data.error, "We couldn't start the payment. Please try again.")
        );
      }

      setActiveReference(data.reference);
      setAuthorizationUrl(data.authorizationUrl);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            'swiftpay_pending_payment',
            JSON.stringify({
              reference: data.reference,
              purpose,
              amount,
              authorizationUrl: data.authorizationUrl,
              createdAt: Date.now()
            })
          );
        } catch (_e) {
          // ignore storage quota errors
        }
      }

      setFlowState('awaiting_payment');

      if (typeof window !== 'undefined') {
        if (window.self === window.top) {
          window.location.href = data.authorizationUrl;
        } else {
          const popup = window.open(data.authorizationUrl, '_blank', 'noopener,noreferrer');
          if (!popup && onToast) {
            onToast('Tap "Continue to Korapay Checkout" below to complete your payment.', 'info');
          }
        }
      }
    } catch (err: any) {
      const cleanMsg = sanitizeClientPaymentError(
        err?.message,
        "We couldn't start the payment. Please try again."
      );
      setErrorMessage(cleanMsg);
      setFlowState('select');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleVerifyPayment = async () => {
    if (!activeReference || flowState === 'verifying') return;
    setFlowState('verifying');
    setErrorMessage('');

    try {
      const authToken = getAuthToken();
      const { email } = getResolvedUser();
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          reference: activeReference,
          email,
          token: authToken
        })
      });

      const data = await res.json().catch(() => ({}));

      if (data.success && data.status === 'successful') {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('swiftpay_pending_payment');
        }
        setSuccessData(data);
        setFlowState('success');
        if (onToast) {
          onToast(
            purpose === 'wdv_voucher'
              ? `Payment confirmed! WDV Voucher issued: ${data.voucherCode || 'Active'}`
              : `₦${Number(data.amount || amount).toLocaleString()} credited to your wallet!`,
            'success'
          );
        }
        if (onSuccess) onSuccess(data);
      } else {
        setErrorMessage(
          sanitizeClientPaymentError(
            data.message || data.error,
            'Your payment has not been confirmed yet. Please complete checkout on Korapay and try again.'
          )
        );
        setFlowState('awaiting_payment');
      }
    } catch (err: any) {
      setErrorMessage(
        sanitizeClientPaymentError(
          err?.message,
          "We couldn't verify the payment right now. Please try again."
        )
      );
      setFlowState('awaiting_payment');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-[#05070f]/90 backdrop-blur-md animate-[fadeIn_0.15s_ease-out] overflow-x-hidden">
      <div className="w-full max-w-full sm:max-w-lg min-h-[100dvh] sm:min-h-0 sm:max-h-[92dvh] bg-gradient-to-b from-[#0a0f1f] via-[#080c19] to-[#05070f] sm:border border-teal-500/20 sm:rounded-3xl shadow-[0_0_50px_rgba(20,184,166,0.12)] overflow-hidden flex flex-col justify-between pt-safe pb-safe">
        {/* Top Header */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-white/10 flex items-start justify-between bg-[#0a0f1f]/90 backdrop-blur-xl shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-500/15 text-teal-400 border border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.15)] shrink-0 mt-0.5">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-wide text-white font-display uppercase">
                {purpose === 'wdv_voucher' ? 'BUY WDV VOUCHER' : 'FUND WALLET'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {purpose === 'wdv_voucher'
                  ? 'Secure payment • Voucher issued after server verification'
                  : 'Secure payment • Instant wallet credit after verification'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer shrink-0"
            aria-label="Close payment window"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Checkout Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 flex flex-col justify-between">
          {(flowState === 'select' || flowState === 'processing') && (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              <div className="space-y-5">
                {purpose === 'wdv_voucher' ? (
                  /* WDV Voucher Card */
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e172c] via-[#0b1222] to-[#080d1a] border border-teal-500/25 p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                    <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-teal-400/10 blur-2xl pointer-events-none" />
                    <div className="relative z-10 space-y-2.5">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-[11px] font-mono font-bold uppercase tracking-wider">
                        <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                        <span>WDV VOUCHER</span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight pt-1">
                        ₦{formattedPrice}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                        One-time purchase. The voucher is generated only after the gateway confirms your payment.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Wallet Funding Input */
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1.5 font-bold uppercase tracking-wider">
                        Amount to Pay (NGN)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-teal-400 font-mono">
                          ₦
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={customAmountStr}
                          disabled={flowState === 'processing'}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setCustomAmountStr(val);
                            setAmount(Number(val) || 0);
                          }}
                          className="w-full pl-10 pr-4 py-3.5 bg-[#090d1a] border border-slate-800 rounded-2xl text-white font-mono text-xl font-bold focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/50"
                          placeholder="5,000"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {presetAmounts.map((pAmt) => (
                        <button
                          key={pAmt}
                          type="button"
                          disabled={flowState === 'processing'}
                          onClick={() => {
                            setAmount(pAmt);
                            setCustomAmountStr(String(pAmt));
                          }}
                          className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
                            amount === pAmt
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                              : 'bg-[#090d1a] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          ₦{pAmt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* PAYMENT GATEWAY SECTION — KORAPAY ONLY */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-widest">
                      PAYMENT GATEWAY
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-500/12 via-[#0d1629] to-[#0a1020] border border-teal-500/40 shadow-[0_0_25px_rgba(20,184,166,0.1)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="p-3 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm sm:text-base font-bold text-white font-display">
                          Korapay
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Online card/bank checkout
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        READY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1 animate-[fadeIn_0.15s_ease-out]">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wide">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Payment Not Completed</span>
                    </div>
                    <p className="text-xs text-rose-200/90 leading-relaxed pl-6">
                      {errorMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleInitiatePayment}
                  disabled={flowState === 'processing' || !amount || amount < 100 || loadingConfig}
                  className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-teal-400 via-cyan-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 text-xs sm:text-sm font-black uppercase tracking-wider transition-all active:scale-[0.99] shadow-[0_8px_25px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  {flowState === 'processing' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                      <span>Initializing secure payment...</span>
                    </>
                  ) : purpose === 'wdv_voucher' ? (
                    <>
                      <span>BUY WDV VOUCHER — ₦{Number(amount || 6500).toLocaleString()}</span>
                      <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                    </>
                  ) : (
                    <>
                      <span>PROCEED TO PAY — ₦{Number(amount || 0).toLocaleString()}</span>
                      <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400/80 font-mono">
                  <Lock className="h-3.5 w-3.5 text-teal-400" />
                  <span>Encrypted Korapay checkout • Server-side verification</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Awaiting / Verifying Korapay Payment */}
          {(flowState === 'awaiting_payment' || flowState === 'verifying') && (
            <div className="space-y-5 flex-1 flex flex-col justify-between py-1">
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-teal-500/10 border border-teal-500/25 text-center space-y-2">
                  <span className="text-[10px] font-mono text-teal-400 font-bold uppercase tracking-widest block">
                    KORAPAY TRANSACTION REFERENCE
                  </span>
                  <span className="text-sm sm:text-base font-mono font-black text-white block select-all break-all">
                    {activeReference}
                  </span>
                  <span className="text-xs text-slate-300 block">
                    Amount: <strong className="text-teal-300 font-mono">₦{formattedPrice}</strong>
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-[#0b1120] border border-white/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-white font-bold">
                    <ExternalLink className="h-4 w-4 text-teal-400 shrink-0" />
                    <span>Complete Your Payment on Korapay</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Complete your card or bank transfer payment in the secure Korapay checkout window. Once completed, tap the verification button below to confirm your transaction and issue your voucher.
                  </p>

                  {authorizationUrl && (
                    <a
                      href={authorizationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <span>Open Korapay Checkout</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {errorMessage && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wide">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Payment Not Completed</span>
                    </div>
                    <p className="text-xs text-rose-200/90 leading-relaxed pl-6">
                      {errorMessage}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleVerifyPayment}
                  disabled={flowState === 'verifying'}
                  className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-teal-400 via-cyan-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 disabled:opacity-60 text-slate-950 text-xs sm:text-sm font-black uppercase tracking-wider transition-all active:scale-[0.99] shadow-[0_8px_25px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  {flowState === 'verifying' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Verifying with Korapay...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>I Have Completed Payment — Verify Now</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={flowState === 'verifying'}
                  onClick={() => {
                    setErrorMessage('');
                    setFlowState('select');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Back to Payment Details
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Verified & Voucher Issued */}
          {flowState === 'success' && (
            <div className="py-4 space-y-5 text-center flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div>
                  <h4 className="text-lg sm:text-xl font-black text-white font-display">
                    Payment Confirmed!
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    {purpose === 'wdv_voucher'
                      ? 'Your WDV Voucher has been verified and issued.'
                      : `₦${Number(successData?.amount || amount).toLocaleString()} has been credited to your wallet.`}
                  </p>
                </div>

                {successData?.voucherCode && (
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/15 via-[#0d172a] to-[#080d1a] border border-teal-500/40 space-y-2.5">
                    <span className="text-[10px] font-mono text-teal-300 uppercase tracking-widest block font-bold">
                      ISSUED WDV VOUCHER CODE
                    </span>
                    <div className="text-2xl font-mono font-black text-white tracking-wider select-all">
                      {successData.voucherCode}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(successData.voucherCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                        if (onToast) onToast('WDV Voucher code copied!', 'success');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-mono font-bold transition-all cursor-pointer"
                    >
                      {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Voucher Code'}</span>
                    </button>
                  </div>
                )}

                <div className="p-4 rounded-2xl bg-[#090d1a] border border-white/10 text-left space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Amount Paid:</span>
                    <span className="font-bold text-white">₦{Number(successData?.amount || amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Reference:</span>
                    <span className="font-bold text-teal-400 truncate max-w-[200px]">{activeReference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Payment Gateway:</span>
                    <span className="font-bold text-white uppercase">KORAPAY</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
