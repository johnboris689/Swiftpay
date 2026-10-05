import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Zap,
  Globe,
  Check,
  XCircle,
  Clock,
  Lock
} from 'lucide-react';
import GlassCard from './GlassCard';

interface ProviderStatus {
  name: 'korapay';
  displayName: string;
  isConfigured: boolean;
  missingEnvVars: string[];
  publicKey?: string;
}

interface PaymentTransactionRecord {
  id: string;
  reference: string;
  useremail?: string;
  userEmail?: string;
  amount: number;
  currency: string;
  provider: string;
  purpose: string;
  status: string;
  channel?: string;
  providerreference?: string;
  providerReference?: string;
  createdat?: string;
  createdAt?: string;
  verifiedat?: string;
  verifiedAt?: string;
}

interface PaymentAdminTabProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const PaymentAdminTab: React.FC<PaymentAdminTabProps> = ({ onToast }) => {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('korapay');
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingRef, setVerifyingRef] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getAdminToken = () => localStorage.getItem('swiftpay_admin_token') || '';

  const fetchPaymentAdminData = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const [configRes, txRes] = await Promise.all([
        fetch('/api/payment/config', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/payment/transactions', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const configData = await configRes.json();
      if (configData.success) {
        setProviders(configData.providers || []);
        setActiveProvider('korapay');
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.success) {
          setTransactions(txData.transactions || []);
        }
      }
    } catch (err) {
      console.error('Error loading payment admin data:', err);
      onToast('Failed to load payment gateway settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentAdminData();
  }, []);

  const handleManualReverify = async (reference: string) => {
    setVerifyingRef(reference);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reference })
      });
      const data = await res.json();
      if (data.success && data.status === 'successful') {
        onToast(`Transaction ${reference} verified & confirmed!`, 'success');
      } else {
        onToast(data.message || `Status: ${data.status || 'pending'}`, 'info');
      }
      await fetchPaymentAdminData();
    } catch (err) {
      onToast('Verification check failed', 'error');
    } finally {
      setVerifyingRef(null);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const email = (tx.userEmail || tx.useremail || '').toLowerCase();
    const ref = (tx.reference || '').toLowerCase();
    const prov = (tx.provider || 'korapay').toLowerCase();
    const matchesSearch =
      !searchQuery ||
      email.includes(searchQuery.toLowerCase()) ||
      ref.includes(searchQuery.toLowerCase()) ||
      prov.includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = transactions
    .filter((t) => t.status === 'successful')
    .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  const korapayProvider = providers[0] || {
    name: 'korapay',
    displayName: 'Korapay',
    isConfigured: false,
    missingEnvVars: ['KORAPAY_SECRET_KEY']
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <GlassCard className="p-6 border-teal-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Globe className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-white font-display">
                Korapay Payment Gateway Architecture
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Manage Korapay checkout integration, inspect webhook readiness, and audit live WDV voucher &amp; wallet transactions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-right">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Verified Gateway Volume</span>
              <span className="text-base font-mono font-black text-emerald-400">
                ₦{totalRevenue.toLocaleString()}
              </span>
            </div>
            <button
              onClick={fetchPaymentAdminData}
              disabled={loading}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
              title="Refresh Gateway Status"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Korapay Gateway Card */}
      <div className="grid grid-cols-1 gap-4">
        <GlassCard className="p-5 flex flex-col justify-between border transition-all border-teal-500/50 bg-teal-950/10 shadow-[0_0_25px_rgba(20,184,166,0.08)]">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl border bg-teal-500/20 text-teal-300 border-teal-500/30">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                    {korapayProvider.displayName}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      ACTIVE GATEWAY
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Provider ID: {activeProvider}
                  </span>
                </div>
              </div>

              {korapayProvider.isConfigured ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Keys Missing
                </span>
              )}
            </div>

            {/* Environment Variables Audit */}
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>ENVIRONMENT CREDENTIALS</span>
                <Lock className="h-3 w-3 text-slate-500" />
              </div>

              {korapayProvider.isConfigured ? (
                <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                  <Check className="h-3.5 w-3.5" />
                  <span>Secret Key Loaded in Server Memory</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-[11px] text-amber-400 block">
                    Missing in <code className="text-white">.env</code>:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {korapayProvider.missingEnvVars.map((envVar) => (
                      <span
                        key={envVar}
                        className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[10px]"
                      >
                        {envVar}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Webhook Endpoint:</span>
                <code className="text-teal-400">/api/payment/webhook/korapay</code>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Payment Transactions Ledger */}
      <GlassCard className="p-6 border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-teal-400" />
              <span>Gateway Transaction Ledger</span>
            </h3>
            <p className="text-xs text-slate-400">
              Real-time record of initialized, pending, and server-verified Korapay payments
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reference or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-400"
            >
              <option value="all">All Status</option>
              <option value="successful">Successful</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-3 px-3">Reference</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Provider</th>
                <th className="py-3 px-3">Purpose</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    No Korapay transactions matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const status = (tx.status || 'pending').toLowerCase();
                  const email = tx.userEmail || tx.useremail || 'Unknown';
                  const created = tx.createdAt || tx.createdat || '';

                  return (
                    <tr key={tx.reference} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-teal-400">
                        {tx.reference}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{email}</td>
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        ₦{Number(tx.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] uppercase">
                          korapay
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {tx.purpose === 'wdv_voucher' ? 'WDV Voucher' : 'Wallet Funding'}
                      </td>
                      <td className="py-3 px-3">
                        {status === 'successful' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Successful
                          </span>
                        ) : status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-400 font-mono">
                        {created ? new Date(created).toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {status !== 'successful' && (
                          <button
                            onClick={() => handleManualReverify(tx.reference)}
                            disabled={verifyingRef === tx.reference}
                            className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/20 text-[10px] font-mono font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <RefreshCw className={`h-3 w-3 ${verifyingRef === tx.reference ? 'animate-spin' : ''}`} />
                            <span>Verify</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};
