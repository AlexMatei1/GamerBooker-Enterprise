import React from 'react';
import {
  Gamepad2,
  ShieldCheck,
  Building2,
  Activity,
  Layers,
  CalendarCheck,
  UtensilsCrossed,
  Coins,
  FileSpreadsheet,
  AlertOctagon,
} from 'lucide-react';
import type { VenueRole } from '../types/dashboard';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentRole: VenueRole;
  onSelectRole: (role: VenueRole) => void;
  venueName: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentRole,
  onSelectRole,
  venueName,
}) => {
  const tabs = [
    { id: 'floor', label: 'Live Floor & Intake', icon: CalendarCheck },
    { id: 'layout', label: 'Layout Builder', icon: Layers },
    { id: 'bar', label: 'Bar Board & F&B', icon: UtensilsCrossed },
    { id: 'pricing', label: 'Pricing & Policies', icon: Coins },
    { id: 'financials', label: 'Daily Ledger & Audits', icon: FileSpreadsheet },
    { id: 'runbooks', label: 'Runbooks & Go/No-Go', icon: AlertOctagon },
  ];

  return (
    <header className="glass-panel sticky top-0 z-50 px-6 py-3 border-b border-slate-800 bg-slate-950/90">
      <div className="flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Gamepad2 className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-cyan-300 via-sky-200 to-white bg-clip-text text-transparent">
                GamerBooker
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 tracking-wider">
                ENTERPRISE
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-cyan-400" /> {venueName}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Staff Role Switcher & Live Pulse */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Staff Role:</span>
            <select
              value={currentRole}
              onChange={(e) => onSelectRole(e.target.value as VenueRole)}
              className="bg-transparent font-bold text-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="OWNER" className="bg-slate-900 text-slate-100">Owner</option>
              <option value="VENUE_MANAGER" className="bg-slate-900 text-slate-100">Venue Manager</option>
              <option value="RECEPTION" className="bg-slate-900 text-slate-100">Reception Desk</option>
              <option value="BAR_STAFF" className="bg-slate-900 text-slate-100">Bar & F&B</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            API ONLINE
          </div>
        </div>
      </div>
    </header>
  );
};
