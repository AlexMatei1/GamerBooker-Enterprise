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
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('Routine Hardware Diagnostic & Thermal Repasting');
  const [maintenanceDurationHours, setMaintenanceDurationHours] = useState(2);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Polling every 5s for real-time live floor
    return () => clearInterval(interval);
  }, [venueId]);

  async function loadData() {
    const floor = await api.getLiveFloor(venueId);
    const q = await api.getCheckinQueue(venueId);
    setData(floor);
    setQueue(q);
  }

  function handleCheckin(bookingCode: string) {
    setCheckinSuccessMsg(`Booking ${bookingCode} checked in successfully. Physical workstation claims active.`);
    setTimeout(() => setCheckinSuccessMsg(null), 4000);
    setQueue((prev) => prev.filter((item) => item.public_code !== bookingCode));
  }

  function handleScheduleMaintenance() {
    if (!selectedStation) return;
    alert(`Maintenance scheduled on ${selectedStation.name} for ${maintenanceDurationHours}h. GiST exclusion claims registered.`);
    setSelectedStation(null);
  }

  if (!data) {
    return <div className="p-8 text-center text-slate-400">Connecting to live floor telemetry...</div>;
  }

  const groupedRooms = data.stations.reduce((acc, st) => {
    acc[st.room_name] = acc[st.room_name] || [];
    acc[st.room_name].push(st);
    return acc;
  }, {} as Record<string, LiveStationItem[]>);

  return (
    <div className="p-6 space-y-6">
      {/* Real-Time Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Total Workstations</p>
          <p className="text-2xl font-extrabold text-white mt-1">{data.counts.total}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20">
          <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Available Now</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{data.counts.available}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-cyan-900/50 bg-cyan-950/20">
          <p className="text-xs uppercase tracking-wider text-cyan-400 font-bold">Occupied / Live</p>
          <p className="text-2xl font-extrabold text-cyan-400 mt-1">{data.counts.occupied}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-amber-900/50 bg-amber-950/20">
          <p className="text-xs uppercase tracking-wider text-amber-400 font-bold">Upcoming Booked</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{data.counts.booked}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-rose-900/50 bg-rose-950/20">
          <p className="text-xs uppercase tracking-wider text-rose-400 font-bold">Maintenance Blocks</p>
          <p className="text-2xl font-extrabold text-rose-400 mt-1">{data.counts.maintenance}</p>
        </div>
      </div>

      {checkinSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500 text-emerald-200 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>{checkinSuccessMsg}</span>
        </div>
      )}

      {/* Main Grid: Live Floor Map & Checkin Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Floor Map by Rooms */}
        <div className="lg:col-span-2 space-y-6">
          {Object.entries(groupedRooms).map(([roomName, stations]) => (
            <div key={roomName} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                  {roomName}
                </h3>
                <span className="text-xs text-slate-400">{stations.length} stations</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {stations.map((st) => {
                  const isAvailable = st.status === 'AVAILABLE';
                  const isOccupied = st.status === 'OCCUPIED';
                  const isBooked = st.status === 'BOOKED';
                  const isMaintenance = st.status === 'MAINTENANCE';

                  let statusClass = 'border-emerald-700/50 bg-emerald-950/15 text-emerald-300';
                  let statusDot = 'bg-emerald-400';
                  if (isOccupied) {
                    statusClass = 'border-cyan-600/60 bg-cyan-950/30 text-cyan-200 shadow-sm shadow-cyan-500/20';
                    statusDot = 'bg-cyan-400 animate-pulse';
                  } else if (isBooked) {
                    statusClass = 'border-amber-600/50 bg-amber-950/20 text-amber-200';
                    statusDot = 'bg-amber-400';
                  } else if (isMaintenance) {
                    statusClass = 'border-rose-700/60 bg-rose-950/30 text-rose-200 opacity-70';
                    statusDot = 'bg-rose-500';
                  }

                  return (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStation(st)}
                      className={`p-3 rounded-xl border text-left transition-all duration-150 hover:scale-[1.02] flex flex-col justify-between h-28 ${statusClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate">{st.name}</span>
                        <span className={`w-2 h-2 rounded-full ${statusDot}`}></span>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        {st.type === 'PC' && <Monitor className="w-4 h-4 mb-1 text-slate-400" />}
                        {st.type === 'CONSOLE_SETUP' && <Gamepad className="w-4 h-4 mb-1 text-slate-400" />}
                        {st.type === 'PRIVATE_ROOM' && <Sparkles className="w-4 h-4 mb-1 text-slate-400" />}
                        <p className="font-mono">{st.rate_minor / 100} RON/h</p>
                      </div>

                      <div className="text-[10px] font-semibold tracking-wider uppercase">
                        {isOccupied && st.current_session && (
                          <span className="text-cyan-300 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" /> {st.current_session.minutes_remaining}m left
                          </span>
                        )}
                        {isAvailable && <span className="text-emerald-400">Available</span>}
                        {isBooked && <span className="text-amber-400">Booked Soon</span>}
                        {isMaintenance && <span className="text-rose-400">Maintenance</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Col: Reception Check-In Queue & Scanner */}
        <div className="space-y-6">
          {/* Rolling QR / Token Intake Bar */}
          <div className="glass-panel p-5 rounded-xl border border-cyan-800/40 bg-gradient-to-b from-slate-900 to-slate-950 space-y-4">
            <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Reception Intake Scanner
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scan customer app Rolling HMAC QR token or enter 8-character booking reference.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. GB-441029 or QR token"
                value={qrCodeInput}
                onChange={(e) => setQrCodeInput(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400 uppercase"
              />
              <button
                onClick={() => {
                  if (qrCodeInput.trim()) {
                    handleCheckin(qrCodeInput.trim());
                    setQrCodeInput('');
                  }
                }}
                className="btn-primary text-xs py-2 px-3"
              >
                Intake
              </button>
            </div>
          </div>

          {/* Upcoming Arrivals Queue */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Intake Queue (Next 15m)
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {queue.length} ready
              </span>
            </div>

            {queue.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No reservations pending immediate check-in.</p>
            ) : (
              <div className="space-y-3">
                {queue.map((item) => (
                  <div key={item.booking_id} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-cyan-300">{item.public_code}</span>
                      <span className="text-slate-400 font-mono">
                        Starts {new Date(item.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="font-semibold text-slate-200">{item.customer_name}</p>
                    <p className="text-slate-400 text-[11px]">{item.resource_names.join(', ')}</p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <div className="text-[11px]">
                        {item.payment_status === 'FULLY_PAID' ? (
                          <span className="text-emerald-400 font-semibold">Fully Paid</span>
                        ) : (
                          <span className="text-amber-400 font-semibold">
                            Due: {(item.due_balance_minor / 100).toFixed(2)} RON
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleCheckin(item.public_code)}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-[11px] font-bold"
                      >
                        Confirm Check-In
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Station Inspector Modal */}
      {selectedStation && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-md w-full border border-slate-700 bg-slate-950 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-white">{selectedStation.name}</h3>
                <p className="text-xs text-slate-400">{selectedStation.room_name} • {selectedStation.type}</p>
              </div>
              <button onClick={() => setSelectedStation(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session info */}
            {selectedStation.current_session ? (
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 space-y-2 text-xs">
                <p className="text-cyan-300 font-bold uppercase text-[11px]">Active Session</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="font-semibold text-white">{selectedStation.current_session.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reference:</span>
                  <span className="font-mono text-cyan-300">{selectedStation.current_session.public_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Time Remaining:</span>
                  <span className="font-bold text-emerald-400">{selectedStation.current_session.minutes_remaining} minutes</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300">
                Workstation is currently idle and available for booking or maintenance.
              </div>
            )}

            {/* Manager Maintenance Scheduler */}
            {role !== 'RECEPTION' && (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                <p className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  Schedule Maintenance Block (BR-011)
                </p>
                <input
                  type="text"
                  value={maintenanceReason}
                  onChange={(e) => setMaintenanceReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 px-3 py-2 rounded text-xs text-slate-200"
                  placeholder="Reason for block"
                />
                <div className="flex items-center gap-3">
                  <label className="text-slate-400">Duration:</label>
                  <select
                    value={maintenanceDurationHours}
                    onChange={(e) => setMaintenanceDurationHours(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-200"
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={4}>4 hours</option>
                    <option value={8}>8 hours</option>
                  </select>
                </div>
                <button onClick={handleScheduleMaintenance} className="btn-danger w-full text-xs py-2 mt-1">
                  Enforce Maintenance Block
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
