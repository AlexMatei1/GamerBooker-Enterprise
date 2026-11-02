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
  const [pickupCodeInput, setPickupCodeInput] = useState('');
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

  function handleCompleteHandoff(order: BarOrder) {
    if (order.age_verification_required && !order.age_verified_by) {
      setSelectedOrderForAgeCheck(order);
      return;
    }

    if (order.fulfillment_mode === 'BAR_PICKUP' && order.pickup_code) {
      const code = prompt(`Enter customer 4-character pickup code (${order.pickup_code}):`);
      if (code?.toUpperCase() !== order.pickup_code) {
        alert('Invalid pickup code. Delivery rejected.');
        return;
      }
    }

    advanceStatus(order.id, 'HANDED_OFF');
  }

  function confirmAgeVerification() {
    if (!selectedOrderForAgeCheck || !ageCheckConfirmed) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrderForAgeCheck.id
          ? { ...o, status: 'HANDED_OFF', age_verified_by: 'Staff Verified' }
          : o,
      ),
    );
    setSelectedOrderForAgeCheck(null);
    setAgeCheckConfirmed(false);
    setToastMessage('Statutory Law 42/2024 age check recorded. Order handed off.');
    setTimeout(() => setToastMessage(null), 3500);
  }

  const columns: { id: BarOrder['status']; label: string; dot: string }[] = [
    { id: 'PLACED', label: 'Placed (Queue)', dot: 'bg-amber-400' },
    { id: 'PREPARING', label: 'In Preparation', dot: 'bg-cyan-400 animate-pulse' },
    { id: 'READY', label: 'Ready for Handoff', dot: 'bg-emerald-400' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="font-extrabold text-base text-white flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-amber-400" />
            Bar Board & In-Session F&B Fulfillment
          </h2>
          <p className="text-xs text-slate-400">
            Real-time linear state machine (PLACED → PREPARING → READY → HANDED_OFF) with Law 42/2024 ID compliance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-300 border border-amber-800/40 text-xs font-mono">
            {orders.filter((o) => o.status !== 'HANDED_OFF').length} active orders
          </span>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-lg text-xs bg-emerald-950 border border-emerald-500 text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.id);
          return (
            <div key={col.id} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-slate-200 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`}></span>
                  {col.label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {colOrders.length}
                </span>
              </div>

              {colOrders.length === 0 ? (
                <div className="p-6 text-center text-slate-600 text-xs">No orders in this stage.</div>
              ) : (
                <div className="space-y-3">
                  {colOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-cyan-300">{ord.public_code}</span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {ord.fulfillment_mode === 'AT_STATION' ? (
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> Deliver to {ord.target_resource_name}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1 font-mono">
                            <Barcode className="w-3 h-3" /> Counter Pickup ({ord.pickup_code})
                          </span>
                        )}

                        {ord.age_verification_required && (
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 font-semibold text-[10px]">
                            <Zap className="w-3 h-3" /> Law 42/2024
                          </span>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-1 py-1 border-y border-slate-800/60">
                        {ord.items.map((it) => (
                          <div key={it.id} className="flex justify-between text-slate-300 text-[11px]">
                            <span>{it.quantity}x {it.title}</span>
                            <span className="font-mono">{(it.line_total_minor / 100).toFixed(2)} RON</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="font-bold text-slate-200">
                          Total: {(ord.total_minor / 100).toFixed(2)} RON
                        </span>

                        <div className="flex gap-1.5">
                          {ord.status === 'PLACED' && (
                            <button
                              onClick={() => advanceStatus(ord.id, 'PREPARING')}
                              className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 font-semibold"
                            >
                              Start Prep
                            </button>
                          )}
                          {ord.status === 'PREPARING' && (
                            <button
                              onClick={() => advanceStatus(ord.id, 'READY')}
                              className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 font-semibold"
                            >
                              Mark Ready
                            </button>
                          )}
                          {ord.status === 'READY' && (
                            <button
                              onClick={() => handleCompleteHandoff(ord)}
                              className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold"
                            >
                              Hand Off
                            </button>
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

      {/* Romanian Law 42/2024 Age Check Modal */}
      {selectedOrderForAgeCheck && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-md w-full border border-rose-600/50 bg-slate-950 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Romanian Law 42/2024 Mandatory ID Check
              </h3>
              <button onClick={() => setSelectedOrderForAgeCheck(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Order <span className="font-mono font-bold text-cyan-300">{selectedOrderForAgeCheck.public_code}</span> contains
              energy drinks or age-restricted beverages. Pursuant to statutory Romanian Law 42/2024, staff must inspect a legal ID (bulletin/buletin) confirming age 18+.
            </p>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-rose-950/20 border border-rose-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={ageCheckConfirmed}
                onChange={(e) => setAgeCheckConfirmed(e.target.checked)}
                className="mt-0.5 rounded text-rose-500 focus:ring-0"
              />
              <span className="text-xs text-rose-200">
                I hereby certify that I physically inspected the customer's legal identification and confirmed they are at least 18 years of age.
              </span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedOrderForAgeCheck(null)}
                className="flex-1 btn-secondary text-xs justify-center"
              >
                Cancel
              </button>
              <button
                disabled={!ageCheckConfirmed}
                onClick={confirmAgeVerification}
                className="flex-1 btn-primary text-xs justify-center disabled:opacity-40"
              >
                Confirm & Hand Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
