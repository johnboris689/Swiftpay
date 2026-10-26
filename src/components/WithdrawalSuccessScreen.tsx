import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Download, ArrowRight, Loader2 } from 'lucide-react';
import { Transaction } from '../types';
import { formatNaira } from '../utils/formatters';

interface WithdrawalSuccessScreenProps {
  transaction: Transaction;
  bankName: string;
  accountName: string;
  accountNumber: string;
  onViewReceipt: () => void;
  onDone: () => void;
}

// Mask account number: shows first 2 and last 3 digits (e.g. 12*****890)
function maskAccountNumber(accountNumber: string | undefined): string {
  const clean = String(accountNumber || '').trim();
  if (!clean) return '••••';
  if (clean.length <= 5) return clean;
  const first2 = clean.slice(0, 2);
  const last3 = clean.slice(-3);
  const maskedLength = Math.max(1, clean.length - 5);
  return `${first2}${'*'.repeat(maskedLength)}${last3}`;
}

export default function WithdrawalSuccessScreen({
  transaction,
  bankName,
  accountName,
  accountNumber,
  onViewReceipt,
  onDone
}: WithdrawalSuccessScreenProps) {
  const [copied, setCopied] = useState(false);
  const [processState, setProcessState] = useState<'processing' | 'processed'>('processing');

  // Realistic dynamic loading progression: "processing..." -> "processed"
  useEffect(() => {
    const timer = setTimeout(() => {
      setProcessState('processed');
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  const reference = transaction.reference || transaction.refNum || transaction.id;
  const charges = transaction.charges ?? 0;
  const when = new Date(transaction.date);
  const dateLabel = isNaN(when.getTime())
    ? new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
    : when.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const maskedAccount = maskAccountNumber(accountNumber);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const isProcessed = processState === 'processed';

  return (
    <div id="withdraw-success-screen" className="w-full max-w-md mx-auto px-4 py-8 flex flex-col animate-[fadeIn_0.2s_ease-out]">
      {/* Top Header & Confirmation Badge */}
      <div className="text-center pb-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto mb-5 h-20 w-20 rounded-full bg-teal-500/10 border-2 border-teal-400 flex items-center justify-center shadow-[0_0_30px_rgba(20,184,166,0.2)]"
        >
          <Check className="h-9 w-9 text-teal-400" strokeWidth={3} />
        </motion.div>
        <h1 className="text-2xl font-black font-display text-white tracking-tight">Withdrawal successful</h1>
        <p className="text-sm text-slate-300 mt-2 max-w-[34ch] mx-auto leading-relaxed">
          Your withdrawal has been successful, and your funds have been credited into your account.
        </p>
      </div>

      {/* Main Receipt Body */}
      <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden shadow-2xl backdrop-blur-md">
        {/* Amount Display */}
        <div className="px-6 pt-6 pb-5 text-center">
          <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">You withdrew</span>
          <span className="text-4xl font-black text-white font-mono tracking-tight tabular-nums mt-1 block">
            {formatNaira(transaction.amount)}
          </span>
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-0.5 rounded-full text-[11px] font-semibold mt-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Status: Successful
          </div>
        </div>

        {/* Decorative Voucher Tear Divider with Semicircle Cutouts */}
        <div className="relative my-1 flex items-center px-1">
          <div className="absolute -left-3.5 h-7 w-7 rounded-full bg-slate-950 border-r border-white/10"></div>
          <div className="w-full border-t-2 border-dashed border-white/15"></div>
          <div className="absolute -right-3.5 h-7 w-7 rounded-full bg-slate-950 border-l border-white/10"></div>
        </div>

        {/* Transaction Details */}
        <dl className="px-6 pt-4 pb-2 text-sm">
          <div className="flex justify-between items-baseline gap-4 py-2">
            <dt className="text-slate-400">To</dt>
            <dd className="font-semibold text-slate-100 text-right">
              {accountName}
              <span className="block text-xs font-normal text-slate-400">
                {bankName} • <span className="font-mono text-emerald-300">{maskedAccount}</span>
              </span>
            </dd>
          </div>
          <div className="flex justify-between items-baseline gap-4 py-2">
            <dt className="text-slate-400">Reference</dt>
            <dd className="font-semibold text-slate-100 font-mono text-right break-all text-xs">{reference}</dd>
          </div>
          {dateLabel && (
            <div className="flex justify-between items-baseline gap-4 py-2">
              <dt className="text-slate-400">Date</dt>
              <dd className="font-semibold text-slate-100 text-right text-xs font-mono">{dateLabel}</dd>
            </div>
          )}
          <div className="flex justify-between items-baseline gap-4 py-2">
            <dt className="text-slate-400">Fee</dt>
            <dd className="font-semibold text-emerald-400 font-mono text-xs">{formatNaira(charges)}</dd>
          </div>
          {typeof transaction.newBalance === 'number' && (
            <div className="flex justify-between items-baseline gap-4 py-3 mt-1 border-t border-white/10">
              <dt className="text-slate-400">New balance</dt>
              <dd className="font-black text-teal-400 font-mono text-sm">{formatNaira(transaction.newBalance)}</dd>
            </div>
          )}
        </dl>

        {/* Dynamic Timeline Tracker ("Where your money is") */}
        <div className="mx-5 mb-5 mt-2 rounded-xl bg-slate-950/70 border border-white/5 p-4">
          <h2 className="text-sm font-bold text-white mb-3 font-mono tracking-wide">Where your money is</h2>
          <ol className="space-y-4">
            {/* Step 1: Requested */}
            <li className="relative pl-7 text-sm">
              <span className="absolute left-0 top-1 h-4 w-4 rounded-full bg-teal-400 flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-slate-950 stroke-[3.5]" />
              </span>
              <span className="absolute left-[7px] top-6 bottom-[-16px] w-0.5 bg-teal-400 transition-colors duration-500" />
              <b className="block font-bold text-slate-100">Requested</b>
              <span className="text-xs text-slate-400">{dateLabel || 'Completed'}</span>
            </li>

            {/* Step 2: Processing -> Processed */}
            <li className="relative pl-7 text-sm">
              {isProcessed ? (
                <motion.span
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute left-0 top-1 h-4 w-4 rounded-full bg-teal-400 flex items-center justify-center shadow-[0_0_12px_rgba(20,184,166,0.5)]"
                >
                  <Check className="h-2.5 w-2.5 text-slate-950 stroke-[3.5]" />
                </motion.span>
              ) : (
                <span className="absolute left-0 top-1 h-4 w-4 rounded-full bg-amber-400/20 border border-amber-400 flex items-center justify-center ring-4 ring-amber-400/10">
                  <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />
                </span>
              )}
              <span className={`absolute left-[7px] top-6 bottom-[-16px] w-0.5 transition-colors duration-500 ${isProcessed ? 'bg-teal-400' : 'bg-slate-700'}`} />
              <b className="block font-bold text-slate-100">
                {isProcessed ? (
                  <span className="text-teal-300">Processed</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-300">
                    Processing
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-amber-400 animate-ping"></span>
                    </span>
                  </span>
                )}
              </b>
              <span className="text-xs text-slate-400">
                {isProcessed ? 'Sent to your bank' : 'Connecting to bank network...'}
              </span>
            </li>

            {/* Step 3: Arrives in your bank / Credited */}
            <li className="relative pl-7 text-sm">
              {isProcessed ? (
                <motion.span
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15 }}
                  className="absolute left-0 top-1 h-4 w-4 rounded-full bg-teal-400 flex items-center justify-center shadow-[0_0_12px_rgba(20,184,166,0.5)]"
                >
                  <Check className="h-2.5 w-2.5 text-slate-950 stroke-[3.5]" />
                </motion.span>
              ) : (
                <span className="absolute left-0 top-1 h-4 w-4 rounded-full bg-slate-900 border-2 border-slate-600" />
              )}
              <b className="block font-bold text-slate-100">
                {isProcessed ? 'Credited to your account' : 'Arrives in your bank'}
              </b>
              <span className="text-xs text-slate-400">
                {isProcessed ? 'Funds credited into your account' : 'Finalizing credit...'}
              </span>
            </li>
          </ol>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid gap-2.5 mt-5">
        <button
          id="btn-withdraw-success-done"
          type="button"
          onClick={onDone}
          className="min-h-[52px] rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer hover:from-teal-300 hover:to-emerald-300 transition-all active:scale-[0.99] shadow-lg shadow-teal-500/20"
        >
          Back to wallet <ArrowRight className="h-4 w-4" />
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            id="btn-withdraw-success-receipt"
            type="button"
            onClick={onViewReceipt}
            className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-white/10 transition-colors"
          >
            <Download className="h-4 w-4 text-teal-400" /> View receipt
          </button>
          <button
            id="btn-withdraw-success-copy"
            type="button"
            onClick={copyReference}
            className="min-h-[48px] rounded-2xl border border-white/10 bg-white/5 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-white/10 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-slate-400" />
                <span>Copy reference</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
