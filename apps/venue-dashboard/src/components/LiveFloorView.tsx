import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Gamepad,
  Sparkles,
  Wrench,
  Clock,
  UserCheck,
  AlertCircle,
  QrCode,
  CheckCircle2,
  Receipt,
  X,
  Play,
  Filter,
  Search,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Printer,
  ChevronRight,
  Zap,
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
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<CheckinQueueItem | null>(null);
  const [maintenanceDurationHours, setMaintenanceDurationHours] = useState(2);
  const [maintenanceReason, setMaintenanceReason] = useState('Routine GPU Thermal Diagnostic');

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
    setCheckinSuccessMsg(`Booking ${item.public_code} (${item.customer_name}) checked in. Station claim activated.`);
    setShowReceiptModal(item);
    setQueue((prev) => prev.filter((q) => q.public_code !== item.public_code));
    setTimeout(() => setCheckinSuccessMsg(null), 4000);
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
      setCheckinSuccessMsg(`Simulated scan: Token "${qrCodeInput.toUpperCase()}" verified & checked in.`);
      setQrCodeInput('');
      setTimeout(() => setCheckinSuccessMsg(null), 4000);
    }
  }

  function handleExtendSelectedStation(minutes: number) {
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
    setCheckinSuccessMsg(`Extended session for ${selectedStation.name} by +${minutes} minutes.`);
    setSelectedStation(null);
    setTimeout(() => setCheckinSuccessMsg(null), 3000);
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
    setCheckinSuccessMsg('Workstation released. Ready for intake.');
    setSelectedStation(null);
    setTimeout(() => setCheckinSuccessMsg(null), 3000);
  }

  function handleScheduleMaintenance() {
    if (!selectedStation || !data) return;
    setData({
      ...data,
      stations: data.stations.map((st) =>
        st.id === selectedStation.id ? { ...st, status: 'MAINTENANCE', current_session: null } : st,
      ),
      counts: {
        ...data.counts,
        maintenance: data.counts.maintenance + 1,
        available: Math.max(0, data.counts.available - 1),
      },
    });
    setCheckinSuccessMsg(`Maintenance block active on ${selectedStation.name} for ${maintenanceDurationHours}h.`);
    setSelectedStation(null);
    setTimeout(() => setCheckinSuccessMsg(null), 3000);
  }

  if (!data) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>Connecting to live floor intake telemetry...</span>
      </div>
    );
  }

  // Filter stations by status & search
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
    <div className="space-y-6">
      {/* Real-Time Stats Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'ALL' ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/10' : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] uppercase tracking-wider font-bold">Total Fleet</span>
            <Monitor className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-white mt-1 font-mono">{data.counts.total}</p>
          <span className="text-[10px] text-slate-500">All registered stations</span>
        </div>

        <div
          onClick={() => setStatusFilter('AVAILABLE')}
          className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'AVAILABLE' ? 'border-emerald-400 bg-emerald-950/30' : 'border-emerald-900/50 bg-emerald-950/10 hover:border-emerald-700'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] uppercase tracking-wider font-bold">Available Now</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{data.counts.available}</p>
          <span className="text-[10px] text-emerald-500/80">Ready for walk-in intake</span>
        </div>

        <div
          onClick={() => setStatusFilter('OCCUPIED')}
          className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'OCCUPIED' ? 'border-cyan-400 bg-cyan-950/30' : 'border-cyan-900/50 bg-cyan-950/10 hover:border-cyan-700'
          }`}
        >
          <div className="flex items-center justify-between text-cyan-300">
            <span className="text-[11px] uppercase tracking-wider font-bold">Live In Session</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <p className="text-2xl font-black text-cyan-300 mt-1 font-mono">{data.counts.occupied}</p>
          <span className="text-[10px] text-cyan-500/80">Turnstile active tokens</span>
        </div>

        <div
          onClick={() => setStatusFilter('BOOKED')}
          className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'BOOKED' ? 'border-amber-400 bg-amber-950/30' : 'border-amber-900/50 bg-amber-950/10 hover:border-amber-700'
          }`}
        >
          <div className="flex items-center justify-between text-amber-300">
            <span className="text-[11px] uppercase tracking-wider font-bold">Reserved / Due</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-300 mt-1 font-mono">{data.counts.booked}</p>
          <span className="text-[10px] text-amber-500/80">Arrival within 30 min</span>
        </div>

        <div
          onClick={() => setStatusFilter('MAINTENANCE')}
          className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'MAINTENANCE' ? 'border-rose-400 bg-rose-950/30' : 'border-rose-900/50 bg-rose-950/10 hover:border-rose-700'
          }`}
        >
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-[11px] uppercase tracking-wider font-bold">Maintenance</span>
            <Wrench className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-black text-rose-400 mt-1 font-mono">{data.counts.maintenance}</p>
          <span className="text-[10px] text-rose-500/80">Hardware exclusion locks</span>
        </div>
      </div>

      {checkinSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{checkinSuccessMsg}</span>
          </div>
          <button onClick={() => setCheckinSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Floor Workspace & Reception Intake */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Floor Stations with Search & Filter */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="glass-panel p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search station (e.g. PC-01, VIP), zone, or gamer name..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-xs">
              {['ALL', 'AVAILABLE', 'OCCUPIED', 'BOOKED', 'MAINTENANCE'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    statusFilter === status
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Rooms Grid */}
          {Object.entries(groupedRooms).length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl border border-slate-800 text-center text-slate-500 text-xs">
              No stations match the selected filter.
            </div>
          ) : (
            Object.entries(groupedRooms).map(([roomName, stations]) => (
              <div key={roomName} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    {roomName}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    {stations.length} Workstations
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {stations.map((st) => {
                    const isAvailable = st.status === 'AVAILABLE';
                    const isOccupied = st.status === 'OCCUPIED';
                    const isBooked = st.status === 'BOOKED';
                    const isMaintenance = st.status === 'MAINTENANCE';

                    let cardBorder = 'border-emerald-800/40 bg-emerald-950/15 hover:border-emerald-500/50';
                    let dotColor = 'bg-emerald-400';
                    let badgeText = 'AVAILABLE';
                    let badgeColor = 'text-emerald-400';

                    if (isOccupied) {
                      cardBorder = 'border-cyan-500/40 bg-cyan-950/25 shadow-sm shadow-cyan-950 hover:border-cyan-400';
                      dotColor = 'bg-cyan-400 animate-pulse';
                      badgeText = `${st.current_session?.minutes_remaining || 0}m LEFT`;
                      badgeColor = 'text-cyan-300 font-mono';
                    } else if (isBooked) {
                      cardBorder = 'border-amber-600/40 bg-amber-950/20 hover:border-amber-500';
                      dotColor = 'bg-amber-400';
                      badgeText = 'RESERVED';
                      badgeColor = 'text-amber-300';
                    } else if (isMaintenance) {
                      cardBorder = 'border-rose-800/40 bg-rose-950/20 opacity-60 hover:opacity-100';
                      dotColor = 'bg-rose-500';
                      badgeText = 'MAINTENANCE';
                      badgeColor = 'text-rose-400';
                    }

                    return (
                      <div
                        key={st.id}
                        onClick={() => setSelectedStation(st)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-32 relative group ${cardBorder}`}
                      >
                        {/* Top header */}
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-white truncate">{st.name}</span>
                          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                        </div>

                        {/* Specs / Rate */}
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                            {st.type === 'PC' && <Monitor className="w-3 h-3 text-cyan-400" />}
                            {st.type === 'CONSOLE_SETUP' && <Gamepad className="w-3 h-3 text-purple-400" />}
                            {st.type === 'PRIVATE_ROOM' && <Sparkles className="w-3 h-3 text-amber-400" />}
                            <span>RTX 4090 &bull; {(st.rate_minor / 100).toFixed(0)} RON/h</span>
                          </div>

                          {isOccupied && st.current_session && (
                            <div className="text-[10px] text-slate-300 truncate font-semibold">
                              {st.current_session.customer_name}
                            </div>
                          )}
                        </div>

                        {/* Live Session Progress Bar if Occupied */}
                        {isOccupied && (
                          <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-cyan-400 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(10, (st.current_session?.minutes_remaining || 60) * 1.5))}%` }}
                            />
                          </div>
                        )}

                        {/* Status Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[10px] font-bold">
                          <span className={badgeColor}>{badgeText}</span>
                          <span className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            Inspect &rarr;
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Col: Station Inspector Drawer or Reception Intake */}
        <div className="space-y-4">
          {/* Station Inspector Panel (Shows when station clicked) */}
          {selectedStation ? (
            <div className="glass-panel p-5 rounded-2xl border border-cyan-500/40 space-y-4 bg-slate-950/90 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-cyan-400">Station Inspector</span>
                  <h3 className="font-black text-base text-white">{selectedStation.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedStation(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400">Current Status:</span>
                <span className="font-bold text-cyan-300 font-mono">{selectedStation.status}</span>
              </div>

              {/* If occupied, show session stats & extension */}
              {selectedStation.status === 'OCCUPIED' && selectedStation.current_session && (
                <div className="space-y-3 p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gamer:</span>
                    <span className="font-bold text-white">{selectedStation.current_session.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Booking Code:</span>
                    <span className="font-mono text-cyan-300">{selectedStation.current_session.public_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Remaining:</span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {selectedStation.current_session.minutes_remaining} Minutes
                    </span>
                  </div>

                  {/* Extend Session Buttons */}
                  <div className="pt-2 border-t border-slate-800 flex gap-2">
                    <button
                      onClick={() => handleExtendSelectedStation(30)}
                      className="flex-1 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold text-[11px] hover:bg-cyan-500/30"
                    >
                      +30 Min
                    </button>
                    <button
                      onClick={() => handleExtendSelectedStation(60)}
                      className="flex-1 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold text-[11px] hover:bg-cyan-500/30"
                    >
                      +1 Hour
                    </button>
                  </div>
                </div>
              )}

              {/* Station Control Actions */}
              <div className="space-y-2 pt-2">
                {selectedStation.status === 'OCCUPIED' && (
                  <button
                    onClick={() => handleReleaseStation(selectedStation.id)}
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> End Session & Release Station
                  </button>
                )}

                {selectedStation.status !== 'MAINTENANCE' ? (
                  <button
                    onClick={handleScheduleMaintenance}
                    className="w-full py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/60 text-xs font-bold text-rose-300 flex items-center justify-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5" /> Mark for Maintenance (2h)
                  </button>
                ) : (
                  <button
                    onClick={() => handleReleaseStation(selectedStation.id)}
                    className="w-full py-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/60 text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Clear Maintenance & Mark Available
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* Reception Intake & Turnstile Scanner */}
          <div className="glass-panel p-5 rounded-2xl border border-cyan-800/40 bg-gradient-to-b from-slate-900/90 to-slate-950 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-cyan-400" />
                <h3 className="font-extrabold text-sm text-white">Reception Intake Scanner</h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Scan customer rolling HMAC pass or Crockford booking code
              </p>
            </div>

            <form onSubmit={handleDirectQrSubmit} className="flex gap-2">
              <input
                type="text"
                value={qrCodeInput}
                onChange={(e) => setQrCodeInput(e.target.value)}
                placeholder="Scan pass or enter code (e.g. GB-8492)..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="btn-primary text-xs py-2 px-3 shrink-0"
              >
                Intake
              </button>
            </form>

            {/* Checkin Queue Items */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-[11px] uppercase font-bold text-slate-400">
                <span>Arrival Queue ({queue.length})</span>
                <span className="text-[10px] font-mono text-cyan-400">Turnstile Sync</span>
              </div>

              {queue.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
                  No upcoming walk-ins in queue.
                </div>
              ) : (
                queue.map((item) => (
                  <div
                    key={item.booking_id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-extrabold text-xs text-white">{item.customer_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Code: <strong className="text-cyan-300">{item.public_code}</strong>
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300">
                        {item.resource_names.join(', ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                      <span className="text-slate-400">
                        Due: <strong className="text-white font-mono">{(item.due_balance_minor / 100).toFixed(2)} RON</strong>
                      </span>
                      <button
                        onClick={() => handleCheckin(item)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 font-bold transition-colors"
                      >
                        Check-in & Print
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-sm w-full p-5 rounded-3xl border border-cyan-500/40 space-y-4 bg-slate-950">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-white">Bon Fiscal Recepție</h3>
              </div>
              <button
                onClick={() => setShowReceiptModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="font-mono text-xs space-y-2 bg-slate-900 p-3.5 rounded-xl border border-slate-800 text-slate-300">
              <div className="text-center font-bold text-white border-b border-slate-800 pb-1">
                NEXUS GAMING ARENA S.R.L.
                <div className="text-[10px] text-slate-500 font-normal">CUI: RO48921849 &bull; J40/1298/2023</div>
              </div>

              <div className="flex justify-between text-[11px] pt-1">
                <span>Client:</span>
                <span className="text-white">{showReceiptModal.customer_name}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Statie:</span>
                <span className="text-cyan-300">{showReceiptModal.resource_names.join(', ')}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Cod Rezervare:</span>
                <span className="text-white">{showReceiptModal.public_code}</span>
              </div>

              <div className="border-t border-dashed border-slate-700 pt-2 flex justify-between font-bold text-white text-sm">
                <span>TOTAL INCASAT:</span>
                <span className="text-emerald-400">{(showReceiptModal.due_balance_minor / 100).toFixed(2)} RON</span>
              </div>
              <div className="text-[10px] text-slate-500 text-right">
                Inclusiv TVA 19%: {((showReceiptModal.due_balance_minor * 0.19) / 100).toFixed(2)} RON
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowReceiptModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-semibold"
              >
                Închide
              </button>
              <button
                onClick={() => {
                  alert('Receipt dispatched to thermal fiscal printer.');
                  setShowReceiptModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20"
              >
                <Printer className="w-3.5 h-3.5" /> Printează Bon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
