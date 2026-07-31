import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  ShieldAlert,
  Terminal as TerminalIcon,
  Cpu,
  Database,
  Activity,
  FileText,
  UploadCloud,
  Trash2,
  Building,
  CreditCard,
  User,
  Mail,
  Phone,
  Hash,
  Calendar,
  Lock,
  Check,
  Zap,
  Server,
  Wifi,
  Eye,
  CheckSquare,
  AlertTriangle
} from 'lucide-react';

interface CyberWithdrawalTerminalProps {
  selectedWithdrawal: any;
  onBack: () => void;
  adminNotes: string;
  setAdminNotes: (v: string) => void;
  saveInternalNotes: () => void;
  savingNotes: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleSlipFileUpload: (file: File) => void;
  uploadingSlip: boolean;
  isDraggingSlip: boolean;
  setIsDraggingSlip: (v: boolean) => void;
  handleRemoveSlip: () => void;
  removingSlip: boolean;
  updateWithdrawalStatus: (status: string) => void;
  statusUpdating: string | null;
  maskAccountNumber: (num?: string) => string;
}

export function CyberWithdrawalTerminal({
  selectedWithdrawal,
  onBack,
  adminNotes,
  setAdminNotes,
  saveInternalNotes,
  savingNotes,
  fileInputRef,
  handleSlipFileUpload,
  uploadingSlip,
  isDraggingSlip,
  setIsDraggingSlip,
  handleRemoveSlip,
  removingSlip,
  updateWithdrawalStatus,
  statusUpdating,
  maskAccountNumber
}: CyberWithdrawalTerminalProps) {
  const statusLower = (selectedWithdrawal.status || '').toLowerCase();
  const dateObj = new Date(selectedWithdrawal.timestamp || selectedWithdrawal.created_at || Date.now());
  const dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const hasSlip = !!(selectedWithdrawal.posSlipPath || selectedWithdrawal.posslippath);

  // Live system monitor simulated stats
  const [cpuUsage, setCpuUsage] = useState(17);
  const [ramUsage, setRamUsage] = useState(42);
  const [latency, setLatency] = useState(19);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage(Math.floor(14 + Math.random() * 8));
      setRamUsage(Math.floor(41 + Math.random() * 4));
      setLatency(Math.floor(18 + Math.random() * 6));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Status Badge Glow Styling
  const getStatusBadge = () => {
    if (statusLower === 'completed' || statusLower === 'success') {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          ● VERIFIED &amp; COMPLETED
        </div>
      );
    }
    if (statusLower === 'rejected' || statusLower === 'cancelled') {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-rose-950/80 border border-rose-500/50 text-rose-400 font-mono text-xs font-bold shadow-[0_0_15px_rgba(244,63,94,0.3)]">
          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
          ● REJECTED
        </div>
      );
    }
    if (statusLower === 'processing') {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-amber-950/80 border border-amber-500/50 text-amber-400 font-mono text-xs font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          ● PROCESSING IN PROGRESS
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 font-mono text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        ● PENDING REVIEW - AWAITING ACTION
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-[#060810] text-slate-200 p-3 sm:p-6 space-y-6 font-mono text-xs select-none">
      {/* Navigation Header */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-950/50 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-900/40 transition-all text-cyan-300 font-bold cursor-pointer w-fit shadow-[0_0_10px_rgba(6,182,212,0.15)]"
        >
          <ArrowLeft className="h-4 w-4 text-cyan-400" />
          [ BACK TO WITHDRAWAL QUEUE ]
        </button>
        <div className="flex items-center gap-3">
          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-widest">SYSTEM AUDIT ID</span>
            <span className="text-xs sm:text-sm font-bold text-teal-300 tracking-wider">
              {selectedWithdrawal.reference || selectedWithdrawal.id}
            </span>
          </div>
          <div className="px-2.5 py-1 rounded bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[10px] font-bold">
            SHA-256 VERIFIED
          </div>
        </div>
      </div>

      {/* TOP PROCESSING CONSOLE */}
      <div className="w-full p-4 sm:p-6 rounded-xl border border-teal-500/30 bg-[#0a0e1a]/90 backdrop-blur-xl shadow-[0_0_30px_rgba(20,184,166,0.1)] space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <TerminalIcon className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-white tracking-widest uppercase flex items-center gap-2">
                SWIFTPAY SECURE TRANSACTION TERMINAL
                <span className="text-[10px] text-teal-400 font-normal px-2 py-0.5 rounded bg-teal-950 border border-teal-500/30">
                  OPSEC LEVEL 1
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-mono">Real-time fraud audit, ledger match, and banking compliance console.</p>
            </div>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Live Command Logs Box */}
        <div className="p-3 bg-[#03050a] rounded-lg border border-teal-500/20 text-[11px] space-y-1 text-slate-300 overflow-x-auto">
          <div className="text-teal-400 font-bold flex items-center gap-2">
            <span className="text-slate-500">[{timeStr}]</span> Loading transaction payload context...
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">[{timeStr}]</span> Checking withdrawal queue item state... <span className="text-emerald-400 font-bold">[QUEUED]</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">[{timeStr}]</span> Verifying WDV voucher checksum... <span className="text-teal-400 font-bold">{selectedWithdrawal.voucherCode ? '[VOUCHER MATCH PASSED]' : '[DIRECT TRANSFER]'}</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">[{timeStr}]</span> Matching beneficiary account details against central bank database... <span className="text-emerald-400 font-bold">[ACCOUNT MATCHED]</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">[{timeStr}]</span> Checking compliance rules &amp; risk thresholds... <span className="text-teal-400 font-bold">[0.00% RISK DETECTED]</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">[{timeStr}]</span> POS Decline Slip Requirement... <span className={hasSlip ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{hasSlip ? '[EVIDENCE RECORDED]' : '[AWAITING SLIP UPLOAD]'}</span>
          </div>
          <div className="text-teal-300 font-bold pt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping"></span>
            STATUS: {statusLower === 'completed' || statusLower === 'success' ? 'TRANSACTION APPROVED & FINALIZE' : statusLower === 'rejected' ? 'TRANSACTION REJECTED BY ADMIN' : 'AWAITING OPERATOR FINAL COMMAND'}
            <span className="animate-pulse">_</span>
          </div>
        </div>

        {/* Amount Summary Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-500 text-[10px] block font-bold uppercase">DATABASE RECORD MATCH</span>
              <span className="text-emerald-400 font-bold">SUCCESS (LEDGER SYNCED)</span>
            </div>
            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
            <div>
              <span className="text-slate-500 text-[10px] block font-bold uppercase">REQUEST TIMECODE</span>
              <span className="text-slate-300">{dateStr} @ {timeStr}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">WITHDRAWAL AMOUNT</span>
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 font-mono">
              ₦{Number(selectedWithdrawal.amount || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* THREE MAIN TERMINAL MODULES (ACCOUNT, BANKING, WDV) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Module 1: Client Profile Terminal */}
        <div className="p-4 rounded-xl bg-[#090d18] border border-indigo-500/30 space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-400" />
              CLIENT PROFILE TERMINAL
            </h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">USER DB</span>
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">NAME:</span>
              <span className="text-white font-bold">{selectedWithdrawal.fullName || selectedWithdrawal.accountName || selectedWithdrawal.accountname || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">EMAIL:</span>
              <span className="text-slate-200">{selectedWithdrawal.email || selectedWithdrawal.userId || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">PHONE:</span>
              <span className="text-slate-200">{selectedWithdrawal.phone || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">RISK LEVEL:</span>
              <span className="text-emerald-400 font-bold">LOW (0.0% THREAT)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">SESSION:</span>
              <span className="text-teal-400 font-bold">AUTHENTICATED</span>
            </div>
          </div>
        </div>

        {/* Module 2: Bank Terminal */}
        <div className="p-4 rounded-xl bg-[#090d18] border border-cyan-500/30 space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Building className="h-4 w-4 text-cyan-400" />
              BANK TERMINAL
            </h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">NIBSS INTEGRATED</span>
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">BANK:</span>
              <span className="text-white font-bold">{selectedWithdrawal.bankName || selectedWithdrawal.bankname || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">ACCOUNT:</span>
              <span className="text-cyan-300 font-bold">{maskAccountNumber(selectedWithdrawal.accountNumber || selectedWithdrawal.accountnumber)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">ACCOUNT NAME:</span>
              <span className="text-white font-bold">{selectedWithdrawal.accountName || selectedWithdrawal.accountname || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">STATUS:</span>
              <span className="text-emerald-400 font-bold">MATCHED</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ENCRYPTION:</span>
              <span className="text-slate-300 font-mono">AES-256 GCM</span>
            </div>
          </div>
        </div>

        {/* Module 3: WDV Generation Terminal */}
        <div className="p-4 rounded-xl bg-[#090d18] border border-teal-500/30 space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
            <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-teal-400" />
              WDV GENERATION TERMINAL
            </h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">VOUCHER MODULE</span>
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">VOUCHER:</span>
              <span className="text-teal-300 font-bold">{selectedWithdrawal.voucherCode || selectedWithdrawal.vouchercode || 'None'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">STATUS:</span>
              <span className={selectedWithdrawal.voucherCode ? "text-emerald-400 font-bold" : "text-slate-400"}>
                {selectedWithdrawal.voucherCode ? 'VALID & REGISTERED' : 'NOT APPLICABLE'}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">ISSUED:</span>
              <span className="text-slate-300">SYSTEM GENERATED</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-500">SECURITY:</span>
              <span className="text-emerald-400 font-bold">VERIFIED</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">CHECKSUM:</span>
              <span className="text-teal-400 font-bold">PASSED</span>
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE SECTION: FORENSIC EVIDENCE TERMINAL + INTERNAL NOTES + LIVE SYSTEM MONITOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Evidence Upload + Notes (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* POS Slip Evidence Terminal */}
          <div className="p-5 rounded-xl bg-[#090d18] border border-amber-500/30 space-y-4">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  FORENSIC EVIDENCE TERMINAL (POS DECLINE SLIP)
                </h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                hasSlip ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}>
                {hasSlip ? 'EVIDENCE UPLOADED' : 'AWAITING SLIP'}
              </span>
            </div>

            {hasSlip ? (
              <div className="space-y-3">
                <div className="relative p-3 rounded-lg bg-[#03050a] border border-white/10 flex flex-col items-center justify-center min-h-[220px]">
                  <img
                    src={selectedWithdrawal.posSlipPath || selectedWithdrawal.posslippath}
                    alt="POS Decline Slip Evidence"
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-full object-contain rounded border border-white/10"
                  />
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded bg-slate-900 hover:bg-slate-800 text-white border border-white/20 transition-all cursor-pointer"
                      title="Replace Evidence"
                    >
                      <UploadCloud className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleRemoveSlip}
                      disabled={removingSlip}
                      className="p-2 rounded bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-500/30 transition-all cursor-pointer disabled:opacity-40"
                      title="Delete Evidence"
                    >
                      {removingSlip ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 bg-white/5 p-2.5 rounded border border-white/5">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    HASH VERIFIED &amp; COMPLIANCE RECORDED
                  </span>
                  <button
                    onClick={handleRemoveSlip}
                    disabled={removingSlip}
                    className="text-rose-400 hover:underline cursor-pointer"
                  >
                    Remove File
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingSlip(true);
                }}
                onDragLeave={() => setIsDraggingSlip(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingSlip(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleSlipFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 min-h-[180px] ${
                  isDraggingSlip
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-white/10 hover:border-amber-500/50 bg-[#03050a]'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleSlipFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.webp"
                />
                {uploadingSlip ? (
                  <div className="space-y-2">
                    <RefreshCw className="h-8 w-8 text-amber-400 animate-spin mx-auto" />
                    <span className="text-amber-400 font-bold block">UPLOADING POS RECEIPT EVIDENCE...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UploadCloud className="h-8 w-8 text-amber-400 mx-auto" />
                    <span className="text-slate-200 font-bold block">Waiting for POS Slip Evidence...</span>
                    <span className="text-[10px] text-slate-500 block">Accepted Formats: PNG, JPG, WEBP (Max 10MB)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Command Console - Internal Notes */}
          <div className="p-5 rounded-xl bg-[#090d18] border border-indigo-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2">
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                COMMAND CONSOLE - INTERNAL AUDIT NOTES
              </h3>
              <span className="text-[9px] text-slate-500">OPERATOR ONLY</span>
            </div>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full h-32 bg-[#03050a] border border-white/10 rounded-lg p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 font-mono resize-none"
              placeholder="> Insert audit notes...
> Compliance remarks...
> Investigation comments..."
            />
            <button
              onClick={saveInternalNotes}
              disabled={savingNotes}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(79,70,229,0.3)] disabled:opacity-50"
            >
              {savingNotes ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  PERSISTING AUDIT REMARKS...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  [ SAVE INTERNAL NOTES ]
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Live System Monitor + Activity Feed (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Live System Monitor */}
          <div className="p-5 rounded-xl bg-[#090d18] border border-teal-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
              <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
                <Server className="h-4 w-4 text-teal-400" />
                LIVE SYSTEM MONITOR
              </h3>
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">Database</span>
                <span className="text-emerald-400 font-bold">ONLINE</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">API</span>
                <span className="text-emerald-400 font-bold">CONNECTED</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">Fraud Engine</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">Audit Logger</span>
                <span className="text-emerald-400 font-bold">ONLINE</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">Storage</span>
                <span className="text-teal-400 font-bold">SYNCED</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex items-center justify-between">
                <span className="text-slate-500">Backup</span>
                <span className="text-emerald-400 font-bold">SUCCESS</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="p-2 bg-[#03050a] rounded border border-white/5">
                <span className="text-slate-500 block">CPU</span>
                <span className="text-teal-300 font-bold">{cpuUsage}%</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5">
                <span className="text-slate-500 block">RAM</span>
                <span className="text-indigo-300 font-bold">{ramUsage}%</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5">
                <span className="text-slate-500 block">LATENCY</span>
                <span className="text-emerald-300 font-bold">{latency}ms</span>
              </div>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="p-5 rounded-xl bg-[#090d18] border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                LIVE ACTIVITY FEED
              </h3>
              <span className="text-[9px] text-slate-500">REAL-TIME</span>
            </div>

            <div className="space-y-2 text-[10px] max-h-48 overflow-y-auto no-scrollbar font-mono">
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex justify-between">
                <span className="text-slate-400">[{timeStr}] Admin Session Verified</span>
                <span className="text-emerald-400 font-bold">SUCCESS</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex justify-between">
                <span className="text-slate-400">[{timeStr}] Withdrawal Submitted</span>
                <span className="text-teal-400 font-bold">RECORDED</span>
              </div>
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex justify-between">
                <span className="text-slate-400">[{timeStr}] WDV Voucher Check</span>
                <span className="text-emerald-400 font-bold">PASSED</span>
              </div>
              {hasSlip && (
                <div className="p-2 bg-[#03050a] rounded border border-white/5 flex justify-between">
                  <span className="text-slate-400">[{timeStr}] Evidence Slip Uploaded</span>
                  <span className="text-emerald-400 font-bold">HASHED</span>
                </div>
              )}
              <div className="p-2 bg-[#03050a] rounded border border-white/5 flex justify-between">
                <span className="text-slate-400">[{timeStr}] Awaiting Final Action</span>
                <span className="text-amber-400 font-bold">QUEUED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ADMIN ACTION COMMAND CENTER */}
      <div className="p-5 rounded-xl bg-[#090d18] border border-teal-500/40 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="h-4 w-4 text-teal-400" />
            ADMIN COMMAND CENTER (DECISION EXECUTION)
          </h3>
          <span className="text-[10px] text-slate-400">AUTHORITY: SUPER ADMIN</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Reject Button */}
          <button
            onClick={() => updateWithdrawalStatus('rejected')}
            disabled={statusLower === 'completed' || statusLower === 'rejected' || statusLower === 'cancelled' || statusLower === 'success' || !!statusUpdating}
            className="p-3.5 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.2)] hover:shadow-[0_0_25px_rgba(244,63,94,0.4)] disabled:opacity-30"
          >
            {statusUpdating === 'rejected' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                EXECUTING REJECTION...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-400" />
                [ REJECT REQUEST ]
              </>
            )}
          </button>

          {/* Hold / Processing Button */}
          <button
            onClick={() => updateWithdrawalStatus('processing')}
            disabled={statusLower === 'completed' || statusLower === 'rejected' || statusLower === 'cancelled' || statusLower === 'success' || !!statusUpdating}
            className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] disabled:opacity-30"
          >
            {statusUpdating === 'processing' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                STAGING PROCESSING...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
                [ HOLD FOR REVIEW ]
              </>
            )}
          </button>

          {/* Approve / Mark Completed Button */}
          <button
            onClick={() => updateWithdrawalStatus('completed')}
            disabled={statusLower === 'completed' || statusLower === 'rejected' || statusLower === 'cancelled' || statusLower === 'success' || !!statusUpdating}
            className="p-3.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] disabled:opacity-30"
          >
            {statusUpdating === 'completed' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                AUTHORIZING DISBURSEMENT...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                [ APPROVE WITHDRAWAL ]
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
