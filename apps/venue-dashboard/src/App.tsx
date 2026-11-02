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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        venueName={venueName}
      />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {currentTab === 'floor' && <LiveFloorView venueId={venueId} role={currentRole} />}
        {currentTab === 'layout' && <LayoutBuilder venueId={venueId} role={currentRole} />}
        {currentTab === 'bar' && <BarBoard venueId={venueId} role={currentRole} />}
        {currentTab === 'pricing' && <PricingPolicies venueId={venueId} role={currentRole} />}
        {currentTab === 'financials' && <FinancialLedger venueId={venueId} role={currentRole} />}
        {currentTab === 'runbooks' && <OperationsRunbooks venueId={venueId} role={currentRole} />}
      </main>

      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-500">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <span>GamerBooker Enterprise Engine v1.0.0 &bull; Licensed for Commercial LAN & Esports Arenas</span>
          <span className="font-mono text-[11px] text-cyan-400">Strict Romanian Compliance: Law 42/2024 &bull; Fiscal Chaining &bull; HMAC Token Pass</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
