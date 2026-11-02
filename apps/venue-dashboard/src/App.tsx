import React, { useState } from 'react';
import { Header } from './components/Header';
import { LiveFloorView } from './components/LiveFloorView';
import { LayoutBuilder } from './components/LayoutBuilder';
import { BarBoard } from './components/BarBoard';
import { PricingPolicies } from './components/PricingPolicies';
import { FinancialLedger } from './components/FinancialLedger';
import { OperationsRunbooks } from './components/OperationsRunbooks';
import type { VenueRole } from './types/dashboard';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('floor');
  const [currentRole, setCurrentRole] = useState<VenueRole>('OWNER');
  const venueId = 'v-arena-bucharest-01';
  const venueName = 'Nexus Gaming Arena — Bucharest Central';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        venueName={venueName}
      />

      {/* Main Command Center Content */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        {currentTab === 'floor' && <LiveFloorView venueId={venueId} role={currentRole} />}
        {currentTab === 'layout' && <LayoutBuilder venueId={venueId} role={currentRole} />}
        {currentTab === 'bar' && <BarBoard venueId={venueId} role={currentRole} />}
        {currentTab === 'pricing' && <PricingPolicies venueId={venueId} role={currentRole} />}
        {currentTab === 'financials' && <FinancialLedger venueId={venueId} role={currentRole} />}
        {currentTab === 'runbooks' && <OperationsRunbooks venueId={venueId} role={currentRole} />}
      </main>

      <footer className="border-t border-slate-900/80 bg-slate-950/80 backdrop-blur-md py-4 px-6 text-xs text-slate-500 mt-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between max-w-[1600px] mx-auto gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>GamerBooker Enterprise Engine v1.0.0 &bull; Licensed for Commercial LAN & Esports Arenas</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-cyan-400">Strict Law 42/2024 Minors Protection</span>
            <span className="text-slate-700">&bull;</span>
            <span className="text-emerald-400">ANAF Fiscal Chain Validated</span>
            <span className="text-slate-700">&bull;</span>
            <span className="text-purple-400">Anti-Collision Layout Graph</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
