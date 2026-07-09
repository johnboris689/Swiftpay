import React from 'react';
import { X, Ticket, Smartphone, Landmark, MessageSquare } from 'lucide-react';

interface QuickFabMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: string) => void;
}

export default function QuickFabMenu({ isOpen, onClose, onSelectAction }: QuickFabMenuProps) {
  if (!isOpen) return null;

  const actions = [
    {
      id: 'buy-bpc',
      title: 'Buy BPC Voucher',
      desc: 'Generate a Bill Payment Code code via manual bank transfer',
      icon: Ticket,
      color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      textColor: 'text-indigo-600 dark:text-indigo-400'
    },
    {
      id: 'buy-airtime',
      title: 'Purchase Airtime',
      desc: 'Use wallet balance or redeem a previously purchased BPC code',
      icon: Smartphone,
      color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      textColor: 'text-violet-600 dark:text-violet-400'
    },
    {
      id: 'buy-data',
      title: 'Purchase Data Bundles',
      desc: 'Discounted dynamic data bundles for all network operators',
      icon: Smartphone,
      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      textColor: 'text-orange-600 dark:text-orange-400'
    },
    {
      id: 'transfer-bank',
      title: 'Transfer to Bank',
      desc: 'Send money to a 10-digit Nigerian bank account using BPC or balance',
      icon: Landmark,
      color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      textColor: 'text-teal-600 dark:text-teal-400'
    },
    {
      id: 'social-channels',
      title: 'Join Community',
      desc: 'Connect on Telegram and WhatsApp for tips, rewards, and support',
      icon: MessageSquare,
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    }
  ];

  return (
    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex flex-col justify-end">
      {/* Tap outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet Content */}
      <div className="relative bg-white/95 dark:bg-slate-900/95 border-t border-white/10 dark:border-slate-800 rounded-t-3xl p-6 shadow-2xl max-w-md mx-auto w-full z-10 transition-transform duration-300">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold font-display text-slate-800 dark:text-white">Quick Actions</h3>
            <p className="text-xs text-slate-400">Select any payment flow or community hub</p>
          </div>
          <button
            id="btn-close-fab-menu"
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3.5 mb-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                id={`btn-fab-action-${action.id}`}
                key={action.id}
                type="button"
                onClick={() => {
                  onSelectAction(action.id);
                  onClose();
                }}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-indigo-500/30 dark:border-slate-800 dark:hover:border-teal-500/20 bg-white/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950/70 transition-all text-left group"
              >
                <div className={`p-3 rounded-lg border ${action.color} group-hover:scale-105 transition-all`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className={`text-sm font-semibold ${action.textColor}`}>{action.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{action.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
