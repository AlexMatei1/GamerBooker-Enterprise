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
    { screen: 'explore', label: 'Explore', icon: Compass },
    { screen: 'station', label: 'Reserve', icon: Gamepad },
    { screen: 'pass', label: 'Pass', icon: Ticket, badge: hasActiveBooking },
    { screen: 'bar', label: 'Bar & F&B', icon: Utensils },
    { screen: 'profile', label: 'Account', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-2xl border-t border-white/[0.08] px-4 py-2 pb-6 max-w-md mx-auto">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => onSelectScreen(item.screen)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors ${
                isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.2px]' : 'stroke-[1.6px]'}`} />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                )}
              </div>
              <span className={`text-[10px] mt-1 tracking-tight ${isActive ? 'font-semibold text-white' : 'font-normal text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
