import React, { useState } from 'react';
import { Download, Share2, X, Check, Copy, ShieldCheck, ArrowRight } from 'lucide-react';
import jsPDF from 'jspdf';
import { Transaction } from '../types';

interface TransactionReceiptProps {
  transaction: Transaction | null;
  onClose: () => void;
  onShare: (summary: string) => void;
  onToast: (msg: string, type: 'success' | 'info' | 'error') => void;
}

// Helper: Mask account number to show first 2 and last 3 digits (e.g. 12*****890)
export function maskAccountNumber(accountNumber: string | undefined): string {
  const clean = String(accountNumber || '').trim();
  if (!clean) return '••••••••••';
  if (clean.length <= 5) return clean;
  const first2 = clean.slice(0, 2);
  const last3 = clean.slice(-3);
  const maskedLength = Math.max(1, clean.length - 5);
  return `${first2}${'*'.repeat(maskedLength)}${last3}`;
}

// Helper: Format currency strictly using Nigerian Naira (₦) with 2 decimals
export function formatReceiptNaira(amount: number | string | undefined): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  const safeNum = isNaN(num) ? 0 : num;
  return `₦${safeNum.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionReceipt({
  transaction,
  onClose,
  onShare,
  onToast
}: TransactionReceiptProps) {
  const [copiedRef, setCopiedRef] = useState(false);

  if (!transaction) return null;

  const getFormattedDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const valid = !isNaN(d.getTime());
    const targetDate = valid ? d : new Date();
    return {
      date: targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      full: targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ', ' + targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isoDate: targetDate.toISOString().split('T')[0]
    };
  };

  const { full: formattedDate, isoDate } = getFormattedDate(transaction.date);
  const refNum = transaction.reference || transaction.refNum || transaction.id || `TXN-${Date.now()}`;
  const newBalanceVal = transaction.newBalance ?? (transaction as any).balanceAfter ?? 0;
  const type = transaction.type;

  // Beneficiary details
  const bankName = transaction.recipientBank || 'PalmPay';
  const recipientName = transaction.recipientName || 'SwiftPay User';
  const recipientAccount = transaction.recipientAccount || '8960723295';
  const maskedAccount = maskAccountNumber(recipientAccount);

  let title = "Withdrawal successful";
  let subtitle = "Your withdrawal has been successful, and your funds have been credited into your account.";

  if (type === 'withdraw') {
    title = "Withdrawal successful";
    subtitle = "Your withdrawal has been successful, and your funds have been credited into your account.";
  } else if (type === 'bank_transfer_direct') {
    title = "Transfer successful";
    subtitle = "Your transfer has been processed and sent to the recipient.";
  } else if (type === 'redeem_airtime') {
    title = "Airtime purchase successful";
    subtitle = "Mobile line has been credited with airtime.";
  } else if (type === 'redeem_data') {
    title = "Data bundle successful";
    subtitle = "Data bundle subscription is active.";
  } else {
    title = "Transaction successful";
    subtitle = "Your payment transaction has been processed successfully.";
  }

  const handleCopyReference = () => {
    navigator.clipboard.writeText(refNum);
    setCopiedRef(true);
    onToast('Reference copied to clipboard!', 'success');
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleDownload = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Colors
      const primaryDark = [15, 23, 42]; // #0f172a
      const emeraldAccent = [16, 185, 129]; // #10b981
      const slateDark = [15, 23, 42]; // #0f172a
      const borderGray = [226, 232, 240]; // #e2e8f0
      const textDark = [30, 41, 59]; // #1e293b
      const textMuted = [100, 116, 139]; // #64748b

      // Header Banner
      doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
      doc.rect(0, 0, 210, 48, 'F');

      // Top Accent Line
      doc.setFillColor(emeraldAccent[0], emeraldAccent[1], emeraldAccent[2]);
      doc.rect(0, 0, 210, 4, 'F');

      // Brand Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text('SWIFTPAY DIGITAL BANKING', 20, 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(emeraldAccent[0], emeraldAccent[1], emeraldAccent[2]);
      doc.text('Official Settlement Confirmation & Transaction Receipt', 20, 31);

      // Status Badge
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(150, 18, 40, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('SUCCESSFUL', 156, 24.5);

      // Amount Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(20, 56, 170, 28, 3, 3, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('TOTAL AMOUNT', 30, 66);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      const amountStr = `NGN ${Number(transaction.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      doc.text(amountStr, 30, 77);

      // Receipt Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(title.toUpperCase(), 20, 96);

      // Items Card Table
      const contentRows = [
        { label: "To", value: `${bankName} • ${recipientName} • ${maskedAccount}` },
        { label: "Date & Time", value: formattedDate },
        { label: "Transaction Reference", value: refNum },
        { label: "Fee", value: "NGN 0.00" },
        { label: "Remaining Wallet Balance", value: `NGN ${Number(newBalanceVal).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` },
        { label: "Arrives in your bank", value: "Expected within 24 hours" }
      ];

      const startY = 104;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(20, startY, 170, (contentRows.length * 12) + 12, 3, 3, 'D');

      let currentY = startY + 10;
      contentRows.forEach((row, idx) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text(row.label, 26, currentY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(row.value, 184, currentY, { align: 'right' });

        currentY += 12;
        if (idx < contentRows.length - 1) {
          doc.setDrawColor(241, 245, 249);
          doc.line(26, currentY - 6, 184, currentY - 6);
        }
      });

      // Security / Support Footer Section
      const footerY = currentY + 15;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.roundedRect(20, footerY, 170, 32, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text('SECURITY & COMPLIANCE VERIFICATION', 28, footerY + 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text('• End-to-end encrypted settlement record.', 28, footerY + 17);
      doc.text('• Support: support@swiftpay.com | www.swiftpay.com', 28, footerY + 23);

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated on ${new Date().toLocaleString()} • SwiftPay Enterprise Engine`, 105, 280, { align: 'center' });

      const filename = `SwiftPay-Withdrawal-${isoDate}.pdf`;
      doc.save(filename);
      onToast(`PDF receipt downloaded: ${filename}`, 'success');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      onToast('Error generating PDF receipt', 'error');
    }
  };

  const handleShareClick = () => {
    const summary = `SwiftPay Receipt\n${title}\nAmount: ${formatReceiptNaira(transaction.amount)}\nTo: ${bankName} • ${recipientName} • ${maskedAccount}\nReference: ${refNum}\nDate: ${formattedDate}`;
    onShare(summary);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* SVG Animation Keyframes */}
      <style>{`
        @keyframes receiptRingDraw {
          0% { stroke-dashoffset: 140; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes receiptTickDraw {
          0% { stroke-dashoffset: 35; }
          100% { stroke-dashoffset: 0; }
        }
        .anim-receipt-ring {
          stroke-dasharray: 140;
          stroke-dashoffset: 140;
          animation: receiptRingDraw 0.7s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .anim-receipt-tick {
          stroke-dasharray: 35;
          stroke-dashoffset: 35;
          animation: receiptTickDraw 0.45s 0.25s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
      `}</style>

      {/* Main Receipt Card */}
      <div className="relative w-full max-w-[420px] bg-[#10141e] text-slate-100 rounded-3xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden my-auto animate-[scaleUp_0.22s_ease-out]">
        
        {/* Top Dismiss Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Close receipt"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Top Header Section with Animated Badge */}
        <div className="pt-8 pb-4 px-6 text-center">
          {/* Animated SVG Badge */}
          <div className="relative inline-flex items-center justify-center mb-3">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shadow-[0_0_35px_rgba(16,185,129,0.2)]">
              <svg className="h-10 w-10 text-emerald-400" viewBox="0 0 48 48" fill="none">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  className="anim-receipt-ring opacity-80"
                />
                <path
                  d="M15 24.5 L21.5 31 L33 19"
                  stroke="currentColor"
                  strokeWidth="3.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="anim-receipt-tick"
                />
              </svg>
            </div>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-white font-sans">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            {subtitle}
          </p>

          {/* Amount Display */}
          <div className="mt-4 pt-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-semibold">
              Amount
            </div>
            <div className="text-3xl sm:text-[34px] font-black text-white font-mono tracking-tight mt-1 tabular-nums">
              {formatReceiptNaira(transaction.amount)}
            </div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-0.5 rounded-full text-[11px] font-semibold mt-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Status: Successful
            </div>
          </div>
        </div>

        {/* Decorative Tear Cutout Divider */}
        <div className="relative my-2 flex items-center px-1">
          <div className="absolute -left-3.5 h-7 w-7 rounded-full bg-slate-950/85 border-r border-white/10"></div>
          <div className="w-full border-t border-dashed border-white/15"></div>
          <div className="absolute -right-3.5 h-7 w-7 rounded-full bg-slate-950/85 border-l border-white/10"></div>
        </div>

        {/* Receipt Body & Timeline */}
        <div className="px-6 py-4 space-y-5">
          {/* Detailed Transaction Fields */}
          <dl className="space-y-2.5 text-xs">
            {/* Beneficiary */}
            <div className="flex justify-between items-baseline gap-2">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">To</dt>
              <dd className="text-right text-slate-100 font-semibold truncate">
                <span>{bankName}</span>
                <span className="mx-1 text-slate-500">•</span>
                <span className="text-slate-200">{recipientName}</span>
                <span className="mx-1 text-slate-500">•</span>
                <span className="font-mono text-emerald-300 tracking-wider">{maskedAccount}</span>
              </dd>
            </div>

            {/* Date */}
            <div className="flex justify-between items-baseline gap-2">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">Date</dt>
              <dd className="text-right text-slate-200 font-medium font-mono text-[11px]">
                {formattedDate}
              </dd>
            </div>

            {/* Reference with inline copy */}
            <div className="flex justify-between items-center gap-2">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">Reference</dt>
              <dd className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px]">
                <span className="select-all truncate max-w-[170px] sm:max-w-[210px]">{refNum}</span>
                <button
                  type="button"
                  onClick={handleCopyReference}
                  className="p-1 text-slate-400 hover:text-teal-300 transition-colors rounded hover:bg-white/5 cursor-pointer"
                  title="Copy reference"
                >
                  {copiedRef ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </dd>
            </div>

            {/* Fee */}
            <div className="flex justify-between items-baseline gap-2">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">Fee</dt>
              <dd className="text-right text-emerald-400 font-semibold font-mono text-[11px]">
                ₦0.00
              </dd>
            </div>

            {/* Remaining Wallet Balance */}
            <div className="flex justify-between items-baseline gap-2 pt-1 border-t border-white/5">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">Remaining Wallet Balance</dt>
              <dd className="text-right text-teal-300 font-bold font-mono text-xs">
                {formatReceiptNaira(newBalanceVal)}
              </dd>
            </div>

            {/* Arrival Notice */}
            <div className="flex justify-between items-baseline gap-2">
              <dt className="text-slate-400 text-[11px] font-medium shrink-0">Status</dt>
              <dd className="text-right text-emerald-400 font-medium text-[11px]">
                Credited to your bank
              </dd>
            </div>
          </dl>

          {/* Timeline Tracker: Where your money is */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-3 font-mono">
              Where your money is
            </span>

            <div className="relative pl-6 space-y-4">
              {/* Vertical connector line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-emerald-500"></div>

              {/* Step 1: Requested */}
              <div className="relative flex items-start gap-2.5">
                <div className="absolute -left-6 mt-0.5 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400 stroke-[3]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Requested</div>
                  <div className="text-[10px] text-emerald-400 font-mono">Completed</div>
                </div>
              </div>

              {/* Step 2: Processed */}
              <div className="relative flex items-start gap-2.5">
                <div className="absolute -left-6 mt-0.5 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400 stroke-[3]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Processed</div>
                  <div className="text-[10px] text-emerald-400 font-mono">Sent to your bank</div>
                </div>
              </div>

              {/* Step 3: Credited */}
              <div className="relative flex items-start gap-2.5">
                <div className="absolute -left-6 mt-0.5 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400 stroke-[3]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Credited to your account</div>
                  <div className="text-[10px] text-emerald-400 font-mono">Funds credited into account</div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* Primary Action: Back to wallet */}
            <button
              id="btn-receipt-back-wallet"
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              Back to wallet <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {/* Secondary Actions: Copy reference, Download PDF, Share */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyReference}
                className="flex-1 py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedRef ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Reference Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copy reference</span>
                  </>
                )}
              </button>

              <button
                id="btn-download-pdf-receipt"
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                title="Download PDF"
              >
                <Download className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={handleShareClick}
                className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                title="Share Receipt"
              >
                <Share2 className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-2 text-center text-[10px] text-slate-500 leading-relaxed">
            <p>We've emailed you a receipt. Questions? Quote your reference when you contact support.</p>
            <div className="flex items-center justify-center gap-1 text-[9px] text-slate-600 mt-2">
              <ShieldCheck className="h-3 w-3 text-teal-500/80" />
              <span>End-to-End Encrypted Settlement Record</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
