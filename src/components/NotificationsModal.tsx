import React from 'react';
import { X, Bell, CheckCheck, Inbox } from 'lucide-react';
import { NotificationItem } from '../types';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}

export default function NotificationsModal({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onMarkRead
}: NotificationsModalProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex flex-col justify-end">
      {/* Tap outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet Content */}
      <div className="relative bg-white dark:bg-slate-900 border-t border-white/10 dark:border-slate-800 rounded-t-3xl p-6 shadow-2xl max-w-md mx-auto w-full z-10 transition-transform duration-300 max-h-[85%] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-slate-800 dark:text-white">Notifications</h3>
              <p className="text-xs text-slate-400">
                {unreadCount > 0 ? `You have ${unreadCount} unread alert(s)` : 'No new announcements'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                id="btn-mark-all-read"
                type="button"
                onClick={onMarkAllRead}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Mark all read</span>
              </button>
            )}
            <button
              id="btn-close-notif-modal"
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto no-scrollbar flex-1 space-y-3 pr-1 py-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center">
              <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-medium">Your inbox is clear</p>
              <p className="text-xs mt-1">We will notify you here when major events occur.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                id={`notif-item-${notif.id}`}
                key={notif.id}
                onClick={() => onMarkRead(notif.id)}
                className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                  notif.unread
                    ? 'bg-gradient-to-tr from-indigo-50/50 to-purple-50/30 border-indigo-100 dark:from-slate-800/40 dark:to-slate-800/20 dark:border-indigo-950/40'
                    : 'bg-white/50 border-slate-100 dark:bg-slate-950/10 dark:border-slate-800/40 opacity-75'
                }`}
              >
                {/* Unread circle */}
                {notif.unread && (
                  <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-teal-400 animate-pulse" />
                )}
                
                <h4 className={`text-sm font-semibold ${notif.unread ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                  {notif.title}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {notif.body}
                </p>
                <span className="text-[10px] text-slate-400 font-mono block mt-2.5">
                  {new Date(notif.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.date).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
