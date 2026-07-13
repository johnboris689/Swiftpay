import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

const FIRST_NAMES = [
  "Abdul", "Abraham", "Musa", "Chinedu", "Fatima", 
  "Amina", "Ngozi", "Emeka", "Oluwaseun", "Chioma", 
  "Yusuf", "Adebayo", "Babajide", "Chinonso", 
  "Olamide", "Zainab", "Uche", "Abiodun", "Tunde"
];

const LAST_NAMES = [
  "Adamu", "Adebayo", "Ibrahim", "Alabi", "Okafor", 
  "Bello", "Okonkwo", "Balogun", "Eze", "Sani", 
  "Nwachukwu", "Igwe", "Soyinka", "Owolabi", "Danladi", 
  "Mustapha", "Adeyemi"
];

interface NotificationItem {
  id: string;
  name: string;
  amount: string;
}

export default function LiveTicker() {
  const [notification, setNotification] = useState<NotificationItem | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const generateRandomWithdrawal = (): NotificationItem => {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    
    // Amount must be between 100k and 200k inclusive (multiples of 5k or 10k look more natural)
    const amountVal = Math.floor(Math.random() * 21) * 5000 + 100000;
    const formattedAmount = `₦${amountVal.toLocaleString()}`;

    return {
      id: Math.random().toString(36).substring(2),
      name: `${firstName} ${lastName}`,
      amount: formattedAmount
    };
  };

  useEffect(() => {
    // Show first notification after a short initial delay of 3 seconds
    const initialTimer = setTimeout(() => {
      const newNotif = generateRandomWithdrawal();
      setNotification(newNotif);
      setIsVisible(true);

      // Hide after 4.5 seconds
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 4500);

      return () => clearTimeout(hideTimer);
    }, 3000);

    // Setup cyclic trigger with 20-40 seconds gap
    let nextTimer: NodeJS.Timeout;
    
    const triggerNextCycle = () => {
      // Random interval between 20 and 40 seconds
      const delay = Math.floor(Math.random() * (40 - 20 + 1) + 20) * 1000;
      
      nextTimer = setTimeout(() => {
        const newNotif = generateRandomWithdrawal();
        setNotification(newNotif);
        setIsVisible(true);

        // Hide after 4.5 seconds
        const hideTimer = setTimeout(() => {
          setIsVisible(false);
          triggerNextCycle(); // schedule next one after current one disappears
        }, 4500);

      }, delay);
    };

    // Start cycling scheduling
    // Since we triggered the first one manually at 3 seconds, let's schedule next one 20-40s after the first disappears
    const setupCycleTimer = setTimeout(() => {
      triggerNextCycle();
    }, 8000);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(setupCycleTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, []);

  return (
    <div className="fixed top-18 right-4 z-[9999] pointer-events-none max-w-sm w-[calc(100%-2rem)] md:top-20 md:right-6">
      <AnimatePresence mode="wait">
        {isVisible && notification && (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto bg-slate-900/95 dark:bg-slate-950/98 border border-slate-800 dark:border-teal-500/30 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl flex items-center gap-3.5"
          >
            {/* Live Indicator Pulse */}
            <div className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-wider text-teal-400 uppercase">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Live Withdrawal Feed
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-normal">
                <span className="font-extrabold text-white">{notification.name}</span> just withdrew <span className="font-bold text-teal-300">{notification.amount}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
