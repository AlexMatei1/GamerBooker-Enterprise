import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  ShieldCheck,
  CalendarCheck,
  UtensilsCrossed,
  FileSpreadsheet,
  Layers,
  Coins,
  AlertOctagon,
  Search,
  Sliders,
  ChevronDown,
  Radio,
  Monitor,
} from 'lucide-react';
import type { VenueRole } from '../types/dashboard';
import { realtime } from '../services/realtime';

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
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  useEffect(() => {
    return realtime.onStatusChange(setRealtimeStatus);
  }, []);

  // Everyday operational tabs
  const primaryTabs = [
    { id: 'floor', label: 'Live Floor & Desk', icon: CalendarCheck },
    { id: 'bar', label: 'Snack & Bar Orders', icon: UtensilsCrossed },
    { id: 'station_client', label: 'PC Station Shell', icon: Monitor },
    { id: 'financials', label: 'Cash Register & Sales', icon: FileSpreadsheet },
  ];

  // Advanced Tools (CAD Studio, Pricing Rules, Runbooks)
  const advancedTabs = [
    { id: 'layout', label: 'CAD Layout Studio', icon: Layers, desc: 'Drag-and-drop 2D floor designer' },
    { id: 'pricing', label: 'Pricing Engine', icon: Coins, desc: 'Hourly rates and tier rules' },
    { id: 'runbooks', label: 'Operational Runbooks', icon: AlertOctagon, desc: 'Staff checklists & emergency guides' },
  ];

  const isAdvancedTabActive = advancedTabs.some((t) => t.id === currentTab);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#09090b]/95 backdrop-blur-xl px-5 py-3">
      <div className="flex items-center justify-between gap-4 max-w-[1600px] mx-auto">
        {/* Brand & Venue Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">GamerBooker</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ARENA POS
              </span>
            </div>
            <div className="text-xs text-zinc-400 font-medium truncate max-w-[200px] sm:max-w-none">
              {venueName}
            </div>
          </div>
        </div>

        {/* Clean, Human-Friendly Navigation */}
        <nav className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-2xl border border-white/[0.08] shadow-inner">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSelectTab(tab.id);
                  setShowAdvancedMenu(false);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-white text-black shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-black' : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Advanced Manager Tools Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isAdvancedTabActive
                  ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Manager Studio</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {/* Dropdown Menu */}
            {showAdvancedMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] uppercase font-bold text-zinc-500 px-3 py-1.5 tracking-wider">
                  Configuration &amp; Engineering
                </div>
                {advancedTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        onSelectTab(tab.id);
                        setShowAdvancedMenu(false);
                      }}
                      className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all ${
                        active
                          ? 'bg-emerald-500/15 text-white border border-emerald-500/30'
                          : 'hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-xs text-white">{tab.label}</div>
                        <div className="text-[11px] text-zinc-400">{tab.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Search / Omnibar & Staff Role Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Live Sync Badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all ${
              realtimeStatus === 'connected'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : realtimeStatus === 'connecting'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
            title={`Realtime SSE connection: ${realtimeStatus}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : realtimeStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <Radio className="w-3 h-3" />
            <span>{realtimeStatus === 'connected' ? 'Live Sync' : realtimeStatus === 'connecting' ? 'Syncing...' : 'Offline'}</span>
          </div>

          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-3 py-2 rounded-xl border border-white/[0.08] text-xs font-medium transition-colors"
            title="Search anything (Cmd+K / Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-800 border border-white/[0.06]">
              ⌘K
            </kbd>
          </button>

          {/* Role Pill */}
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <select
              value={currentRole}
              onChange={(e) => onSelectRole(e.target.value as VenueRole)}
              className="bg-transparent font-semibold text-zinc-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="OWNER" className="bg-zinc-900 text-zinc-200">Owner (Admin)</option>
              <option value="VENUE_MANAGER" className="bg-zinc-900 text-zinc-200">Venue Manager</option>
              <option value="RECEPTION" className="bg-zinc-900 text-zinc-200">Reception Desk</option>
              <option value="BAR_STAFF" className="bg-zinc-900 text-zinc-200">Bar &amp; F&amp;B Staff</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
