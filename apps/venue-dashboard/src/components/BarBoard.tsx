import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Clock,
  ShieldAlert,
  CheckCircle2,
  MapPin,
  Barcode,
  X,
  KeyRound,
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
    setToastMessage(`Order status updated to ${nextStatus}.`);
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
    setToastMessage(`Crockford code verified for #${selectedOrderForPickup.public_code}.`);
    setTimeout(() => setToastMessage(null), 3000);
  }

  function confirmAgeVerification() {
    if (!selectedOrderForAgeCheck || !ageCheckConfirmed) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrderForAgeCheck.id
          ? { ...o, status: 'HANDED_OFF', age_verified_by: 'STAFF_VISUAL_CHECK' }
          : o,
      ),
    );
    setSelectedOrderForAgeCheck(null);
    setAgeCheckConfirmed(false);
    setToastMessage('✓ Vârstă verificată vizual conform Legii 42/2024. Comandă predată.');
    setTimeout(() => setToastMessage(null), 3500);
  }

  function handleRefuseAgeVerification() {
    if (!selectedOrderForAgeCheck) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrderForAgeCheck.id
          ? { ...o, status: 'CANCELLED', age_verified_by: 'REFUSED_UNDERAGE' }
          : o,
      ),
    );
    setSelectedOrderForAgeCheck(null);
    setAgeCheckConfirmed(false);
    setToastMessage('⚠️ Comandă refuzată: Clientul este minor. Banii au fost returnați.');
    setTimeout(() => setToastMessage(null), 4000);
  }

  const columns: { id: BarOrder['status']; label: string; count: number }[] = [
    { id: 'PLACED', label: 'Placed', count: orders.filter((o) => o.status === 'PLACED').length },
    { id: 'PREPARING', label: 'Preparing', count: orders.filter((o) => o.status === 'PREPARING').length },
    { id: 'READY', label: 'Ready for Pickup', count: orders.filter((o) => o.status === 'READY').length },
    { id: 'HANDED_OFF', label: 'Completed', count: orders.filter((o) => o.status === 'HANDED_OFF').length },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-zinc-200">F&B Dispatch & Order Fulfillment</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60">
              Law 42/2024 Enforced
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Real-time station delivery & bar pickup tickets &bull; 4-character Crockford verification
          </p>
        </div>

        <div className="text-xs text-zinc-400 font-mono">
          <span>Active Pipeline: </span>
          <span className="font-semibold text-zinc-200">{orders.filter((o) => o.status !== 'HANDED_OFF').length} Orders</span>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-white/[0.1] text-xs flex items-center gap-2 text-zinc-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Clean Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.id);
          return (
            <div key={col.id} className="panel p-3 flex flex-col space-y-2.5 min-h-[500px]">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <span className="text-xs font-medium text-zinc-300">{col.label}</span>
                <span className="font-mono text-[11px] text-zinc-500 font-medium bg-zinc-900 px-2 py-0.5 rounded">
                  {colOrders.length}
                </span>
              </div>

              {colOrders.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center p-6 text-zinc-600 text-xs">
                  Empty
                </div>
              ) : (
                <div className="space-y-2">
                  {colOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-3 rounded-lg bg-zinc-900/90 border border-white/[0.06] hover:border-white/[0.12] transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono font-medium text-xs text-zinc-200">
                            #{order.public_code}
                          </span>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        {order.fulfillment_mode === 'AT_STATION' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 bg-zinc-800 border border-white/[0.04]">
                            Seat {order.target_resource_name}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-white/[0.04]">
                            Bar Pickup
                          </span>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-1 text-xs border-y border-white/[0.04] py-1.5">
                        {order.items.map((it) => (
                          <div key={it.id} className="flex justify-between items-center text-zinc-300 text-[11px]">
                            <span>
                              <span className="text-zinc-500 font-mono mr-1">{it.quantity}&times;</span>
                              {it.title}
                            </span>
                            <span className="font-mono text-zinc-400 text-[10px]">
                              {(it.line_total_minor / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {order.age_verification_required && (
                        <div className="p-1.5 rounded bg-amber-950/30 border border-amber-900/50 text-[10px] text-amber-300">
                          {order.age_verified_by ? (
                            <span className="text-emerald-400">✓ {order.age_verified_by}</span>
                          ) : (
                            'Law 42/2024: 18+ ID Check Required'
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-xs text-zinc-100 font-semibold">
                          {(order.total_minor / 100).toFixed(2)} RON
                        </span>

                        <div className="flex gap-1">
                          {order.status === 'PLACED' && (
                            <button
                              onClick={() => advanceStatus(order.id, 'PREPARING')}
                              className="btn-secondary text-[11px] py-1 px-2.5"
                            >
                              Prep &rarr;
                            </button>
                          )}
                          {order.status === 'PREPARING' && (
                            <button
                              onClick={() => advanceStatus(order.id, 'READY')}
                              className="btn-secondary text-[11px] py-1 px-2.5"
                            >
                              Ready &rarr;
                            </button>
                          )}
                          {order.status === 'READY' && (
                            <button
                              onClick={() => handleStartHandoff(order)}
                              className="btn-primary text-[11px] py-1 px-3"
                            >
                              Handoff
                            </button>
                          )}
                          {order.status === 'HANDED_OFF' && (
                            <span className="text-[10px] text-zinc-500 font-mono">Settled</span>
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

      {/* Crockford 4-Character Code Modal */}
      {selectedOrderForPickup && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="panel max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-zinc-400" />
                <h4 className="font-semibold text-xs text-zinc-200">Verify Pickup Code</h4>
              </div>
              <button onClick={() => setSelectedOrderForPickup(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-zinc-400">
                Enter 4-character customer code for order <strong className="text-zinc-200">#{selectedOrderForPickup.public_code}</strong>.
              </p>
              <input
                type="text"
                maxLength={4}
                value={pickupCodeInput}
                onChange={(e) => {
                  setPickupCodeInput(e.target.value.toUpperCase());
                  setPickupCodeError(null);
                }}
                placeholder="XXXX"
                className="w-36 mx-auto text-center font-mono font-bold text-xl tracking-widest bg-zinc-900 border border-white/[0.12] rounded-lg py-2 text-zinc-100 focus:outline-none focus:border-indigo-500 uppercase"
              />
              <div className="text-[10px] text-zinc-500 font-mono">
                Customer ticket code: <strong>{selectedOrderForPickup.pickup_code}</strong>
              </div>
              {pickupCodeError && <div className="text-xs text-rose-400 font-medium">{pickupCodeError}</div>}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setSelectedOrderForPickup(null)}
                className="flex-1 btn-secondary text-xs py-1.5 justify-center"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPickupCode}
                className="flex-1 btn-primary text-xs py-1.5 justify-center"
              >
                Verify & Settle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Romanian Law 42/2024 Age Modal */}
      {selectedOrderForAgeCheck && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="panel max-w-md w-full p-5 space-y-4 shadow-2xl border-amber-500/30">
            <div className="flex items-center gap-2.5 pb-2 border-b border-white/[0.08]">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h4 className="font-semibold text-xs text-zinc-100">Law 42/2024 Statutory Age Verification</h4>
                <p className="text-[10px] text-zinc-400">Mandatory verification for energy drinks & alcohol</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-zinc-300 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-xs">
                <span>Produse supuse restricțiilor de vârstă:</span>
              </div>
              <ul className="list-disc pl-4 text-xs text-zinc-300 space-y-0.5">
                {selectedOrderForAgeCheck.items
                  .filter((i) => i.age_restricted)
                  .map((i) => (
                    <li key={i.id}>{i.quantity}&times; {i.title}</li>
                  ))}
              </ul>
              <p className="text-[11px] text-zinc-400 pt-1">
                Conform legii, este suficientă <strong>prezentarea vizuală a actului de identitate</strong> pentru confirmarea anului nașterii. Reținerea buletinului la recepție este interzisă prin lege.
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageCheckConfirmed}
                onChange={(e) => setAgeCheckConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 text-amber-500 bg-zinc-950 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-medium text-zinc-200">
                Confirm că am inspectat vizual actul clientului și acesta are vârsta legală (16+ / 18+ ani).
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.06]">
              <button
                onClick={() => setSelectedOrderForAgeCheck(null)}
                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleRefuseAgeVerification}
                className="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
              >
                ✗ Client Minor (Refuză &amp; Returnează)
              </button>
              <button
                onClick={confirmAgeVerification}
                disabled={!ageCheckConfirmed}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all disabled:opacity-40"
              >
                ✓ Confirmă Vârsta &amp; Predă
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
