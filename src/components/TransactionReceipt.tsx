import React from 'react';
import { Download, Share2, CheckCircle2, AlertTriangle, X, Printer, ShieldCheck } from 'lucide-react';
import { Transaction } from '../types';
import GlassCard from './GlassCard';

interface TransactionReceiptProps {
  transaction: Transaction | null;
  onClose: () => void;
  onShare: (summary: string) => void;
  onToast: (msg: string, type: 'success' | 'info' | 'error') => void;
}

export default function TransactionReceipt({
  transaction,
  onClose,
  onShare,
  onToast
}: TransactionReceiptProps) {
  if (!transaction) return null;

  const getCharges = (tx: Transaction) => {
    if (tx.charges !== undefined) return tx.charges;
    if (tx.type === 'bank_transfer_direct' || tx.type === 'withdraw') {
      return 10; // Standard ₦10 network charge
    }
    return 0; // Airtime / Data / BPC has 0 charges
  };

  const getSenderName = (tx: Transaction) => {
    if (tx.senderName) return tx.senderName;
    if (tx.type === 'deposit') return 'External Bank Transfer';
    return 'Me (SwiftPay Wallet)';
  };

  const getRecipientName = (tx: Transaction) => {
    if (tx.recipientName) return tx.recipientName;
    if (tx.type === 'bank_transfer_direct' || tx.type === 'withdraw') {
      return tx.description.replace(/^Transfer of ₦[\d,]+ to\s+/i, '').replace(/^Withdrew ₦[\d,]+ to\s+/i, '');
    }
    return tx.description;
  };

  const getFormattedDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  };

  const { date, time } = getFormattedDate(transaction.date);
  const charges = getCharges(transaction);
  const totalDeduction = transaction.amount + charges;

  const handleDownload = () => {
    // Generate text-based receipt and trigger download
    const receiptText = `
=========================================
            SWIFTPAY RECEIPT             
=========================================
Transaction ID:  ${transaction.id}
Date & Time:     ${date} at ${time}
Status:          ${transaction.status.toUpperCase()}
Type:            ${transaction.type.toUpperCase()}
-----------------------------------------
Sender:          ${getSenderName(transaction)}
Recipient:       ${getRecipientName(transaction)}
-----------------------------------------
Principal:       ₦${transaction.amount.toLocaleString()}
Charges/Fees:    ₦${charges.toLocaleString()}
Total Amount:    ₦${totalDeduction.toLocaleString()}
-----------------------------------------
Narration:       ${transaction.narration || 'SwiftPay digital settlement'}
Security:        Fully verified & finalized
=========================================
   Thank you for choosing SwiftPay!      
=========================================
    `;

    const element = document.createElement('a');
    const file = new Blob([receiptText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `SwiftPay_Receipt_${transaction.id}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    onToast('Receipt downloaded successfully as TXT/PDF alternative!', 'success');
  };

  const handleShareClick = () => {
    const summary = `SwiftPay Transaction Receipt:\nSent ₦${transaction.amount.toLocaleString()} to ${getRecipientName(transaction)} on ${date}. Status: ${transaction.status.toUpperCase()}. Ref ID: ${transaction.id}`;
    onShare(summary);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0c0c14] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative animate-[scaleUp_0.25s_ease-out]">
        
        {/* Receipt Header Banner */}
        <div className="bg-gradient-to-r from-indigo-600 to-teal-500 p-6 text-center text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="mx-auto h-12 w-12 rounded-full bg-white/10 flex items-center justify-center mb-2">
            <CheckCircle2 className="h-7 w-7 text-teal-300" />
          </div>
          <h4 className="text-sm font-black tracking-widest uppercase font-mono">Transaction Receipt</h4>
          <p className="text-[10px] text-teal-200 mt-1">Official settlement confirmation</p>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div className="text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Total Settlement</span>
            <h3 className="text-2xl font-black font-mono text-white mt-1">
              ₦{transaction.amount.toLocaleString()}
            </h3>
            <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-block mt-2">
              Status: {transaction.status.toUpperCase()}
            </span>
          </div>

          <GlassCard className="p-4 bg-white/[0.02] border-white/5 space-y-3 font-mono text-[10px] text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Transaction ID</span>
              <span className="text-white font-bold select-all">{transaction.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date &amp; Time</span>
              <span className="text-white">{date} &bull; {time}</span>
            </div>
            <div className="border-t border-white/5 my-2" />
            <div className="flex justify-between">
              <span className="text-slate-500">Sender</span>
              <span className="text-white truncate max-w-[150px]">{getSenderName(transaction)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recipient</span>
              <span className="text-white truncate max-w-[150px]">{getRecipientName(transaction)}</span>
            </div>
            {transaction.narration && (
              <div className="flex justify-between">
                <span className="text-slate-500">Narration</span>
                <span className="text-white truncate max-w-[150px] italic">"{transaction.narration}"</span>
              </div>
            )}
            <div className="border-t border-white/5 my-2" />
            <div className="flex justify-between">
              <span className="text-slate-500">Principal</span>
              <span className="text-white">₦{transaction.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Service Charges</span>
              <span className="text-white">₦{charges.toLocaleString()}</span>
            </div>
            <div className="border-t border-dashed border-white/10 my-2 pt-2 flex justify-between text-xs font-bold text-teal-400">
              <span>Total Settlement</span>
              <span>₦{totalDeduction.toLocaleString()}</span>
            </div>
          </GlassCard>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              onClick={handleShareClick}
              className="px-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center"
              title="Share Receipt Summary"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 justify-center">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-500" /> Fully Encrypted &amp; Verified Settlement Receipt
          </div>
        </div>
      </div>
    </div>
  );
}
