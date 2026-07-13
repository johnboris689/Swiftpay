import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

const FIRST_NAMES = [
  "Abdul", "Abraham", "Ibrahim", "Chinedu", "Fatima", 
  "Amina", "Ngozi", "Emeka", "Oluwaseun", "Chioma", 
  "Musa", "Yusuf", "Adebayo", "Babajide", "Chinonso", 
  "Olamide", "Zainab", "Uche", "Abiodun", "Tunde"
];

const LAST_NAMES = [
  "Adamu", "Adebayo", "Musa", "Okafor", "Bello", 
  "Okonkwo", "Balogun", "Eze", "Sani", "Alabi", 
  "Nwachukwu", "Igwe", "Soyinka", "Owolabi", "Danladi", 
  "Mustapha", "Adeyemi"
];

const TRANSACTIONS = [
  { type: 'withdrew', suffix: '' },
  { type: 'purchased', suffix: 'airtime' },
  { type: 'transferred', suffix: '' },
  { type: 'purchased', suffix: 'data' }
];

interface NotificationItem {
  id: string;
  name: string;
  actionText: string;
  amount: string;
}

export default function LiveTicker() {
  const [notification, setNotification] = useState<NotificationItem | null>(null);

  const generateRandomNotification = (): NotificationItem => {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const tx = TRANSACTIONS[Math.floor(Math.random() * TRANSACTIONS.length)];
    
    // Amount must be between 100k and 200k inclusive
    const amountVal = Math.floor(Math.random() * 101) * 1000 + 100000;
    const formattedAmount = `₦${amountVal.toLocaleString()}`;

    let actionText = '';
    if (tx.type === 'transferred') {
      actionText = `transferred ${formattedAmount}`;
    } else if (tx.type === 'purchased') {
      actionText = `purchased ${formattedAmount} ${tx.suffix}`;
    } else {
      actionText = `withdrew ${formattedAmount}`;
    }

    return {
      id: Math.random().toString(36).substring(2),
      name: `${firstName} ${lastName}`,
      actionText,
      amount: formattedAmount
    };
  };

  useEffect(() => {
    // Generate initial notification on load
    setNotification(generateRandomNotification());

    // Cycle every 5 seconds
    const interval = setInterval(() => {
      setNotification(generateRandomNotification());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none max-w-sm w-[calc(100%-2rem)]">
      <AnimatePresence mode="wait">
        {notification && (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto bg-slate-900/90 dark:bg-slate-950/95 border border-slate-800 dark:border-teal-500/30 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl flex items-center gap-3.5"
          >
            {/* Live Indicator Pulse */}
            <div className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-wider text-teal-400 uppercase">
                <Sparkles className="h-3 w-3" />
                Live SwiftPay Feed
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-normal">
                <span className="font-extrabold text-white">{notification.name}</span> just {notification.actionText}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
