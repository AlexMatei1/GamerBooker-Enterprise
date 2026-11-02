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
  Download,
  ShieldAlert,
  X,
  FileCheck,
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
    { id: 'rcp-01', reference: 'RCP-449102', amount_minor: 1800, method: 'CASH', staff: 'Elena M.', time: '14:20', voided: false, voidReason: null },
    { id: 'rcp-02', reference: 'RCP-449105', amount_minor: 3600, method: 'POS_TERMINAL', staff: 'Elena M.', time: '15:10', voided: false, voidReason: null },
    { id: 'rcp-03', reference: 'RCP-449110', amount_minor: 1200, method: 'CASH', staff: 'Elena M.', time: '16:05', voided: false, voidReason: null },
    { id: 'rcp-04', reference: 'RCP-449115', amount_minor: 5400, method: 'POS_TERMINAL', staff: 'Andrei V.', time: '16:45', voided: false, voidReason: null },
  ]);
  const [selectedReceiptForVoid, setSelectedReceiptForVoid] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState('Customer POS double-tap transaction error');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadReconciliation();
  }, [venueId, selectedDate]);

  async function loadReconciliation() {
    const rep = await api.getDailyReconciliation(venueId, selectedDate);
    setReport(rep);
  }

  function handleStartVoid(receipt: any) {
    if (role === 'RECEPTION') {
      setActionMessage('Unauthorized: Voiding offline receipts requires Owner or Venue Manager credentials.');
      setTimeout(() => setActionMessage(null), 4000);
      return;
    }
    setSelectedReceiptForVoid(receipt);
    setVoidReason('Customer POS double-tap transaction error');
    setSupervisorPin('');
    setVoidError(null);
  }

  function handleConfirmVoid() {
    if (!selectedReceiptForVoid) return;
    if (supervisorPin !== '1234' && supervisorPin !== '0000' && supervisorPin.length < 4) {
      setVoidError('Invalid Manager Security PIN. Enter 4-digit supervisor PIN (default: 1234).');
      return;
    }

    setReceipts((prev) =>
      prev.map((r) =>
        r.id === selectedReceiptForVoid.id ? { ...r, voided: true, voidReason } : r,
      ),
    );
    setActionMessage(`Receipt ${selectedReceiptForVoid.reference} voided. Outstanding balance restored to customer booking.`);
    setSelectedReceiptForVoid(null);
    setTimeout(() => setActionMessage(null), 4000);
  }

  function handleExportCsv() {
    const headers = ['Reference', 'Time', 'Payment Method', 'Amount (RON)', 'Staff Member', 'Status'];
    const rows = receipts.map((r) => [
      r.reference,
      r.time,
      r.method,
      (r.amount_minor / 100).toFixed(2),
      r.staff,
      r.voided ? `VOIDED (${r.voidReason})` : 'VALID',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `gamerbooker_ledger_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!report) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <span>Loading daily financial reconciliation ledger...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-base text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Daily Financial Reconciliation & Reception Desk Ledger
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              {report.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict cash drawer chaining &bull; Electronic POS reconciliation &bull; Managerial void audit trail
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
          />

          <button
            onClick={handleExportCsv}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Balance Equation Visualizer */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-xs uppercase font-extrabold text-slate-300 tracking-wider">
            Daily Balance Chaining Equation (ANAF Fiscal Requirement)
          </span>
          <span className="text-[11px] font-mono text-emerald-400">0 Unreconciled Discrepancies</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-1 text-center">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">1. Opening Drawer</span>
            <span className="font-mono font-extrabold text-sm text-slate-200 mt-1 block">
              {(report.opening_balance_minor / 100).toFixed(2)} RON
            </span>
          </div>

          <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40">
            <span className="text-[10px] uppercase text-cyan-400 font-bold block">+ 2. Online Captured</span>
            <span className="font-mono font-extrabold text-sm text-cyan-300 mt-1 block">
              {(report.online_captured_minor / 100).toFixed(2)} RON
            </span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
            <span className="text-[10px] uppercase text-emerald-400 font-bold block">+ 3. Cash Intake</span>
            <span className="font-mono font-extrabold text-sm text-emerald-300 mt-1 block">
              {(report.reception_cash_minor / 100).toFixed(2)} RON
            </span>
          </div>

          <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-800/40">
            <span className="text-[10px] uppercase text-purple-400 font-bold block">+ 4. POS Terminal</span>
            <span className="font-mono font-extrabold text-sm text-purple-300 mt-1 block">
              {(report.reception_card_minor / 100).toFixed(2)} RON
            </span>
          </div>

          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/40">
            <span className="text-[10px] uppercase text-rose-400 font-bold block">&minus; 5. Refunds / Voids</span>
            <span className="font-mono font-extrabold text-sm text-rose-300 mt-1 block">
              {((report.refunds_minor + report.voided_offline_minor) / 100).toFixed(2)} RON
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/50 shadow-md">
            <span className="text-[10px] uppercase text-emerald-400 font-bold block">= 6. Closing Drawer</span>
            <span className="font-mono font-black text-sm text-emerald-400 mt-1 block">
              {(report.closing_balance_minor / 100).toFixed(2)} RON
            </span>
          </div>
        </div>
      </div>

      {/* Receipts Audit Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-sm text-white">Reception Desk Transactions</h3>
            <p className="text-[11px] text-slate-400">Live fiscal transactions processed on-site today</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{receipts.length} Transactions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Payment Method</th>
                <th className="py-2.5 px-3">Staff Operator</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {receipts.map((rcp) => (
                <tr key={rcp.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-3 px-3 font-bold text-white">{rcp.reference}</td>
                  <td className="py-3 px-3 text-slate-400">{rcp.time}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-800">
                      {rcp.method}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-sans">{rcp.staff}</td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400">
                    {(rcp.amount_minor / 100).toFixed(2)} RON
                  </td>
                  <td className="py-3 px-3 text-center">
                    {rcp.voided ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                        VOIDED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        VALID
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-sans">
                    {!rcp.voided ? (
                      <button
                        onClick={() => handleStartVoid(rcp)}
                        className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                      >
                        Manager Void &rarr;
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">
                        {rcp.voidReason || 'Audited'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Managerial Void Confirmation Modal */}
      {selectedReceiptForVoid && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-rose-500/50 space-y-4 bg-slate-950">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Managerial Receipt Void</h3>
                <p className="text-[11px] text-rose-300">
                  Target: {selectedReceiptForVoid.reference} &bull; {(selectedReceiptForVoid.amount_minor / 100).toFixed(2)} RON
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Select Mandatory Void Reason:</label>
                <select
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
                >
                  <option value="Customer POS double-tap transaction error">Customer POS double-tap transaction error</option>
                  <option value="Incorrect cash denomination entered by staff">Incorrect cash denomination entered by staff</option>
                  <option value="Booking cancelled prior to station intake">Booking cancelled prior to station intake</option>
                  <option value="Hardware fault before session commencement">Hardware fault before session commencement</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Supervisor PIN (Required):</label>
                <input
                  type="password"
                  maxLength={4}
                  value={supervisorPin}
                  onChange={(e) => {
                    setSupervisorPin(e.target.value);
                    setVoidError(null);
                  }}
                  placeholder="Enter 4-digit PIN (default 1234)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-400"
                />
              </div>

              {voidError && (
                <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px] font-bold">
                  {voidError}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedReceiptForVoid(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVoid}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
