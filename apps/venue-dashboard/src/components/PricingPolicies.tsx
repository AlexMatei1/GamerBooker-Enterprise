import React, { useState, useEffect } from 'react';
import {
  Coins,
  ShieldCheck,
  Clock,
  Users,
  CheckCircle,
  HelpCircle,
  Scale,
  Sparkles,
} from 'lucide-react';
import type { PolicyPreviewScenario, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface PricingPoliciesProps {
  venueId: string;
  role: VenueRole;
}

export const PricingPolicies: React.FC<PricingPoliciesProps> = ({ venueId, role }) => {
  const [depositPercent, setDepositPercent] = useState(40);
  const [cancellationHours, setCancellationHours] = useState(3);
  const [settlementMode, setSettlementMode] = useState<'ONLINE_OR_RECEPTION' | 'ONLINE_ONLY' | 'RECEPTION_ONLY'>('ONLINE_OR_RECEPTION');
  const [scenarios, setScenarios] = useState<PolicyPreviewScenario[]>([]);
  const [disclosures, setDisclosures] = useState<any>(null);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadEstimates();
  }, [venueId, depositPercent, cancellationHours, settlementMode]);

  async function loadEstimates() {
    const res = await api.getPolicyEstimates(venueId, {
      prepaid_mode: depositPercent === 100 ? 'FULL' : 'DEPOSIT',
      deposit_percentage: depositPercent,
      free_cancellation_hours: cancellationHours,
      deposit_mode_settlement: settlementMode,
    });
    setScenarios(res.scenarios);
    setDisclosures(res.disclosures);
  }

  function handleSavePolicy() {
    setSavedSuccessMsg('Policy settings saved and published. Future bookings will capture these snapshot invariants.');
    setTimeout(() => setSavedSuccessMsg(null), 4000);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="font-extrabold text-base text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-cyan-400" />
            Pricing & Policy Engine Studio (ENG-207)
          </h2>
          <p className="text-xs text-slate-400">
            Configure deposit rules, cancellation horizons, and preview instant customer estimates in real time
          </p>
        </div>

        {role !== 'RECEPTION' && (
          <button onClick={handleSavePolicy} className="btn-primary text-xs py-2 px-4">
            <ShieldCheck className="w-4 h-4" />
            Save & Publish Policy
          </button>
        )}
      </div>

      {savedSuccessMsg && (
        <div className="p-3 rounded-lg text-xs bg-emerald-950 border border-emerald-500 text-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {savedSuccessMsg}
        </div>
      )}

      {/* Main Grid: Settings Sliders on Left, Live Customer Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Policy Sliders */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-5 text-xs">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm border-b border-slate-800 pb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Commercial Policy Parameters
          </h3>

          {/* Deposit Slider */}
          <div className="space-y-2">
            <div className="flex justify-between font-semibold">
              <span className="text-slate-300">Required Online Deposit</span>
              <span className="font-mono text-cyan-300 font-bold">{depositPercent}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={depositPercent}
              onChange={(e) => setDepositPercent(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              {depositPercent === 100
                ? 'FULL prepay mode: Customer charges 100% upfront.'
                : `DEPOSIT mode: Customer pays ${depositPercent}% online; remaining ${100 - depositPercent}% paid upon arrival.`}
            </p>
          </div>

          {/* Free Cancellation Window */}
          <div className="space-y-2">
            <div className="flex justify-between font-semibold">
              <span className="text-slate-300">Free Cancellation Horizon</span>
              <span className="font-mono text-amber-300 font-bold">{cancellationHours} hours</span>
            </div>
            <input
              type="range"
              min={1}
              max={24}
              step={1}
              value={cancellationHours}
              onChange={(e) => setCancellationHours(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              Cancellations prior to {cancellationHours}h before start are 100% refunded. Late cancellations apply policy penalty.
            </p>
          </div>

          {/* Settlement Method */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold block">Remaining Balance Settlement</label>
            <select
              value={settlementMode}
              onChange={(e) => setSettlementMode(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-slate-200 text-xs"
            >
              <option value="ONLINE_OR_RECEPTION">ONLINE or RECEPTION (Cash / Card)</option>
              <option value="ONLINE_ONLY">Exclusively ONLINE (Card via App)</option>
              <option value="RECEPTION_ONLY">Exclusively at RECEPTION Desk</option>
            </select>
          </div>

          {/* Statutory Disclosures Card */}
          {disclosures && (
            <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 text-[11px] text-slate-400">
              <p className="font-bold text-slate-200 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-cyan-400" />
                Romanian Statutory Notices
              </p>
              <p>{disclosures.statutory_notice}</p>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Live Customer Estimates */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-cyan-400" />
              Live Customer Checkout Estimates
            </h3>
            <span className="text-xs text-slate-400 font-mono">Calculated at 30.00 RON/h Base</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((sc) => (
              <div
                key={sc.scenario_id}
                className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-cyan-500/40 transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">{sc.name}</span>
                  {sc.players_count > 1 ? (
                    <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] flex items-center gap-1">
                      <Users className="w-3 h-3" /> Group of 5
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">{sc.duration_minutes} min</span>
                  )}
                </div>

                <div className="space-y-1.5 py-2 border-y border-slate-800/80 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Price:</span>
                    <span className="font-bold text-white font-mono">{sc.customer_display.price_formatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cyan-400">Due Now ({depositPercent}%):</span>
                    <span className="font-bold text-cyan-400 font-mono">{sc.customer_display.due_now_formatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Remaining Balance:</span>
                    <span className="font-mono text-slate-300">{sc.customer_display.balance_formatted}</span>
                  </div>
                  {sc.per_player_share_minor && (
                    <div className="flex justify-between text-[11px] pt-1 text-purple-300 border-t border-slate-800/50">
                      <span>Per Player Due:</span>
                      <span className="font-mono font-bold">{(sc.per_player_due_now_minor! / 100).toFixed(2)} RON</span>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {sc.customer_display.free_cancellation_text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
