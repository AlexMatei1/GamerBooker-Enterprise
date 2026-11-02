import React from 'react';
import {
  Gamepad2,
  ShieldCheck,
  Building2,
  Layers,
  CalendarCheck,
  UtensilsCrossed,
  Coins,
  FileSpreadsheet,
  AlertOctagon,
  ChevronDown,
} from 'lucide-react';
import type { VenueRole } from '../types/dashboard';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentRole: VenueRole;
  onSelectRole: (role: VenueRole) => void;
  venueName: string;
  onOpenCommandPalette: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentRole,
  onSelectRole,
  venueName,
  onOpenCommandPalette,
}) => {
  const tabs = [
    { id: 'floor', label: 'Live Floor', icon: CalendarCheck, shortcut: '1' },
    { id: 'layout', label: 'Layout Studio', icon: Layers, shortcut: '2' },
    { id: 'bar', label: 'F&B Orders', icon: UtensilsCrossed, shortcut: '3' },
    { id: 'pricing', label: 'Pricing Engine', icon: Coins, shortcut: '4' },
    { id: 'financials', label: 'Daily Ledger', icon: FileSpreadsheet, shortcut: '5' },
    { id: 'runbooks', label: 'Runbooks', icon: AlertOctagon, shortcut: '6' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#09090b]/90 backdrop-blur-xl px-5 py-2.5">
      <div className="flex items-center justify-between gap-4 max-w-[1600px] mx-auto">
        {/* Brand & Venue Context */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.12] flex items-center justify-center text-zinc-100 shadow-sm">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-zinc-100">
              GamerBooker
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              ENT
            </span>
            <span className="text-zinc-600 font-light">/</span>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors">
              <span className="font-medium text-zinc-300">{venueName}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </div>
          </div>
        </div>

        {/* Clean Segmented Navigation Tabs */}
        <nav className="flex items-center gap-0.5 bg-zinc-900/90 p-1 rounded-xl border border-white/[0.06]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-120 ${
                  active
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm shadow-black/40 border border-white/[0.08]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Role Switcher & Live Health Pulse */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-lg border border-white/[0.08] text-xs transition-colors"
            title="Command Palette (Cmd+K / Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="px-1.5 py-0.2 rounded text-[10px] font-mono text-zinc-500 bg-zinc-800 border border-white/[0.06]">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1 rounded-lg border border-white/[0.08] text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={currentRole}
              onChange={(e) => onSelectRole(e.target.value as VenueRole)}
              className="bg-transparent font-medium text-zinc-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value="OWNER" className="bg-zinc-900 text-zinc-200">Owner (Admin)</option>
              <option value="VENUE_MANAGER" className="bg-zinc-900 text-zinc-200">Venue Manager</option>
              <option value="RECEPTION" className="bg-zinc-900 text-zinc-200">Reception Desk</option>
              <option value="BAR_STAFF" className="bg-zinc-900 text-zinc-200">Bar & F&B</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 px-2 py-1 rounded bg-zinc-900 border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational</span>
          </div>
        </div>
      </div>
    </header>
  );
};
