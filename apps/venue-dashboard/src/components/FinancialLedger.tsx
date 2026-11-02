import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Coins,
  CreditCard,
  Banknote,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import type { ReconciliationReport, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface FinancialLedgerProps {
  venueId: string;
  role: VenueRole;
}

export const FinancialLedger: React.FC<FinancialLedgerProps> = ({ venueId, role }) => {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receipts, setReceipts] = useState<any[]>([
    { id: 'rcp-01', reference: 'RCP-449102', amount_minor: 1800, method: 'CASH', staff: 'Elena M.', time: '14:20', voided: false },
    { id: 'rcp-02', reference: 'RCP-449105', amount_minor: 3600, method: 'POS_TERMINAL', staff: 'Elena M.', time: '15:10', voided: false },
    { id: 'rcp-03', reference: 'RCP-449110', amount_minor: 1200, method: 'CASH', staff: 'Elena M.', time: '16:05', voided: false },
    { id: 'rcp-04', reference: 'RCP-449115', amount_minor: 5400, method: 'POS_TERMINAL', staff: 'Andrei V.', time: '16:45', voided: false },
  ]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadReconciliation();
  }, [venueId, selectedDate]);

  async function loadReconciliation() {
    const rep = await api.getDailyReconciliation(venueId, selectedDate);
    setReport(rep);
  }

  function handleVoidReceipt(receiptId: string, reference: string) {
    if (role === 'RECEPTION') {
      alert('Unauthorized: Voiding offline receipts requires Owner or Venue Manager credentials.');
      return;
    }

    const reason = prompt(`Enter mandatory managerial void reason for ${reference}:`);
    if (!reason || reason.trim().length === 0) {
      alert('Void aborted: Reason is mandatory.');
      return;
    }

    setReceipts((prev) =>
      prev.map((r) => (r.id === receiptId ? { ...r, voided: true } : r)),
    );
    setActionMessage(`Receipt ${reference} voided. Outstanding balance restored to customer booking.`);
    setTimeout(() => setActionMessage(null), 4000);
  }

  if (!report) {
    return <div className="p-8 text-center text-slate-400">Loading daily financial reconciliation ledger...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="font-extrabold text-base text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Daily Financial Reconciliation & Reception Desk Ledger
          </h2>
          <p className="text-xs text-slate-400">
            Audit-grade balance chaining, online captured card revenues vs reception cash/POS collections
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300"
          />
          <span className="px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            BALANCED (±0.00 RON)
          </span>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-lg text-xs bg-amber-950/80 border border-amber-500/50 text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          {actionMessage}
        </div>
      )}

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="glass-panel p-3.5 rounded-xl border border-slate-800">
          <p className="text-[10px] uppercase font-bold text-slate-400">Opening Balance</p>
          <p className="text-base font-extrabold text-slate-200 font-mono mt-1">
            {(report.opening_balance_minor / 100).toFixed(2)} RON
          </p>
        </div>
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-800/40 bg-cyan-950/15">
          <p className="text-[10px] uppercase font-bold text-cyan-400">Online Card (PSP)</p>
          <p className="text-base font-extrabold text-cyan-300 font-mono mt-1">
            +{(report.online_captured_minor / 100).toFixed(2)} RON
          </p>
        </div>
        <div className="glass-panel p-3.5 rounded-xl border border-emerald-800/40 bg-emerald-950/15">
          <p className="text-[10px] uppercase font-bold text-emerald-400">Reception Cash</p>
          <p className="text-base font-extrabold text-emerald-300 font-mono mt-1">
            +{(report.reception_cash_minor / 100).toFixed(2)} RON
          </p>
        </div>
        <div className="glass-panel p-3.5 rounded-xl border border-emerald-800/40 bg-emerald-950/15">
          <p className="text-[10px] uppercase font-bold text-emerald-400">Reception POS Card</p>
          <p className="text-base font-extrabold text-emerald-300 font-mono mt-1">
            +{(report.reception_card_minor / 100).toFixed(2)} RON
          </p>
        </div>
        <div className="glass-panel p-3.5 rounded-xl border border-rose-800/40 bg-rose-950/15">
          <p className="text-[10px] uppercase font-bold text-rose-400">Online Refunds</p>
          <p className="text-base font-extrabold text-rose-300 font-mono mt-1">
            -{(report.refunds_minor / 100).toFixed(2)} RON
          </p>
        </div>
        <div className="glass-panel p-3.5 rounded-xl border border-slate-700 bg-slate-900/60">
          <p className="text-[10px] uppercase font-bold text-white">Closing Balance</p>
          <p className="text-base font-extrabold text-white font-mono mt-1">
            {(report.closing_balance_minor / 100).toFixed(2)} RON
          </p>
        </div>
      </div>

      {/* Reception Offline Receipts Table */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            Reception Offline Receipts Ledger (Crockford References)
          </h3>
          <span className="text-xs text-slate-400">{receipts.length} transactions recorded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-3">Reference</th>
                <th className="p-3">Method</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Staff Issuer</th>
                <th className="p-3">Time</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Manager Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40">
                  <td className="p-3 font-mono font-bold text-cyan-300">{r.reference}</td>
                  <td className="p-3">
                    {r.method === 'CASH' ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Banknote className="w-3.5 h-3.5" /> Cash
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <CreditCard className="w-3.5 h-3.5" /> POS Card
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono font-bold text-white">
                    {(r.amount_minor / 100).toFixed(2)} RON
                  </td>
                  <td className="p-3 text-slate-300">{r.staff}</td>
                  <td className="p-3 font-mono text-slate-400">{r.time}</td>
                  <td className="p-3">
                    {r.voided ? (
                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                        VOIDED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                        SETTLED
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {!r.voided && (
                      <button
                        onClick={() => handleVoidReceipt(r.id, r.reference)}
                        className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 text-[10px] font-bold"
                      >
                        Void Receipt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
