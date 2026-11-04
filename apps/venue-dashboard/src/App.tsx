import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LiveFloorView } from './components/LiveFloorView';
import { LayoutBuilder } from './components/LayoutBuilder';
import { BarBoard } from './components/BarBoard';
import { PricingPolicies } from './components/PricingPolicies';
import { FinancialLedger } from './components/FinancialLedger';
import { OperationsRunbooks } from './components/OperationsRunbooks';
import { StationClientShell } from './components/StationClientShell';
import { CommandPalette } from './components/CommandPalette';
import type { VenueRole } from './types/dashboard';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('floor');
  const [currentRole, setCurrentRole] = useState<VenueRole>('OWNER');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const venueId = 'v-arena-bucharest-01';
  const venueName = 'Nexus Gaming Arena — Bucharest Central';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-black">
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        venueName={venueName}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Command Center Content */}
      <main className="flex-1 p-5 max-w-[1600px] mx-auto w-full">
        {currentTab === 'floor' && <LiveFloorView venueId={venueId} role={currentRole} />}
        {currentTab === 'layout' && <LayoutBuilder venueId={venueId} role={currentRole} />}
        {currentTab === 'bar' && <BarBoard venueId={venueId} role={currentRole} />}
        {currentTab === 'pricing' && <PricingPolicies venueId={venueId} role={currentRole} />}
        {currentTab === 'financials' && <FinancialLedger venueId={venueId} role={currentRole} />}
        {currentTab === 'runbooks' && <OperationsRunbooks venueId={venueId} role={currentRole} />}
      </main>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={setCurrentTab}
        onSelectRole={setCurrentRole}
        currentRole={currentRole}
      />

      <footer className="border-t border-white/[0.06] bg-[#09090b] py-3.5 px-6 text-xs text-zinc-500 mt-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between max-w-[1600px] mx-auto gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>GamerBooker Enterprise Platform &bull; v1.0.0 Commercial Engine</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.08]">⌘K</kbd> for Omnibar</span>
            <span>&bull;</span>
            <span>ANAF Fiscal Chain Validated</span>
            <span>&bull;</span>
            <span>Law 42/2024 Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
