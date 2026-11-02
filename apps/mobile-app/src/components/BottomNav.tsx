import React from 'react';
import { Compass, Gamepad, Ticket, Utensils, User } from 'lucide-react';
import type { Screen } from '../types/mobile';

interface BottomNavProps {
  currentScreen: Screen;
  onSelectScreen: (screen: Screen) => void;
  hasActiveBooking: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  onSelectScreen,
  hasActiveBooking,
}) => {
  const items: { screen: Screen; label: string; icon: React.ElementType; badge?: boolean }[] = [
    { screen: 'explore', label: 'Venues', icon: Compass },
    { screen: 'station', label: 'Book Seat', icon: Gamepad },
    { screen: 'pass', label: 'Pass', icon: Ticket, badge: hasActiveBooking },
    { screen: 'bar', label: 'Bar & F&B', icon: Utensils },
    { screen: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-4 py-2 pb-6 max-w-md mx-auto">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => onSelectScreen(item.screen)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 ${
                isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                )}
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                )}
              </div>
              <span className={`text-[10px] mt-1 tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 bg-cyan-400 rounded-full mt-0.5 shadow-sm shadow-cyan-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
