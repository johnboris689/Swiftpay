import React, { useState } from 'react';
import { Copy, Check, Ticket, ArrowUpRight, Share2 } from 'lucide-react';
import { BpcCode } from '../types';

interface BpcVoucherProps {
  voucher: BpcCode;
  onRedeemAirtime?: (code: string) => void;
  onRedeemTransfer?: (code: string) => void;
  key?: React.Key | string | number;
}

export default function BpcVoucher({ voucher, onRedeemAirtime, onRedeemTransfer }: BpcVoucherProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(voucher.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(voucher.amount);

  const isUnused = voucher.status === 'unused';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 dark:border-teal-500/20 bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-teal-950/20 backdrop-blur-md p-5 shadow-lg group">
      {/* Decorative background glow circles */}
      <div className="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-teal-500/10 blur-xl group-hover:bg-teal-500/20 transition-all duration-300" />
      <div className="absolute -left-10 -bottom-10 w-24 h-24 rounded-full bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20 transition-all duration-300" />

      {/* Ticket Side Cuts */}
      <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 dark:bg-[#0c0c14] border border-indigo-500/10 dark:border-white/5" />
      <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 dark:bg-[#0c0c14] border border-indigo-500/10 dark:border-white/5" />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Bill Payment Code</span>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">{voucher.fullName}</h4>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full border ${
            isUnused
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-slate-500/10 text-slate-500 border-slate-500/10'
          }`}
        >
          {voucher.status.toUpperCase()}
        </span>
      </div>

      {/* Amount Display */}
      <div className="my-4 text-center relative z-10">
        <span className="text-[11px] text-slate-400 block mb-0.5">Voucher Value</span>
        <span className="text-2xl font-bold font-display bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-500 dark:from-indigo-400 dark:via-purple-300 dark:to-teal-300 bg-clip-text text-transparent">
          {formattedAmount}
        </span>
      </div>

      {/* Dashed Line */}
      <div className="border-t-2 border-dashed border-slate-200/50 dark:border-slate-800/60 my-3.5 mx-1" />

      {/* Copyable Code Container */}
      <div className="relative z-10">
        <span className="text-[10px] text-slate-400 block mb-1 text-center font-mono">Redeem Code</span>
        <div className="flex items-center justify-between bg-white/40 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-xl p-2.5 pl-3.5">
          <span className="font-mono text-sm tracking-widest font-bold text-slate-800 dark:text-teal-400">
            {voucher.code}
          </span>
          <button
            id={`btn-copy-bpc-${voucher.id}`}
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all active:scale-90"
            title="Copy BPC Code"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Quick Action Links if Unused */}
      {isUnused && (onRedeemAirtime || onRedeemTransfer) && (
        <div className="mt-4 grid grid-cols-2 gap-2 relative z-10">
          {onRedeemAirtime && (
            <button
              id={`btn-redeem-airtime-${voucher.id}`}
              type="button"
              onClick={() => onRedeemAirtime(voucher.code)}
              className="text-[11px] font-medium py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1 shadow-sm transition-colors"
            >
              Buy Airtime <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
          {onRedeemTransfer && (
            <button
              id={`btn-redeem-transfer-${voucher.id}`}
              type="button"
              onClick={() => onRedeemTransfer(voucher.code)}
              className="text-[11px] font-medium py-1.5 px-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-slate-900 flex items-center justify-center gap-1 shadow-sm transition-colors font-semibold"
            >
              Transfer Out <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Redeemed info block */}
      {!isUnused && voucher.redeemedFor && (
        <div className="mt-2.5 text-[10px] text-center text-slate-400 font-mono relative z-10 bg-slate-100/50 dark:bg-slate-900/30 p-1.5 rounded-lg border border-slate-150 dark:border-slate-800/40">
          Redeemed for: {voucher.redeemedFor}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 font-mono relative z-10">
        <span>Issued: {new Date(voucher.createdAt).toLocaleDateString()}</span>
        <span className="flex items-center gap-1">
          <Share2 className="h-3 w-3 cursor-pointer hover:text-slate-300" /> Share
        </span>
      </div>
    </div>
  );
}
