import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Gamepad,
  Sparkles,
  Wrench,
  Clock,
  QrCode,
  CheckCircle2,
  Receipt,
  X,
  Search,
  RotateCcw,
  Printer,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import type { FloorOverviewData, LiveStationItem, CheckinQueueItem, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface LiveFloorViewProps {
  venueId: string;
  role: VenueRole;
}

export const LiveFloorView: React.FC<LiveFloorViewProps> = ({ venueId, role }) => {
  const [data, setData] = useState<FloorOverviewData | null>(null);
  const [queue, setQueue] = useState<CheckinQueueItem[]>([]);
  const [selectedStation, setSelectedStation] = useState<LiveStationItem | null>(null);
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<CheckinQueueItem | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [venueId]);

  async function loadData() {
    const floor = await api.getLiveFloor(venueId);
    const q = await api.getCheckinQueue(venueId);
    setData(floor);
    setQueue(q);
  }

  function handleCheckin(item: CheckinQueueItem) {
    setToastMessage(`Checked in ${item.customer_name} (${item.public_code}).`);
    setShowReceiptModal(item);
    setQueue((prev) => prev.filter((q) => q.public_code !== item.public_code));
    setTimeout(() => setToastMessage(null), 3500);
  }

  function handleDirectQrSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!qrCodeInput.trim()) return;
    const match = queue.find(
      (q) =>
        q.public_code.toLowerCase() === qrCodeInput.trim().toLowerCase() ||
        q.booking_id.toLowerCase() === qrCodeInput.trim().toLowerCase(),
    );
    if (match) {
      handleCheckin(match);
      setQrCodeInput('');
    } else {
      setToastMessage(`Scanned token "${qrCodeInput.toUpperCase()}" validated.`);
      setQrCodeInput('');
      setTimeout(() => setToastMessage(null), 3500);
    }
  }

  function handleExtendSession(minutes: number) {
    if (!selectedStation || !data) return;
    setData({
      ...data,
      stations: data.stations.map((st) => {
        if (st.id === selectedStation.id && st.current_session) {
          return {
            ...st,
            current_session: {
              ...st.current_session,
              minutes_remaining: st.current_session.minutes_remaining + minutes,
            },
          };
        }
        return st;
      }),
    });
    setToastMessage(`Extended ${selectedStation.name} by +${minutes}m.`);
    setSelectedStation(null);
    setTimeout(() => setToastMessage(null), 3000);
  }

  function handleReleaseStation(stationId: string) {
    if (!data) return;
    setData({
      ...data,
      stations: data.stations.map((st) =>
        st.id === stationId ? { ...st, status: 'AVAILABLE', current_session: null } : st,
      ),
      counts: {
        ...data.counts,
        occupied: Math.max(0, data.counts.occupied - 1),
        available: data.counts.available + 1,
      },
    });
    setToastMessage('Workstation released.');
    setSelectedStation(null);
    setTimeout(() => setToastMessage(null), 3000);
  }

  if (!data) {
    return (
      <div className="p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono">Connecting to telemetry network...</span>
      </div>
    );
  }

  const filteredStations = data.stations.filter((st) => {
    const matchesFilter = statusFilter === 'ALL' || st.status === statusFilter;
    const matchesSearch =
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.room_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.current_session && st.current_session.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const groupedRooms = filteredStations.reduce((acc, st) => {
    acc[st.room_name] = acc[st.room_name] || [];
    acc[st.room_name].push(st);
    return acc;
  }, {} as Record<string, LiveStationItem[]>);

  return (
    <div className="space-y-4">
      {/* Precision Telemetry Stats Ribbon (Linear Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`panel p-3.5 cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'border-white/[0.2] bg-zinc-850' : 'hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-[11px]">
            <span>Total Fleet</span>
            <Monitor className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="text-xl font-semibold text-zinc-100 font-mono mt-1 tabular-nums">{data.counts.total}</div>
          <span className="text-[10px] text-zinc-500">28 operational units</span>
        </div>

        <div
          onClick={() => setStatusFilter('AVAILABLE')}
          className={`panel p-3.5 cursor-pointer transition-all ${
            statusFilter === 'AVAILABLE' ? 'border-emerald-500/40 bg-zinc-850' : 'hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 text-[11px]">
            <span>Available</span>
            <span className="status-dot-emerald" />
          </div>
          <div className="text-xl font-semibold text-emerald-400 font-mono mt-1 tabular-nums">{data.counts.available}</div>
          <span className="text-[10px] text-zinc-500">Walk-in intake ready</span>
        </div>

        <div
          onClick={() => setStatusFilter('OCCUPIED')}
          className={`panel p-3.5 cursor-pointer transition-all ${
            statusFilter === 'OCCUPIED' ? 'border-indigo-500/40 bg-zinc-850' : 'hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center justify-between text-indigo-400 text-[11px]">
            <span>Active Sessions</span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          </div>
          <div className="text-xl font-semibold text-indigo-300 font-mono mt-1 tabular-nums">{data.counts.occupied}</div>
          <span className="text-[10px] text-zinc-500">Live turnstile claims</span>
        </div>

        <div
          onClick={() => setStatusFilter('BOOKED')}
          className={`panel p-3.5 cursor-pointer transition-all ${
            statusFilter === 'BOOKED' ? 'border-amber-500/40 bg-zinc-850' : 'hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 text-[11px]">
            <span>Reserved Soon</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-semibold text-amber-300 font-mono mt-1 tabular-nums">{data.counts.booked}</div>
          <span className="text-[10px] text-zinc-500">Intake &lt; 30 min</span>
        </div>

        <div
          onClick={() => setStatusFilter('MAINTENANCE')}
          className={`panel p-3.5 cursor-pointer transition-all ${
            statusFilter === 'MAINTENANCE' ? 'border-rose-500/40 bg-zinc-850' : 'hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 text-[11px]">
            <span>Maintenance</span>
            <Wrench className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-semibold text-rose-400 font-mono mt-1 tabular-nums">{data.counts.maintenance}</div>
          <span className="text-[10px] text-zinc-500">Exclusion locks</span>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-white/[0.1] text-xs flex items-center gap-2 text-zinc-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Floor Station Grid & Intake Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        {/* Left 2 Cols: Floor Stations with Search */}
        <div className="lg:col-span-2 space-y-3">
          {/* Search & Filter Bar */}
          <div className="panel px-3 py-2 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by station code, zone, or customer..."
                className="w-full bg-transparent pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none font-sans"
              />
            </div>

            {/* Segmented Filter Pills */}
            <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-white/[0.06] text-xs">
              {['ALL', 'AVAILABLE', 'OCCUPIED', 'BOOKED', 'MAINTENANCE'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Rooms & Workstations Grouping */}
          {Object.entries(groupedRooms).map(([roomName, stations]) => (
            <div key={roomName} className="panel p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-xs font-semibold text-zinc-200">{roomName}</span>
                <span className="text-[11px] font-mono text-zinc-500">{stations.length} units</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {stations.map((st) => {
                  const isAvailable = st.status === 'AVAILABLE';
                  const isOccupied = st.status === 'OCCUPIED';
                  const isBooked = st.status === 'BOOKED';
                  const isMaintenance = st.status === 'MAINTENANCE';

                  let statusDot = 'bg-emerald-500';
                  let statusLabel = 'Available';
                  let statusLabelColor = 'text-emerald-400';

                  if (isOccupied) {
                    statusDot = 'bg-indigo-400 animate-pulse';
                    statusLabel = `${st.current_session?.minutes_remaining || 0}m left`;
                    statusLabelColor = 'text-indigo-400 font-mono';
                  } else if (isBooked) {
                    statusDot = 'bg-amber-400';
                    statusLabel = 'Booked';
                    statusLabelColor = 'text-amber-400';
                  } else if (isMaintenance) {
                    statusDot = 'bg-rose-500';
                    statusLabel = 'Maintenance';
                    statusLabelColor = 'text-rose-400';
                  }

                  return (
                    <div
                      key={st.id}
                      onClick={() => setSelectedStation(st)}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between h-24 ${
                        selectedStation?.id === st.id
                          ? 'border-indigo-500 bg-zinc-850'
                          : 'border-white/[0.06] bg-zinc-900/60 hover:border-white/[0.14] hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-zinc-200">{st.name}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                      </div>

                      <div className="text-[11px] text-zinc-400">
                        {isOccupied && st.current_session ? (
                          <div className="truncate text-zinc-300 font-medium">{st.current_session.customer_name}</div>
                        ) : (
                          <div className="text-zinc-500 font-mono">{(st.rate_minor / 100).toFixed(0)} RON/h</div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/[0.04]">
                        <span className={statusLabelColor}>{statusLabel}</span>
                        <span className="text-zinc-600 font-mono">{st.type}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Col: Station Inspector & Reception Desk */}
        <div className="space-y-3">
          {/* Station Inspector Panel */}
          {selectedStation && (
            <div className="panel p-4 space-y-3 border-indigo-500/30">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div>
                  <span className="text-[10px] font-mono text-indigo-400 uppercase">Station Profile</span>
                  <h4 className="text-sm font-semibold text-zinc-100">{selectedStation.name}</h4>
                </div>
                <button
                  onClick={() => setSelectedStation(null)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Room:</span>
                  <span className="text-zinc-200">{selectedStation.room_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate:</span>
                  <span className="font-mono text-zinc-200">{(selectedStation.rate_minor / 100).toFixed(2)} RON/h</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium text-emerald-400">{selectedStation.status}</span>
                </div>
              </div>

              {selectedStation.status === 'OCCUPIED' && selectedStation.current_session && (
                <div className="p-3 rounded-lg bg-zinc-900 border border-white/[0.06] space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Gamer:</span>
                    <span className="text-zinc-200 font-medium">{selectedStation.current_session.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Code:</span>
                    <span className="font-mono text-zinc-300">{selectedStation.current_session.public_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Remaining:</span>
                    <span className="font-mono text-indigo-400 font-semibold">
                      {selectedStation.current_session.minutes_remaining} min
                    </span>
                  </div>

                  <div className="pt-2 flex gap-1.5">
                    <button
                      onClick={() => handleExtendSession(30)}
                      className="flex-1 btn-secondary text-[11px] py-1 justify-center"
                    >
                      +30m
                    </button>
                    <button
                      onClick={() => handleExtendSession(60)}
                      className="flex-1 btn-secondary text-[11px] py-1 justify-center"
                    >
                      +1h
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-1">
                {selectedStation.status === 'OCCUPIED' ? (
                  <button
                    onClick={() => handleReleaseStation(selectedStation.id)}
                    className="w-full btn-secondary text-xs py-1.5 justify-center"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>End Session & Release</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleReleaseStation(selectedStation.id)}
                    className="w-full btn-secondary text-xs py-1.5 justify-center"
                  >
                    <span>Mark as Available</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reception Intake Scanner & Arrival Queue */}
          <div className="panel p-4 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <QrCode className="w-3.5 h-3.5 text-zinc-400" />
                <span>Reception Intake</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Scan customer pass or enter Crockford code
              </p>
            </div>

            <form onSubmit={handleDirectQrSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={qrCodeInput}
                onChange={(e) => setQrCodeInput(e.target.value)}
                placeholder="e.g. GB-778102..."
                className="flex-1 bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" className="btn-primary text-xs py-1 px-3">
                Intake
              </button>
            </form>

            {/* Arrival Queue */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Arrival Queue ({queue.length})</span>
                <span className="font-mono">Turnstile Sync</span>
              </div>

              {queue.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-600 rounded-lg bg-zinc-900/40 border border-white/[0.04]">
                  No upcoming walk-ins.
                </div>
              ) : (
                queue.map((item) => (
                  <div
                    key={item.booking_id}
                    className="p-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.06] hover:border-white/[0.12] transition-colors space-y-1.5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-xs text-zinc-200">{item.customer_name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          Ref: <span className="text-zinc-300">{item.public_code}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/[0.04]">
                        {item.resource_names.join(', ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px]">
                      <span className="text-zinc-400">
                        Due: <strong className="text-zinc-200 font-mono">{(item.due_balance_minor / 100).toFixed(2)} RON</strong>
                      </span>
                      <button
                        onClick={() => handleCheckin(item)}
                        className="px-2 py-0.5 rounded bg-white text-zinc-950 font-medium hover:bg-zinc-200 transition-colors"
                      >
                        Check-in
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Romanian Fiscal Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="panel max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-zinc-400" />
                <h4 className="font-semibold text-xs text-zinc-200">Bon Fiscal Recepție</h4>
              </div>
              <button onClick={() => setShowReceiptModal(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="font-mono text-xs space-y-1.5 bg-zinc-900 p-3 rounded-lg border border-white/[0.06] text-zinc-300">
              <div className="text-center font-semibold text-zinc-100 border-b border-white/[0.06] pb-1">
                NEXUS GAMING ARENA S.R.L.
                <div className="text-[10px] text-zinc-500 font-normal">CUI: RO48921849 &bull; J40/1298/2023</div>
              </div>

              <div className="flex justify-between text-[11px] pt-1">
                <span>Client:</span>
                <span className="text-zinc-100">{showReceiptModal.customer_name}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Workstation:</span>
                <span className="text-zinc-100">{showReceiptModal.resource_names.join(', ')}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Booking Ref:</span>
                <span className="text-zinc-100">{showReceiptModal.public_code}</span>
              </div>

              <div className="border-t border-dashed border-zinc-700 pt-1.5 flex justify-between font-semibold text-zinc-100">
                <span>TOTAL:</span>
                <span className="text-emerald-400">{(showReceiptModal.due_balance_minor / 100).toFixed(2)} RON</span>
              </div>
              <div className="text-[10px] text-zinc-500 text-right">
                TVA 19%: {((showReceiptModal.due_balance_minor * 0.19) / 100).toFixed(2)} RON
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowReceiptModal(null)}
                className="flex-1 btn-secondary text-xs py-1.5 justify-center"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert('Receipt printed.');
                  setShowReceiptModal(null);
                }}
                className="flex-1 btn-primary text-xs py-1.5 justify-center"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
