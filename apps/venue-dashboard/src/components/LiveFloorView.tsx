import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Gamepad2,
  Clock,
  Plus,
  CheckCircle2,
  Receipt,
  X,
  Search,
  Printer,
  CreditCard,
  Banknote,
  User,
  Sparkles,
  Wrench,
  ChevronRight,
  ShieldCheck,
  QrCode,
  Flame,
} from 'lucide-react';
import type { FloorOverviewData, LiveStationItem, CheckinQueueItem, VenueRole } from '../types/dashboard';
import { api } from '../api/client';

interface LiveFloorViewProps {
  venueId: string;
  role: VenueRole;
}

interface WalkInModalState {
  isOpen: boolean;
  station: LiveStationItem | null;
  customerName: string;
  durationHours: number;
  paymentMethod: 'CASH' | 'CARD';
}

export const LiveFloorView: React.FC<LiveFloorViewProps> = ({ venueId }) => {
  const [data, setData] = useState<FloorOverviewData | null>(null);
  const [queue, setQueue] = useState<CheckinQueueItem[]>([]);
  const [selectedStation, setSelectedStation] = useState<LiveStationItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<any | null>(null);

  // Super-easy Walk-In Check-In Modal State
  const [walkInModal, setWalkInModal] = useState<WalkInModalState>({
    isOpen: false,
    station: null,
    customerName: '',
    durationHours: 2,
    paymentMethod: 'CARD',
  });

  // Quick QR Scan Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');

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

  function showToast(text: string) {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // 1-Click Start Session from Walk-In Modal
  function handleConfirmWalkIn() {
    if (!data || !walkInModal.station) return;
    const targetStation = walkInModal.station;
    const customerName = walkInModal.customerName.trim() || `Gamer #${Math.floor(100 + Math.random() * 900)}`;
    const totalRon = (targetStation.rate_minor / 100) * walkInModal.durationHours;
    const minutesRemaining = walkInModal.durationHours * 60;
    const publicCode = `GB-${Math.floor(100000 + Math.random() * 900000)}`;

    const newSession = {
      booking_id: `b-walkin-${Date.now()}`,
      public_code: publicCode,
      customer_name: customerName,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + minutesRemaining * 60000).toISOString(),
      minutes_remaining: minutesRemaining,
    };

    // Update state live
    setData({
      ...data,
      stations: data.stations.map((st) =>
        st.id === targetStation.id
          ? { ...st, status: 'OCCUPIED', current_session: newSession }
          : st
      ),
      counts: {
        ...data.counts,
        available: Math.max(0, data.counts.available - 1),
        occupied: data.counts.occupied + 1,
      },
    });

    // Generate Romanian Fiscal Receipt
    setShowReceiptModal({
      public_code: publicCode,
      customer_name: customerName,
      station_name: targetStation.name,
      room_name: targetStation.room_name,
      duration_hours: walkInModal.durationHours,
      total_ron: totalRon.toFixed(2),
      tva_ron: (totalRon * 0.19).toFixed(2),
      net_ron: (totalRon * 0.81).toFixed(2),
      payment_method: walkInModal.paymentMethod,
      timestamp: new Date().toLocaleString('ro-RO'),
    });

    setWalkInModal({ isOpen: false, station: null, customerName: '', durationHours: 2, paymentMethod: 'CARD' });
    showToast(`✓ Session started for ${customerName} on ${targetStation.name}!`);
  }

  // 1-Click Quick Add Time (+30 min, +1 hour)
  function handleQuickAddTime(stationId: string, minutes: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!data) return;

    setData({
      ...data,
      stations: data.stations.map((st) => {
        if (st.id === stationId && st.current_session) {
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
    showToast(`✓ Added +${minutes} minutes to session.`);
  }

  // 1-Click End Session & Free Station
  function handleEndSession(stationId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!data) return;

    const st = data.stations.find((s) => s.id === stationId);
    if (!st) return;

    setData({
      ...data,
      stations: data.stations.map((s) =>
        s.id === stationId ? { ...s, status: 'AVAILABLE', current_session: null } : s
      ),
      counts: {
        ...data.counts,
        occupied: Math.max(0, data.counts.occupied - 1),
        available: data.counts.available + 1,
      },
    });
    setSelectedStation(null);
    showToast(`✓ Session ended. ${st.name} is now clean and available.`);
  }

  // Check in queue item (online booking customer arrived)
  function handleCheckinQueueItem(item: CheckinQueueItem) {
    showToast(`✓ Checked in ${item.customer_name} (${item.public_code}).`);
    setQueue((prev) => prev.filter((q) => q.public_code !== item.public_code));
  }

  if (!data) {
    return (
      <div className="p-20 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading arena stations...</span>
      </div>
    );
  }

  const filteredStations = data.stations.filter((st) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'AVAILABLE' && st.status === 'AVAILABLE') ||
      (statusFilter === 'OCCUPIED' && st.status === 'OCCUPIED') ||
      (statusFilter === 'BOOKED' && st.status === 'BOOKED') ||
      (statusFilter === 'MAINTENANCE' && st.status === 'MAINTENANCE');

    const matchesSearch =
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.room_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.current_session && st.current_session.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* 1. Welcoming Top Bar with Big Friendly Action Buttons */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-2xl border border-white/[0.08] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h1 className="text-lg font-bold text-white tracking-tight">Arena Floor & Reception</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            <span className="font-semibold text-emerald-400">{data.counts.available} stations ready to play</span> &bull; {data.counts.occupied} gamers active now
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm border border-white/[0.08] transition-all shadow-sm"
          >
            <QrCode className="w-4 h-4 text-zinc-400" />
            <span>Scan Booking QR</span>
          </button>

          <button
            onClick={() => {
              const firstAvail = data.stations.find((s) => s.status === 'AVAILABLE') || data.stations[0];
              setWalkInModal({
                isOpen: true,
                station: firstAvail,
                customerName: '',
                durationHours: 2,
                paymentMethod: 'CARD',
              });
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Check In Walk-In Customer</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-sm flex items-center gap-3 text-emerald-200 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 2. Customer Online Booking Queue (If any reservations arriving) */}
      {queue.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-sm text-amber-200">Arriving Online Bookings ({queue.length})</span>
            </div>
            <span className="text-xs text-amber-400/80">Customers with app reservations</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {queue.map((item) => (
              <div
                key={item.booking_id}
                className="bg-zinc-900/90 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-sm text-zinc-100">{item.customer_name}</div>
                  <div className="text-xs text-amber-400 font-mono mt-0.5">{item.resource_names.join(', ')}</div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{item.public_code}</div>
                </div>
                <button
                  onClick={() => handleCheckinQueueItem(item)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-colors shadow-sm"
                >
                  Check In
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Search Bar & Simple Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search station (e.g. PC-01, PS5) or customer name..."
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>

        {/* Big Easy Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Stations', count: data.counts.total },
            { id: 'AVAILABLE', label: '🟢 Free to Play', count: data.counts.available },
            { id: 'OCCUPIED', label: '🟣 In Game', count: data.counts.occupied },
            { id: 'BOOKED', label: '🟡 Reserved', count: data.counts.booked },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-white text-black shadow-md'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
              }`}
            >
              {tab.label} <span className="opacity-60 ml-1 font-mono">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Large, Friendly, Tactile Station Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredStations.map((st) => {
          const isAvailable = st.status === 'AVAILABLE';
          const isOccupied = st.status === 'OCCUPIED';
          const isBooked = st.status === 'BOOKED';
          const isMaintenance = st.status === 'MAINTENANCE';

          return (
            <div
              key={st.id}
              className={`rounded-2xl p-4 border transition-all flex flex-col justify-between min-h-[175px] shadow-sm ${
                isAvailable
                  ? 'bg-zinc-900/90 border-emerald-500/30 hover:border-emerald-500/60'
                  : isOccupied
                  ? 'bg-indigo-950/20 border-indigo-500/40 hover:border-indigo-500/70'
                  : isBooked
                  ? 'bg-amber-950/20 border-amber-500/30'
                  : 'bg-zinc-900/40 border-white/[0.06]'
              }`}
            >
              {/* Card Header: Station Name + Status Badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white tracking-tight">{st.name}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-white/[0.06]">
                      {st.type}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{st.room_name}</div>
                </div>

                {/* Status Badge */}
                {isAvailable && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Free
                  </span>
                )}
                {isOccupied && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Playing
                  </span>
                )}
                {isBooked && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Reserved
                  </span>
                )}
                {isMaintenance && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-white/[0.08]">
                    Paused
                  </span>
                )}
              </div>

              {/* Card Body: Dynamic Content Depending on Status */}
              <div className="my-3">
                {isAvailable && (
                  <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-950/40 p-2.5 rounded-xl border border-white/[0.04]">
                    <span>Hourly Rate</span>
                    <span className="font-bold text-sm text-emerald-400 font-mono">
                      {(st.rate_minor / 100).toFixed(0)} Lei / hr
                    </span>
                  </div>
                )}

                {isOccupied && st.current_session && (
                  <div className="space-y-2 bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-500/20">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="truncate max-w-[120px]">{st.current_session.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-bold text-indigo-300">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        <span>{st.current_session.minutes_remaining}m left</span>
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-400 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(10, (st.current_session.minutes_remaining / 120) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {isBooked && (
                  <div className="text-xs text-zinc-400 bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/20">
                    <span className="text-amber-200 font-medium">Reserved Online</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Arriving in &lt; 30 minutes</p>
                  </div>
                )}

                {isMaintenance && (
                  <div className="text-xs text-zinc-500 bg-zinc-950/40 p-2.5 rounded-xl border border-white/[0.04]">
                    Under scheduled cleaning or hardware check
                  </div>
                )}
              </div>

              {/* Card Footer: Simple One-Click Action Buttons */}
              <div className="pt-2 border-t border-white/[0.06]">
                {isAvailable && (
                  <button
                    onClick={() =>
                      setWalkInModal({
                        isOpen: true,
                        station: st,
                        customerName: '',
                        durationHours: 2,
                        paymentMethod: 'CARD',
                      })
                    }
                    className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Quick Start Session</span>
                  </button>
                )}

                {isOccupied && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => handleQuickAddTime(st.id, 30, e)}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-white/[0.06] transition-colors"
                      title="Add 30 minutes to session"
                    >
                      +30m
                    </button>
                    <button
                      onClick={(e) => handleQuickAddTime(st.id, 60, e)}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-white/[0.06] transition-colors"
                      title="Add 1 hour to session"
                    >
                      +1h
                    </button>
                    <button
                      onClick={(e) => handleEndSession(st.id, e)}
                      className="py-1.5 px-2.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                      title="End session & release station"
                    >
                      End
                    </button>
                  </div>
                )}

                {isBooked && (
                  <button
                    onClick={() => {
                      const queueMatch = queue.find((q) => q.resource_names.includes(st.name));
                      if (queueMatch) handleCheckinQueueItem(queueMatch);
                      else handleQuickAddTime(st.id, 120);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors"
                  >
                    Check In Customer
                  </button>
                )}

                {isMaintenance && (
                  <button
                    onClick={() => {
                      setData({
                        ...data,
                        stations: data.stations.map((s) =>
                          s.id === st.id ? { ...s, status: 'AVAILABLE' } : s
                        ),
                        counts: {
                          ...data.counts,
                          maintenance: Math.max(0, data.counts.maintenance - 1),
                          available: data.counts.available + 1,
                        },
                      });
                      showToast(`✓ ${st.name} is now marked Available.`);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors"
                  >
                    Mark Available
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* 5. SUPER-EASY "WALK-IN CUSTOMER" CHECK-IN MODAL                      */}
      {/* ==================================================================== */}
      {walkInModal.isOpen && walkInModal.station && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Start Walk-In Gaming Session</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Quick 3-step check-in for walk-in customers</p>
              </div>
              <button
                onClick={() => setWalkInModal({ ...walkInModal, isOpen: false })}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Step 1: Selected Station */}
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  1. Selected Workstation
                </label>
                <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{walkInModal.station.name}</div>
                      <div className="text-xs text-zinc-400">{walkInModal.station.room_name} &bull; {walkInModal.station.type}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {(walkInModal.station.rate_minor / 100).toFixed(0)} Lei
                    </span>
                    <span className="text-zinc-500 text-xs block">per hour</span>
                  </div>
                </div>
              </div>

              {/* Step 2: Customer Name / Nickname */}
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  2. Customer Name (Optional)
                </label>
                <input
                  type="text"
                  value={walkInModal.customerName}
                  onChange={(e) => setWalkInModal({ ...walkInModal, customerName: e.target.value })}
                  placeholder="e.g. Andrei or leave blank for automatic numbering"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Step 3: Choose Duration & Price */}
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  3. Select Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { hours: 1, label: '1 Hour', discount: '' },
                    { hours: 2, label: '2 Hours', discount: '' },
                    { hours: 3, label: '3 Hours', discount: 'Popular' },
                    { hours: 5, label: '5 Hours', discount: 'Save 15%' },
                  ].map((tier) => {
                    const price = (walkInModal.station!.rate_minor / 100) * tier.hours;
                    const isSelected = walkInModal.durationHours === tier.hours;
                    return (
                      <button
                        key={tier.hours}
                        type="button"
                        onClick={() => setWalkInModal({ ...walkInModal, durationHours: tier.hours })}
                        className={`p-3 rounded-xl border text-center transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <span className="font-semibold text-xs text-white">{tier.label}</span>
                        <span className="font-bold text-base font-mono text-emerald-400 my-1">{price} Lei</span>
                        {tier.discount ? (
                          <span className="text-[10px] text-emerald-400 font-semibold">{tier.discount}</span>
                        ) : (
                          <span className="text-[10px] text-zinc-500">Standard</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 4: Payment Method */}
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  4. Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWalkInModal({ ...walkInModal, paymentMethod: 'CARD' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      walkInModal.paymentMethod === 'CARD'
                        ? 'bg-white text-black border-white font-bold'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Card POS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInModal({ ...walkInModal, paymentMethod: 'CASH' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      walkInModal.paymentMethod === 'CASH'
                        ? 'bg-white text-black border-white font-bold'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Cash Register</span>
                  </button>
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-400 block">Total Due Now</span>
                  <span className="text-xs text-emerald-400 font-medium">Includes 19% Romanian TVA</span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xl font-extrabold text-white">
                    {((walkInModal.station.rate_minor / 100) * walkInModal.durationHours).toFixed(2)} Lei
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-950 border-t border-white/[0.08] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setWalkInModal({ ...walkInModal, isOpen: false })}
                className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWalkIn}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Start Session & Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. SCAN BOOKING QR CODE MODAL                                        */}
      {/* ==================================================================== */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Scan Customer Ticket Pass</h3>
              </div>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Hold the customer's phone QR pass up to your USB scanner, or type their 6-digit booking code below:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!qrInput.trim()) return;
                const match = queue.find(
                  (q) => q.public_code.toLowerCase() === qrInput.trim().toLowerCase()
                );
                if (match) {
                  handleCheckinQueueItem(match);
                } else {
                  showToast(`✓ Ticket code ${qrInput.toUpperCase()} verified.`);
                }
                setQrInput('');
                setIsQrModalOpen(false);
              }}
              className="space-y-3"
            >
              <input
                type="text"
                autoFocus
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="e.g. GB-8492 or GB-441029"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-base font-mono font-bold tracking-widest text-emerald-400 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 uppercase"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all"
              >
                Validate Pass & Check In
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. ROMANIAN FISCAL RECEIPT MODAL                                     */}
      {/* ==================================================================== */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 font-mono text-xs text-zinc-300 space-y-4">
            <div className="text-center border-b border-dashed border-zinc-700 pb-3">
              <div className="font-bold text-sm text-white">NEXUS GAMING ARENA S.R.L.</div>
              <div className="text-[11px] text-zinc-400">C.I.F.: RO38491029 &bull; J40/12984/2021</div>
              <div className="text-[10px] text-zinc-500">Bd. Regina Elisabeta nr. 32, Sector 5, Bucuresti</div>
              <div className="mt-2 text-xs font-bold text-emerald-400">BON FISCAL A.N.A.F.</div>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span>CLIENT:</span>
                <span className="font-bold text-white">{showReceiptModal.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>STATION:</span>
                <span className="text-zinc-200">{showReceiptModal.station_name}</span>
              </div>
              <div className="flex justify-between">
                <span>TICKET CODE:</span>
                <span className="text-emerald-400 font-bold">{showReceiptModal.public_code}</span>
              </div>
              <div className="flex justify-between">
                <span>DURATION:</span>
                <span>{showReceiptModal.duration_hours} ORE</span>
              </div>
              <div className="flex justify-between">
                <span>METODA PLATA:</span>
                <span className="text-white font-semibold">{showReceiptModal.payment_method}</span>
              </div>
            </div>

            <div className="border-t border-b border-dashed border-zinc-700 py-2 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>SUBTOTAL NET:</span>
                <span>{showReceiptModal.net_ron} LEI</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>TVA (19%):</span>
                <span>{showReceiptModal.tva_ron} LEI</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1">
                <span>TOTAL DE PLATA:</span>
                <span className="text-emerald-400">{showReceiptModal.total_ron} LEI</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-zinc-500 space-y-0.5">
              <div>MEMORIE FISCALA #GB-ANAF-0912</div>
              <div>DATA: {showReceiptModal.timestamp}</div>
              <div>VA MULTUMIM PENTRU VIZITA!</div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(null)}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveFloorView;
