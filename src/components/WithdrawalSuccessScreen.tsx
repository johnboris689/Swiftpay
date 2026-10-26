import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Download, ArrowRight } from 'lucide-react';
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

export default function WithdrawalSuccessScreen({
  transaction,
  bankName,
  accountName,
  accountNumber,
  onViewReceipt,
  onDone
}: WithdrawalSuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  const reference = transaction.reference || transaction.refNum || transaction.id;
  const charges = transaction.charges ?? 0;
  const isPending = transaction.status === 'pending';
  const when = new Date(transaction.date);
  const dateLabel = isNaN(when.getTime())
    ? ''
    : when.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const maskedAccount = accountNumber ? `••${accountNumber.slice(-4)}` : '';

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const steps = [
    { label: 'Requested', note: dateLabel, state: 'done' },
    {
      label: isPending ? 'Under review' : 'Processed',
      note: isPending ? 'Our team is verifying your request' : 'Sent to your bank',
      state: isPending ? 'now' : 'done'
    },
    { label: 'Arrives in your bank', note: 'You will get a notification', state: 'todo' }
  ] as const;

  return (
    <div id="withdraw-success-screen" className="w-full max-w-md mx-auto px-4 py-8 flex flex-col">
      <div className="text-center pb-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto mb-5 h-20 w-20 rounded-full bg-teal-500/10 border-2 border-teal-400 flex items-center justify-center"
        >
          <Check className="h-9 w-9 text-teal-400" strokeWidth={3} />
        </motion.div>
        <h1 className="text-2xl font-black font-display text-white tracking-tight">Withdrawal successful</h1>
        <p className="text-sm text-slate-400 mt-1.5 max-w-[30ch] mx-auto">
          {isPending
            ? 'Your request has been received and is being reviewed.'
            : 'Your money is on its way to your bank account.'}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center">
          <span className="text-xs text-slate-400 block">You withdrew</span>
          <span className="text-4xl font-black text-white font-mono tracking-tight tabular-nums">
            {formatNaira(transaction.amount)}
          </span>
        </div>

        <div className="border-t-2 border-dashed border-white/10 mx-5" />

        <dl className="px-6 pt-4 pb-2 text-sm">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-slate-400">To</dt>
            <dd className="font-semibold text-slate-100 text-right">
              {accountName}
              <span className="block text-xs font-normal text-slate-400">{bankName} {maskedAccount}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-slate-400">Reference</dt>
            <dd className="font-semibold text-slate-100 font-mono text-right break-all">{reference}</dd>
          </div>
          {dateLabel && (
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-400">Date</dt>
              <dd className="font-semibold text-slate-100 text-right">{dateLabel}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-slate-400">Fee</dt>
            <dd className="font-semibold text-slate-100 font-mono">{formatNaira(charges)}</dd>
          </div>
          {typeof transaction.newBalance === 'number' && (
            <div className="flex justify-between gap-4 py-3 mt-1 border-t border-white/10">
              <dt className="text-slate-400">New balance</dt>
              <dd className="font-black text-teal-400 font-mono">{formatNaira(transaction.newBalance)}</dd>
            </div>
          )}
        </dl>

        <div className="mx-5 mb-5 mt-2 rounded-xl bg-slate-950/60 p-4">
          <h2 className="text-sm font-bold text-white mb-3">Where your money is</h2>
          <ol className="space-y-3.5">
            {steps.map((s, i) => (
              <li key={s.label} className="relative pl-7 text-sm">
                <span
                  className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                    s.state === 'done'
                      ? 'bg-teal-400 border-teal-400'
                      : s.state === 'now'
                        ? 'bg-amber-400 border-amber-400 ring-4 ring-amber-400/20'
                        : 'bg-slate-900 border-slate-600'
                  }`}
                />
                {i < steps.length - 1 && (
                  <span className={`absolute left-[6px] top-5 -bottom-3.5 w-0.5 ${s.state === 'done' ? 'bg-teal-400' : 'bg-slate-700'}`} />
                )}
                <b className="block font-bold text-slate-100">{s.label}</b>
                <span className="text-xs text-slate-400">{s.note}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="grid gap-2.5 mt-5">
        <button
          id="btn-withdraw-success-done"
          type="button"
          onClick={onDone}
          className="min-h-[52px] rounded-2xl bg-teal-400 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-teal-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          Back to wallet <ArrowRight className="h-4 w-4" />
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            id="btn-withdraw-success-receipt"
            type="button"
            onClick={onViewReceipt}
            className="min-h-[48px] rounded-2xl border border-white/10 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
          >
            <Download className="h-4 w-4" /> View receipt
          </button>
          <button
            id="btn-withdraw-success-copy"
            type="button"
            onClick={copyReference}
            className="min-h-[48px] rounded-2xl border border-white/10 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
          >
            <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy reference'}
          </button>
        </div>
      </div>
    </div>
  );
}
