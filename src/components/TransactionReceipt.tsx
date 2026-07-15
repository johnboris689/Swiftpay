import React from 'react';
import { Download, Share2, CheckCircle2, X, ShieldCheck } from 'lucide-react';
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

  const getFormattedDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  };

  const { date, time } = getFormattedDate(transaction.date);
  const refNum = transaction.reference || transaction.refNum || transaction.id;
  const newBalanceVal = transaction.newBalance ?? (transaction as any).balanceAfter ?? 0;

  let title = "Transaction Receipt";
  let contentRows = [];

  const type = transaction.type;

  if (type === 'withdraw') {
    title = "Withdrawal Successful";
    contentRows = [
      { label: "Bank", value: transaction.recipientBank || 'PalmPay', bold: true },
      { label: "Account Name", value: transaction.recipientName || 'Pwamunadi Ishaku' },
      { label: "Account Number", value: transaction.recipientAccount || '8960723295' },
      { label: "Amount", value: `₦${transaction.amount.toLocaleString()}`, bold: true },
      { label: "Transaction Reference", value: refNum, selectAll: true },
      { label: "Date & Time", value: `${date} ${time}` },
      { label: "Remaining Wallet Balance", value: `₦${newBalanceVal.toLocaleString()}`, highlight: true }
    ];
  } else if (type === 'bank_transfer_direct') {
    title = "Transfer Successful";
    contentRows = [
      { label: "Recipient Bank", value: transaction.recipientBank || 'N/A', bold: true },
      { label: "Recipient Account Number", value: transaction.recipientAccount || 'N/A' },
      { label: "Recipient Name", value: transaction.recipientName || 'N/A' },
      { label: "Amount", value: `₦${transaction.amount.toLocaleString()}`, bold: true },
      { label: "Transaction Reference", value: refNum, selectAll: true },
      { label: "Date & Time", value: `${date} ${time}` },
      { label: "Remaining Wallet Balance", value: `₦${newBalanceVal.toLocaleString()}`, highlight: true }
    ];
  } else if (type === 'redeem_airtime') {
    title = "Airtime Purchase Successful";
    contentRows = [
      { label: "Network", value: transaction.recipientBank || transaction.network || 'MTN', bold: true },
      { label: "Phone Number", value: transaction.recipientAccount || transaction.phoneNumber || 'N/A' },
      { label: "Amount", value: `₦${transaction.amount.toLocaleString()}`, bold: true },
      { label: "Transaction Reference", value: refNum, selectAll: true },
      { label: "Date & Time", value: `${date} ${time}` },
      { label: "Remaining Wallet Balance", value: `₦${newBalanceVal.toLocaleString()}`, highlight: true }
    ];
  } else if (type === 'redeem_data') {
    let planSize = transaction.dataPlan;
    if (!planSize && transaction.description) {
      const match = transaction.description.match(/Data Purchase of\s+(\S+)/i);
      if (match) planSize = match[1];
    }
    if (!planSize) planSize = "1.5GB";

    title = "Data Purchase Successful";
    contentRows = [
      { label: "Network", value: transaction.recipientBank || transaction.network || 'MTN', bold: true },
      { label: "Phone Number", value: transaction.recipientAccount || transaction.phoneNumber || 'N/A' },
      { label: "Data Plan", value: planSize },
      { label: "Amount", value: `₦${transaction.amount.toLocaleString()}`, bold: true },
      { label: "Transaction Reference", value: refNum, selectAll: true },
      { label: "Date & Time", value: `${date} ${time}` },
      { label: "Remaining Wallet Balance", value: `₦${newBalanceVal.toLocaleString()}`, highlight: true }
    ];
  } else {
    title = "Operation Successful";
    contentRows = [
      { label: "Transaction Reference", value: transaction.id, selectAll: true },
      { label: "Date & Time", value: `${date} ${time}` },
      { label: "Type", value: transaction.type.toUpperCase() },
      { label: "Amount", value: `₦${transaction.amount.toLocaleString()}`, bold: true },
      { label: "Description", value: transaction.description },
      { label: "Remaining Wallet Balance", value: `₦${newBalanceVal.toLocaleString()}`, highlight: true }
    ];
  }

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    const receiptText = `
=========================================
            SWIFTPAY RECEIPT             
=========================================
${title.toUpperCase()}
-----------------------------------------
${contentRows.map(row => `${row.label.padEnd(25)}: ${row.value}`).join('\n')}
-----------------------------------------
Thank you for choosing SwiftPay!
=========================================
    `;

    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>SwiftPay Receipt - ${transaction.id}</title>
            <style>
              body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #111; max-width: 500px; margin: 0 auto; line-height: 1.5; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px dashed #ccc; padding-bottom: 20px; }
              .amount { font-size: 24px; font-weight: bold; margin: 10px 0; }
              .details { margin-bottom: 30px; }
              .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
              .label { color: #555; }
              .value { font-weight: bold; }
              .footer { text-align: center; border-top: 2px dashed #ccc; padding-top: 20px; font-size: 12px; color: #777; margin-top: 30px; }
              @media print {
                body { padding: 20px; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>SWIFTPAY DIGITAL BANKING</h2>
              <div class="amount">₦${transaction.amount.toLocaleString()}</div>
              <div>${title}</div>
            </div>
            <div class="details">
              ${contentRows.map(row => `
                <div class="row">
                  <span class="label">${row.label}:</span>
                  <span class="value">${row.value}</span>
                </div>
              `).join('')}
            </div>
            <div class="footer">
              <p>Fully Encrypted & Verified Settlement Receipt</p>
              <p>Thank you for choosing SwiftPay!</p>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      onToast('Receipt print window opened! Select Save as PDF.', 'success');
    } else {
      const element = document.createElement('a');
      const file = new Blob([receiptText], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `SwiftPay_Receipt_${transaction.id}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      onToast('Popup was blocked. Downloaded receipt as text file!', 'success');
    }
  };

  const handleShareClick = () => {
    const summary = `SwiftPay Receipt:\n${title}\n` + contentRows.map(row => `${row.label}: ${row.value}`).join('\n');
    onShare(summary);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0c0c14] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative animate-[scaleUp_0.25s_ease-out] font-sans">
        
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
          <h4 className="text-sm font-black tracking-widest uppercase font-mono">{title}</h4>
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
              Status: Successful
            </span>
          </div>

          <GlassCard className="p-4 bg-white/[0.02] border-white/5 space-y-3 font-mono text-[10px] text-slate-300">
            {contentRows.map((row, i) => (
              <div key={i}>
                {row.label === 'New Wallet Balance' || row.label === 'New Balance' || row.label === 'Remaining Wallet Balance' ? (
                  <div className="border-t border-dashed border-white/10 my-2 pt-2 flex justify-between text-xs font-bold text-teal-400">
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-500">{row.label}</span>
                    <span className={`text-white truncate max-w-[200px] ${row.bold ? 'font-bold' : ''} ${row.selectAll ? 'select-all' : ''}`}>
                      {row.value}
                    </span>
                  </div>
                )}
              </div>
            ))}
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
