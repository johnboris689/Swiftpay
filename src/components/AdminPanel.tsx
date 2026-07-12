import React, { useState } from 'react';
import { Users, Coins, ShoppingBag, ShieldAlert, ArrowLeft, Search, UserMinus, ToggleLeft, ToggleRight, Trash2, Edit2, Key, RefreshCw, Send, FileSpreadsheet, BarChart3, Database, MessageSquare, AlertCircle } from 'lucide-react';
import GlassCard from './GlassCard';

interface AdminPanelProps {
  currentUserEmail: string;
  transactions: any[];
  onBack: () => void;
  onToast: (msg: string, type: 'success' | 'info' | 'error') => void;
  onAddGlobalNotification: (title: string, body: string, type: string) => void;
  onSendSimulatedEmail: (to: string, subject: string, body: string) => void;
}

export default function AdminPanel({
  currentUserEmail,
  transactions,
  onBack,
  onToast,
  onAddGlobalNotification,
  onSendSimulatedEmail
}: AdminPanelProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  
  // Balance modification state
  const [editBalanceAmount, setEditBalanceAmount] = useState('');
  const [editUserFullName, setEditUserFullName] = useState('');
  
  // Broadcast announcement state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastType, setBroadcastType] = useState('system');
  const [sendAsEmail, setSendAsEmail] = useState(true);

  // BPC Payment Config fields
  const [bpcBankName, setBpcBankName] = useState('PalmPay');
  const [bpcAccountNumber, setBpcAccountNumber] = useState('8960723295');
  const [bpcAccountName, setBpcAccountName] = useState('pwamunadi ishaku');
  const [bpcWhatsappLink, setBpcWhatsappLink] = useState('https://wa.me/2349162845073');
  const [bpcVoucherPrice, setBpcVoucherPrice] = useState('6500');
  const [bpcInstructions, setBpcInstructions] = useState('');
  const [bpcMaintenanceNotice, setBpcMaintenanceNotice] = useState('');
  const [savingBpcConfig, setSavingBpcConfig] = useState(false);

  // Diagnostic Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const getAdminHeaders = (extraHeaders = {}) => {
    const token = localStorage.getItem('swiftpay_admin_token') || '';
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };
  };

  // Fetch users from server on mount
  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: getAdminHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        onToast('Failed to fetch user database', 'error');
      }
    } catch (err) {
      onToast('Network error loading admin panel', 'error');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/logs', {
        headers: getAdminHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs/clear', { 
        method: 'POST',
        headers: getAdminHeaders()
      });
      if (res.ok) {
        setLogs([]);
        onToast('Diagnostic logs cleared successfully', 'success');
      }
    } catch (err) {
      onToast('Failed to clear logs', 'error');
    }
  };

  const fetchBpcConfig = async () => {
    try {
      const res = await fetch('/api/config/bpc');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setBpcBankName(data.config.bankName);
          setBpcAccountNumber(data.config.accountNumber);
          setBpcAccountName(data.config.accountName);
          setBpcWhatsappLink(data.config.whatsappLink);
          setBpcVoucherPrice(String(data.config.voucherPrice));
          setBpcInstructions(data.config.instructions);
          setBpcMaintenanceNotice(data.config.maintenanceNotice);
        }
      }
    } catch (err) {
      console.error('Error fetching BPC config:', err);
    }
  };

  const handleSaveBpcConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBpcConfig(true);
    try {
      const res = await fetch('/api/admin/config/bpc', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          bankName: bpcBankName,
          accountNumber: bpcAccountNumber,
          accountName: bpcAccountName,
          whatsappLink: bpcWhatsappLink,
          voucherPrice: Number(bpcVoucherPrice),
          instructions: bpcInstructions,
          maintenanceNotice: bpcMaintenanceNotice
        })
      });
      if (res.ok) {
        onToast('BPC configuration saved and updated live!', 'success');
        fetchBpcConfig();
      } else {
        onToast('Failed to save BPC configuration', 'error');
      }
    } catch (err) {
      onToast('Network error saving configuration', 'error');
    } finally {
      setSavingBpcConfig(false);
    }
  };

  React.useEffect(() => {
    fetchAllUsers();
    fetchLogs();
    fetchBpcConfig();
  }, []);

  // Filter users
  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate admin statistics
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter(u => !u.isSuspended).length;
  const suspendedUsersCount = users.filter(u => u.isSuspended).length;
  const frozenUsersCount = users.filter(u => u.isFrozen).length;
  const totalSystemBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  
  const totalTxsCount = transactions.length;
  const airtimeTxs = transactions.filter(t => t.type === 'redeem_airtime');
  const transferTxs = transactions.filter(t => t.type === 'bank_transfer_direct' || t.type === 'withdraw');
  const bpcTxs = transactions.filter(t => t.type === 'buy_bpc');
  
  const totalRevenue = transactions
    .filter(t => t.status === 'success')
    .reduce((sum, t) => {
      // Revenue from network charges or buy fees
      if (t.type === 'bank_transfer_direct' || t.type === 'withdraw') {
        return sum + 10; // ₦10 charge per transfer
      }
      return sum;
    }, 0);

  // User database modifiers
  const handleUpdateUserStatus = async (email: string, field: 'isSuspended' | 'isFrozen', val: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/update-status`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ email, field, value: val })
      });
      if (res.ok) {
        onToast(`User status updated successfully`, 'success');
        fetchAllUsers();
        if (selectedUser && selectedUser.email === email) {
          setSelectedUser({ ...selectedUser, [field]: val });
        }
        // Send email alert to user (simulated)
        onSendSimulatedEmail(
          email,
          'Security Update: Account Status Modified',
          `Hello, \n\nAn administrator has updated your SwiftPay security status.\nParameter: ${field}\nNew Value: ${val ? 'TRUE (Active constraint applied)' : 'FALSE (Restored to default)'}\n\nIf you believe this was an error, contact premium support.`
        );
      } else {
        onToast('Failed to update user parameters', 'error');
      }
    } catch (e) {
      onToast('Error updating status', 'error');
    }
  };

  const handleEditWalletBalance = async (email: string) => {
    const amt = parseFloat(editBalanceAmount);
    if (isNaN(amt)) {
      onToast('Enter a valid numerical amount', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/edit-balance`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ email, balance: amt })
      });
      if (res.ok) {
        onToast(`Wallet balance successfully adjusted!`, 'success');
        setEditBalanceAmount('');
        fetchAllUsers();
        if (selectedUser && selectedUser.email === email) {
          setSelectedUser({ ...selectedUser, balance: amt });
        }
        // Send email notification
        onSendSimulatedEmail(
          email,
          'Wallet Credit/Debit Transaction Authorized',
          `Hello, \n\nYour SwiftPay wallet has been adjusted by an administrator.\nNew Wallet Balance: ₦${amt.toLocaleString()}\n\nThank you for choosing SwiftPay!`
        );
      } else {
        onToast('Failed to edit balance', 'error');
      }
    } catch (e) {
      onToast('Error updating balance', 'error');
    }
  };

  const handleAdminResetPassword = async (email: string) => {
    try {
      const res = await fetch(`/api/admin/users/reset-password`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        onToast('Temporary password "SwiftPayAdmin99!" dispatched to user email', 'success');
        onSendSimulatedEmail(
          email,
          'SwiftPay: Account Credentials Reset by Admin',
          `Hello, \n\nAn administrator has reset your password.\nYour temporary password is: SwiftPayAdmin99!\n\nPlease log in immediately and update your security settings.`
        );
      } else {
        onToast('Failed to reset password', 'error');
      }
    } catch (e) {
      onToast('Error resetting password', 'error');
    }
  };

  const handleAdminDeleteAccount = async (email: string) => {
    if (email.toLowerCase() === currentUserEmail.toLowerCase()) {
      onToast('You cannot delete your own admin account!', 'error');
      return;
    }
    if (!window.confirm(`Are you absolutely sure you want to permanently delete account ${email}? This action is IRREVERSIBLE.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/delete`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        onToast('User account successfully deleted', 'success');
        setSelectedUser(null);
        fetchAllUsers();
      } else {
        onToast('Failed to delete account', 'error');
      }
    } catch (e) {
      onToast('Error deleting user', 'error');
    }
  };

  const handleBroadcastAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastBody) {
      onToast('Title and Body are required to broadcast', 'error');
      return;
    }

    // Add notification globally
    onAddGlobalNotification(broadcastTitle, broadcastBody, broadcastType);
    onToast('System announcement broadcast completed!', 'success');

    // Send emails if checked
    if (sendAsEmail) {
      users.forEach(u => {
        onSendSimulatedEmail(
          u.email,
          `SwiftPay Announcement: ${broadcastTitle}`,
          `Greetings, \n\nWe have published a new announcement on SwiftPay: \n\n${broadcastBody}\n\nTransact securely on SwiftPay!`
        );
      });
      onToast(`Announcement emails sent to ${users.length} active users!`, 'success');
    }

    setBroadcastTitle('');
    setBroadcastBody('');
  };

  const handleExportUsersCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Full Name,Email,Balance,dailyTarget,dailySpent,Pin Setup,Biometrics,Suspended,Frozen\n";
    users.forEach(u => {
      csvContent += `"${u.fullName}","${u.email}",${u.balance},${u.dailyTarget},${u.dailySpent},${u.pinCreated ? 'Yes':'No'},${u.biometricEnabled ? 'Yes':'No'},${u.isSuspended ? 'Yes':'No'},${u.isFrozen ? 'Yes':'No'}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "SwiftPay_Users_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('Users database exported as CSV!', 'success');
  };

  const handleExportTransactionsCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Transaction ID,Type,Amount,Date,Status,Description,BPC Used,BPC Generated,Charges\n";
    transactions.forEach(t => {
      csvContent += `"${t.id}","${t.type}",${t.amount},"${t.date}","${t.status}","${t.description}","${t.bpcCodeUsed || ''}","${t.bpcCodeGenerated || ''}",${t.charges || 10}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "SwiftPay_Transactions_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('Transactions database exported as CSV!', 'success');
  };

  return (
    <div className="p-5 space-y-6 h-full overflow-y-auto no-scrollbar animate-[fadeIn_0.2s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-base font-black font-display text-slate-800 dark:text-white">Admin Central Console</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Fintech Management &amp; System Auditing</p>
          </div>
        </div>
        <button
          onClick={fetchAllUsers}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-teal-400 border border-white/10"
          title="Refresh statistics"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Overview Statistics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlassCard className="p-3 bg-[#1e1b4b]/10 border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[8px] font-mono text-slate-400 block uppercase">Total Users</span>
            <span className="text-sm font-bold text-white font-mono">{totalUsersCount}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-3 bg-[#1e1b4b]/10 border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Coins className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[8px] font-mono text-slate-400 block uppercase">Total Ledger</span>
            <span className="text-xs font-bold text-white font-mono">₦{(totalSystemBalance/1000).toFixed(0)}k</span>
          </div>
        </GlassCard>

        <GlassCard className="p-3 bg-[#1e1b4b]/10 border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[8px] font-mono text-slate-400 block uppercase">Charges Rev</span>
            <span className="text-xs font-bold text-white font-mono">₦{totalRevenue.toLocaleString()}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-3 bg-[#1e1b4b]/10 border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[8px] font-mono text-slate-400 block uppercase">Transactions</span>
            <span className="text-sm font-bold text-white font-mono">{totalTxsCount}</span>
          </div>
        </GlassCard>
      </div>

      {/* Analytics Charts (Custom responsive SVG bar chart & line chart) */}
      <GlassCard className="p-4 border-white/5 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-teal-400" />
            Fintech Transaction Volume &amp; Daily Statistics
          </h5>
          <span className="text-[8px] font-mono text-slate-500">Real-Time Data</span>
        </div>

        {/* Custom SVG Bar Chart */}
        <div className="space-y-3">
          <span className="text-[9px] font-mono text-slate-400 block">Transaction Categories (By Volume)</span>
          <div className="h-28 flex items-end justify-between px-6 pt-4 relative bg-slate-950/30 rounded-xl border border-white/5">
            {/* Grid background lines */}
            <div className="absolute inset-x-0 top-1/4 border-t border-white/[0.03] pointer-events-none" />
            <div className="absolute inset-x-0 top-2/4 border-t border-white/[0.03] pointer-events-none" />
            <div className="absolute inset-x-0 top-3/4 border-t border-white/[0.03] pointer-events-none" />

            {/* Direct Bank Transfers */}
            <div className="flex flex-col items-center gap-1 w-1/4 group cursor-pointer z-10">
              <span className="text-[8px] font-mono text-slate-300 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 px-1 py-0.5 rounded -mt-6 absolute">{transferTxs.length} txs</span>
              <div
                style={{ height: `${Math.max(15, Math.min(80, (transferTxs.length / (totalTxsCount || 1)) * 100))}%` }}
                className="w-10 bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md hover:from-indigo-500 hover:to-indigo-300 transition-all duration-300"
              />
              <span className="text-[8px] text-slate-400 font-mono">Transfers</span>
            </div>

            {/* BPC Generation Purchases */}
            <div className="flex flex-col items-center gap-1 w-1/4 group cursor-pointer z-10">
              <span className="text-[8px] font-mono text-slate-300 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 px-1 py-0.5 rounded -mt-6 absolute">{bpcTxs.length} txs</span>
              <div
                style={{ height: `${Math.max(15, Math.min(80, (bpcTxs.length / (totalTxsCount || 1)) * 100))}%` }}
                className="w-10 bg-gradient-to-t from-teal-500 to-teal-300 rounded-t-md hover:from-teal-400 hover:to-teal-200 transition-all duration-300"
              />
              <span className="text-[8px] text-slate-400 font-mono">BPC Codes</span>
            </div>

            {/* Airtime Redeem logs */}
            <div className="flex flex-col items-center gap-1 w-1/4 group cursor-pointer z-10">
              <span className="text-[8px] font-mono text-slate-300 font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 px-1 py-0.5 rounded -mt-6 absolute">{airtimeTxs.length} txs</span>
              <div
                style={{ height: `${Math.max(15, Math.min(80, (airtimeTxs.length / (totalTxsCount || 1)) * 100))}%` }}
                className="w-10 bg-gradient-to-t from-purple-500 to-purple-300 rounded-t-md hover:from-purple-400 hover:to-purple-200 transition-all duration-300"
              />
              <span className="text-[8px] text-slate-400 font-mono">Airtime/Data</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Reports Export Section */}
      <GlassCard className="p-4 border-white/5 space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4" />
          Fintech Audits &amp; Database Reports
        </h5>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleExportUsersCSV}
            className="p-3 bg-white/5 border border-white/5 hover:border-teal-500/20 hover:bg-teal-500/10 text-teal-400 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 text-center"
          >
            <Database className="h-4 w-4 mb-1 text-teal-400" />
            Export Users CSV
          </button>
          <button
            onClick={handleExportTransactionsCSV}
            className="p-3 bg-white/5 border border-white/5 hover:border-indigo-500/20 hover:bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 text-center"
          >
            <FileSpreadsheet className="h-4 w-4 mb-1 text-indigo-400" />
            Export Ledger CSV
          </button>
        </div>
      </GlassCard>

      {/* User Management Section */}
      <GlassCard className="p-4 border-white/5 space-y-4">
        <div className="flex flex-col gap-2">
          <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400">User Database Management</h5>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search user by name or email address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-slate-950/40 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {loadingUsers ? (
            <div className="text-center py-6 text-slate-400 text-xs font-mono">Loading user database...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">No users found.</div>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u.email}
                onClick={() => {
                  setSelectedUser(u);
                  setEditBalanceAmount((u.balance || 0).toString());
                  setEditUserFullName(u.fullName);
                }}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  selectedUser?.email === u.email
                    ? 'bg-teal-500/10 border-teal-500/30'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{u.fullName}</span>
                    {u.isSuspended && (
                      <span className="text-[7px] font-black uppercase bg-red-500 text-white px-1 py-0.5 rounded">
                        Suspended
                      </span>
                    )}
                    {u.isFrozen && (
                      <span className="text-[7px] font-black uppercase bg-indigo-500 text-white px-1 py-0.5 rounded">
                        Frozen
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 block">{u.email}</span>
                </div>
                
                <div className="text-right font-mono text-xs font-bold text-teal-400">
                  ₦{(u.balance || 0).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected User Actions Panel */}
        {selectedUser && (
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/10 space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <div>
                <span className="text-[8px] font-mono text-slate-500 uppercase">Selected Profile</span>
                <h6 className="text-xs font-bold text-white">{selectedUser.fullName}</h6>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-[9px] font-bold text-red-400 hover:underline cursor-pointer"
              >
                Clear Selection
              </button>
            </div>

            {/* Profile fields updating name */}
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-3">
                {/* Balance Editor */}
                <div className="flex-1">
                  <label className="text-[9px] font-mono text-slate-400 block mb-1">Adjust Wallet Balance (₦)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={editBalanceAmount}
                      onChange={(e) => setEditBalanceAmount(e.target.value)}
                      className="flex-1 text-xs bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                    <button
                      onClick={() => handleEditWalletBalance(selectedUser.email)}
                      className="px-3 bg-teal-500 hover:bg-teal-600 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>

              {/* Toggle Suspension or Freeze */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleUpdateUserStatus(selectedUser.email, 'isSuspended', !selectedUser.isSuspended)}
                  className={`py-2 px-3 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedUser.isSuspended
                      ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {selectedUser.isSuspended ? 'Suspended (Revoke)' : 'Suspend Account'}
                </button>

                <button
                  onClick={() => handleUpdateUserStatus(selectedUser.email, 'isFrozen', !selectedUser.isFrozen)}
                  className={`py-2 px-3 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedUser.isFrozen
                      ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20'
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {selectedUser.isFrozen ? 'Frozen (Unfreeze)' : 'Freeze Ledger'}
                </button>
              </div>

              {/* Reset Password & Delete */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 my-1">
                <button
                  onClick={() => handleAdminResetPassword(selectedUser.email)}
                  className="py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/10 text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Key className="h-3.5 w-3.5" /> Reset Pass
                </button>

                <button
                  onClick={() => handleAdminDeleteAccount(selectedUser.email)}
                  className="py-2 px-3 bg-red-500/15 hover:bg-red-500/25 border border-red-500/10 text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete User
                </button>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Broadcast System Announcements Form */}
      <GlassCard className="p-4 border-white/5 space-y-4">
        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Global Announcement Broadcaster
          </h5>
          <p className="text-[10px] text-slate-400 mt-0.5">Publish alerts to user notifications and push simulated emails</p>
        </div>

        <form onSubmit={handleBroadcastAnnouncement} className="space-y-3">
          <div>
            <label className="text-[9px] font-mono text-slate-400 block mb-1">Alert Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Scheduled Core Maintenance Completed"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-400 block mb-1">Alert Body</label>
            <textarea
              required
              rows={2}
              placeholder="Provide a detailed security alert or marketing description here..."
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 resize-none font-mono"
            />
          </div>

          <div className="flex justify-between items-center bg-slate-950/30 p-2 rounded-xl border border-white/5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="send_sim_email_box"
                checked={sendAsEmail}
                onChange={(e) => setSendAsEmail(e.target.checked)}
                className="rounded border-white/10 text-teal-500 focus:ring-0"
              />
              <label htmlFor="send_sim_email_box" className="text-[9px] font-mono text-slate-400 select-none cursor-pointer">
                Send as simulated Email alerts
              </label>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <Send className="h-3 w-3" /> Broadcast
            </button>
          </div>
        </form>
      </GlassCard>

      {/* BPC Payment & System Configurations */}
      <GlassCard className="p-4 border-white/5 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/5">
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <ShoppingBag className="h-4 w-4 text-teal-400" />
              BPC Payment details &amp; Pricing Config
            </h5>
            <p className="text-[10px] text-slate-400 mt-0.5">Control system bank transfer details, warning notices, and voucher pricing dynamically</p>
          </div>
        </div>

        <form onSubmit={handleSaveBpcConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-1">Payment Bank Name</label>
              <input
                type="text"
                required
                value={bpcBankName}
                onChange={(e) => setBpcBankName(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>

            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-1">Payment Account Number</label>
              <input
                type="text"
                required
                value={bpcAccountNumber}
                onChange={(e) => setBpcAccountNumber(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>

            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-1">Payment Account Name</label>
              <input
                type="text"
                required
                value={bpcAccountName}
                onChange={(e) => setBpcAccountName(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>

            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-1">Support WhatsApp URL Link</label>
              <input
                type="url"
                required
                value={bpcWhatsappLink}
                onChange={(e) => setBpcWhatsappLink(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-400 block mb-1">Strict Locked Voucher Price (₦)</label>
            <input
              type="number"
              required
              value={bpcVoucherPrice}
              onChange={(e) => setBpcVoucherPrice(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 font-mono"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-400 block mb-1">Transfer Instructions Text</label>
            <textarea
              required
              rows={3}
              value={bpcInstructions}
              onChange={(e) => setBpcInstructions(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 resize-none font-sans"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-slate-400 block mb-1">System Warning / Bank Maintenance Notice (Leave blank to hide)</label>
            <textarea
              rows={2}
              value={bpcMaintenanceNotice}
              onChange={(e) => setBpcMaintenanceNotice(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400 resize-none font-sans"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingBpcConfig}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 disabled:opacity-50 text-slate-950 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              {savingBpcConfig ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </GlassCard>

      {/* System Diagnostics logs auditing */}
      <GlassCard className="p-4 border-white/5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-teal-400" />
              System Diagnostics &amp; Audit Logs
            </h5>
            <p className="text-[10px] text-slate-400 mt-0.5">Real-time server exception logging &amp; threat detection</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLogs}
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-[9px] font-mono border border-white/10"
            >
              Refresh
            </button>
            <button
              onClick={handleClearLogs}
              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[9px] font-mono border border-red-500/20"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[250px] overflow-y-auto no-scrollbar font-mono text-[9px]">
          {loadingLogs ? (
            <div className="text-center py-6 text-slate-400 font-mono">Fetching diagnostics from core...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-6 text-slate-400 font-mono text-[10px]">No diagnostics generated yet. System healthy.</div>
          ) : (
            logs.map((l: any) => {
              let tagColor = 'bg-slate-500/20 text-slate-400';
              if (l.type === 'API_ERROR' || l.type === 'FAILED_TX') tagColor = 'bg-red-500/15 text-red-400 border border-red-500/30';
              if (l.type === 'SECURITY_ALERT' || l.type === 'FAILED_LOGIN') tagColor = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
              if (l.type === 'INFO') tagColor = 'bg-teal-500/15 text-teal-400 border border-teal-500/30';

              return (
                <div key={l.id} className="p-2 bg-slate-950/40 rounded-lg border border-white/[0.03] flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${tagColor}`}>{l.type}</span>
                    <span className="text-slate-500 text-[8px]">{new Date(l.timestamp).toLocaleTimeString()} - {new Date(l.timestamp).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-300 break-words leading-relaxed">{l.message}</p>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </div>
  );
}
