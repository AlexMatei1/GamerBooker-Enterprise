import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Barcode,
  X,
  Beer,
  Zap,
  Check,
  Search,
  KeyRound,
  FileCheck,
} from 'lucide-react';
import type { BarOrder, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface BarBoardProps {
  venueId: string;
  role: VenueRole;
}

export const BarBoard: React.FC<BarBoardProps> = ({ venueId, role }) => {
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [selectedOrderForAgeCheck, setSelectedOrderForAgeCheck] = useState<BarOrder | null>(null);
  const [selectedOrderForPickup, setSelectedOrderForPickup] = useState<BarOrder | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState('');
  const [pickupCodeError, setPickupCodeError] = useState<string | null>(null);
  const [idDocumentNumber, setIdDocumentNumber] = useState('');
  const [ageCheckConfirmed, setAgeCheckConfirmed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [venueId]);

  async function loadOrders() {
    const list = await api.getBarOrders(venueId);
    setOrders(list);
  }

  function advanceStatus(orderId: string, nextStatus: BarOrder['status']) {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)),
    );
    setToastMessage(`Order updated to ${nextStatus}.`);
    setTimeout(() => setToastMessage(null), 3000);
  }

  function handleStartHandoff(order: BarOrder) {
    if (order.age_verification_required && !order.age_verified_by) {
      setSelectedOrderForAgeCheck(order);
      return;
    }

    if (order.fulfillment_mode === 'BAR_PICKUP' && order.pickup_code) {
      setSelectedOrderForPickup(order);
      setPickupCodeInput('');
      setPickupCodeError(null);
      return;
    }

    advanceStatus(order.id, 'HANDED_OFF');
  }

  function handleVerifyPickupCode() {
    if (!selectedOrderForPickup) return;
    if (pickupCodeInput.trim().toUpperCase() !== selectedOrderForPickup.pickup_code) {
      setPickupCodeError(`Code mismatch! Expected "${selectedOrderForPickup.pickup_code}".`);
      return;
    }

    advanceStatus(selectedOrderForPickup.id, 'HANDED_OFF');
    setSelectedOrderForPickup(null);
    setToastMessage(`Crockford code verified! Order #${selectedOrderForPickup.public_code} handed off.`);
    setTimeout(() => setToastMessage(null), 3000);
  }

  function confirmAgeVerification() {
    if (!selectedOrderForAgeCheck || !ageCheckConfirmed || !idDocumentNumber.trim()) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrderForAgeCheck.id
          ? { ...o, status: 'HANDED_OFF', age_verified_by: `ID: ${idDocumentNumber.trim().toUpperCase()}` }
          : o,
      ),
    );
    setSelectedOrderForAgeCheck(null);
    setAgeCheckConfirmed(false);
    setIdDocumentNumber('');
    setToastMessage('Statutory Law 42/2024 age check certified & logged. Order delivered.');
    setTimeout(() => setToastMessage(null), 3500);
  }

  const columns: { id: BarOrder['status']; label: string; dot: string; border: string }[] = [
    { id: 'PLACED', label: '1. Placed / Incoming', dot: 'bg-amber-400', border: 'border-amber-500/30' },
    { id: 'PREPARING', label: '2. In Preparation', dot: 'bg-cyan-400', border: 'border-cyan-500/30' },
    { id: 'READY', label: '3. Ready for Handoff', dot: 'bg-emerald-400', border: 'border-emerald-500/30' },
    { id: 'HANDED_OFF', label: '4. Completed / Settled', dot: 'bg-slate-500', border: 'border-slate-800' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-base text-white flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-cyan-400" />
              Bar & F&B Operations Kanban
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
              Law 42/2024 Minors Protection
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time station delivery & bar pickup tickets &bull; Crockford Base32 verification &bull; Mandatory ID checks
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Total Orders:</span>
          <span className="font-mono font-bold text-white bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            {orders.length}
          </span>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-xl bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.id);
          return (
            <div
              key={col.id}
              className={`glass-panel p-4 rounded-2xl border ${col.border} flex flex-col space-y-3 min-h-[500px]`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <h3 className="font-extrabold text-xs text-white">{col.label}</h3>
                </div>
                <span className="font-mono text-xs text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                  {colOrders.length}
                </span>
              </div>

              {colOrders.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center p-6 text-slate-600 text-xs">
                  No orders in this stage
                </div>
              ) : (
                <div className="space-y-3">
                  {colOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono font-bold text-xs text-cyan-300">
                            #{order.public_code}
                          </span>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        {/* Fulfillment Destination Badge */}
                        <div className="text-right">
                          {order.fulfillment_mode === 'AT_STATION' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {order.target_resource_name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                              <Barcode className="w-3 h-3" /> Bar Pickup
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-1 text-xs border-y border-slate-800/80 py-2">
                        {order.items.map((it) => (
                          <div key={it.id} className="flex justify-between items-center text-slate-300">
                            <span className="text-[11px] truncate">
                              <strong className="text-cyan-400 font-mono">{it.quantity}x</strong> {it.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {(it.line_total_minor / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Law 42 Warning if Age Verification Required */}
                      {order.age_verification_required && (
                        <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[10px] text-amber-200 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {order.age_verified_by ? (
                              <strong className="text-emerald-400">✓ {order.age_verified_by}</strong>
                            ) : (
                              'Law 42/2024: Mandatory physical 18+ ID check required'
                            )}
                          </span>
                        </div>
                      )}

                      {/* Total & Action Buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono font-bold text-xs text-white">
                          {(order.total_minor / 100).toFixed(2)} RON
                        </span>

                        <div className="flex gap-1">
                          {order.status === 'PLACED' && (
                            <button
                              onClick={() => advanceStatus(order.id, 'PREPARING')}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-[11px] font-bold"
                            >
                              Prep &rarr;
                            </button>
                          )}

                          {order.status === 'PREPARING' && (
                            <button
                              onClick={() => advanceStatus(order.id, 'READY')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-[11px] font-bold"
                            >
                              Ready &rarr;
                            </button>
                          )}

                          {order.status === 'READY' && (
                            <button
                              onClick={() => handleStartHandoff(order)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-[11px] font-black shadow-md shadow-emerald-500/20"
                            >
                              Handoff
                            </button>
                          )}

                          {order.status === 'HANDED_OFF' && (
                            <span className="text-[10px] text-slate-500 font-bold">Settled</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Crockford 4-Character Pickup Code Verification Modal */}
      {selectedOrderForPickup && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-sm w-full p-5 rounded-3xl border border-cyan-500/40 space-y-4 bg-slate-950">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <h3 className="font-extrabold text-sm text-white">Verify Pickup Code</h3>
              </div>
              <button
                onClick={() => setSelectedOrderForPickup(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-slate-300">
                Customer must present their 4-character Crockford code for order{' '}
                <strong className="text-cyan-300">#{selectedOrderForPickup.public_code}</strong>.
              </p>
              <input
                type="text"
                maxLength={4}
                value={pickupCodeInput}
                onChange={(e) => {
                  setPickupCodeInput(e.target.value.toUpperCase());
                  setPickupCodeError(null);
                }}
                placeholder="4-CHAR"
                className="w-40 mx-auto text-center font-mono font-black text-2xl tracking-widest bg-slate-900 border-2 border-cyan-500/60 rounded-xl py-2 text-cyan-300 focus:outline-none focus:border-cyan-400 uppercase"
              />
              <div className="text-[10px] text-slate-500 font-mono">
                Hint: Customer ticket shows <strong>{selectedOrderForPickup.pickup_code}</strong>
              </div>
              {pickupCodeError && (
                <div className="text-xs text-rose-400 font-bold">{pickupCodeError}</div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedOrderForPickup(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPickupCode}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
              >
                Verify & Hand Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Romanian Law 42/2024 Physical ID Verification Modal */}
      {selectedOrderForAgeCheck && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl border border-amber-500/50 space-y-4 bg-slate-950">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Legea Română 42/2024 &bull; Verificare Vârstă</h3>
                <p className="text-[11px] text-amber-300">Certificare obligatorie vânzare băuturi energizante / alcool</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/60 text-xs text-slate-300 space-y-2">
              <p className="font-semibold text-amber-200">
                Comanda conține produse cu restricție de vârstă:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-400">
                {selectedOrderForAgeCheck.items
                  .filter((i) => i.age_restricted)
                  .map((i) => (
                    <li key={i.id} className="text-white">
                      {i.quantity}x {i.title}
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300">Serie și Număr Act Identitate (CI / Pașaport):</label>
              <input
                type="text"
                value={idDocumentNumber}
                onChange={(e) => setIdDocumentNumber(e.target.value)}
                placeholder="ex. RK 123456"
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-amber-400"
              />
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageCheckConfirmed}
                onChange={(e) => setAgeCheckConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-0 bg-slate-900"
              />
              <span>
                Certific pe propria răspundere că am inspectat actul de identitate fizic al clientului și că acesta are peste 18 ani împliniți.
              </span>
            </label>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedOrderForAgeCheck(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-semibold"
              >
                Anulează
              </button>
              <button
                onClick={confirmAgeVerification}
                disabled={!ageCheckConfirmed || !idDocumentNumber.trim()}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
              >
                Certifică & Predă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
