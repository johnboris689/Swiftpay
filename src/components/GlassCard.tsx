import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  key?: React.Key | string | number;
}

export default function GlassCard({ children, className = '', id }: GlassCardProps) {
  return (
    <div
      id={id}
      className={`rounded-3xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-2xl transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
}
