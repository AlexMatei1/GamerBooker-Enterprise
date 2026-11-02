import React, { useState, useEffect } from 'react';
import {
  Search,
  Command,
  Monitor,
  Layers,
  UtensilsCrossed,
  Coins,
  FileSpreadsheet,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Plus,
  X,
} from 'lucide-react';
import type { VenueRole } from '../types/dashboard';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  onSelectRole: (role: VenueRole) => void;
  currentRole: VenueRole;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onSelectRole,
  currentRole,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    { id: 'tab-floor', title: 'Go to Live Floor Intake', category: 'Navigation', icon: Monitor, run: () => onSelectTab('floor') },
    { id: 'tab-layout', title: 'Open 2D Layout CAD Studio', category: 'Navigation', icon: Layers, run: () => onSelectTab('layout') },
    { id: 'tab-bar', title: 'View F&B Order Kanban', category: 'Navigation', icon: UtensilsCrossed, run: () => onSelectTab('bar') },
    { id: 'tab-pricing', title: 'Open Pricing & Policy Engine (ENG-207)', category: 'Navigation', icon: Coins, run: () => onSelectTab('pricing') },
    { id: 'tab-financials', title: 'View Daily Financial Ledger & Voids', category: 'Navigation', icon: FileSpreadsheet, run: () => onSelectTab('financials') },
    { id: 'tab-runbooks', title: 'Run Operations Go/No-Go Decision Gate', category: 'Navigation', icon: AlertOctagon, run: () => onSelectTab('runbooks') },
    
    // Quick Switch Roles
    { id: 'role-owner', title: 'Switch Role to Owner (Full Admin)', category: 'Staff Access', icon: ShieldCheck, run: () => onSelectRole('OWNER') },
    { id: 'role-manager', title: 'Switch Role to Venue Manager', category: 'Staff Access', icon: ShieldCheck, run: () => onSelectRole('VENUE_MANAGER') },
    { id: 'role-reception', title: 'Switch Role to Reception Desk', category: 'Staff Access', icon: ShieldCheck, run: () => onSelectRole('RECEPTION') },
    { id: 'role-bar', title: 'Switch Role to Bar & Kitchen', category: 'Staff Access', icon: UtensilsCrossed, run: () => onSelectRole('BAR_STAFF') },
  ];

  const filtered = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-start justify-center pt-24 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#121215] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/[0.08] gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to workspace... (Esc to close)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-white/[0.08]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No matching commands or workstations found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs hover:bg-zinc-800/80 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-white">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-medium text-zinc-200 group-hover:text-white block">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-zinc-500">{item.category}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-zinc-950/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Active Role: <strong className="text-zinc-300">{currentRole}</strong></span>
          <div className="flex items-center gap-2">
            <span>Navigate: &uarr;&darr;</span>
            <span>Select: &crarr;</span>
          </div>
        </div>
      </div>
    </div>
  );
};
