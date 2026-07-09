import React from 'react';
import { Wallet, Users, Plus, Smartphone, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onFabClick: () => void;
}

export default function BottomNav({ activeTab, onTabChange, onFabClick }: BottomNavProps) {
  const tabs = [
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'social', label: 'Social', icon: Users },
    { id: 'placeholder', label: '', icon: null, isFabSpace: true }, // Spacer for center FAB
    { id: 'data', label: 'Data', icon: Smartphone },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="relative">
      {/* Center FAB */}
      <div className="absolute left-1/2 -top-6 -translate-x-1/2 z-30">
        <button
          id="btn-center-fab"
          type="button"
          onClick={onFabClick}
          aria-label="Open Quick Actions Menu"
          className="h-14 w-14 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#14b8a6] hover:from-[#5152df] hover:to-[#0f9f8e] text-white shadow-lg shadow-teal-500/20 flex items-center justify-center transition-all duration-300 active:scale-95 border-4 border-[#0c0c14]"
        >
          <Plus className="h-7 w-7 stroke-[2.5]" />
        </button>
      </div>

      {/* Floating Bottom Nav Container */}
      <div className="w-full h-18 bg-[#0c0c14]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-4 pb-2 pt-2 shadow-xl relative z-20">
        {tabs.map((tab, idx) => {
          if (tab.isFabSpace) {
            return <div key={`spacer-${idx}`} className="w-12 h-12" />; // Empty placeholder for FAB
          }

          const Icon = tab.icon!;
          const isActive = activeTab === tab.id;

          return (
            <button
              id={`nav-tab-${tab.id}`}
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-label={`${tab.label} Navigation Tab`}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center w-14 h-12 transition-all duration-200 relative group"
            >
              {/* Highlight bar above active item */}
              {isActive && (
                <span className="absolute -top-2 w-6 h-1 rounded-full bg-[#2dd4bf]" />
              )}
              
              <Icon
                className={`h-5 w-5 transition-all duration-200 ${
                  isActive
                    ? 'text-[#2dd4bf] scale-110 stroke-[2.5]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              />
              <span
                className={`text-[10px] mt-1 font-medium transition-colors ${
                  isActive
                    ? 'text-[#2dd4bf] font-semibold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
