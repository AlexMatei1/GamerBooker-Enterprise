import React, { useState } from 'react';
import {
  Monitor,
  Gamepad2,
  Clock,
  Sparkles,
  Zap,
  Flame,
  User,
  Plus,
  ShieldCheck,
  ChevronRight,
  Gauge,
} from 'lucide-react';
import type { LiveStationItem } from '../types/dashboard';

interface InteractiveFloorMapProps {
  stations: LiveStationItem[];
  stationAlerts: Record<string, string>;
  onSelectStation: (station: LiveStationItem) => void;
  onQuickWalkIn: (station: LiveStationItem) => void;
}

export const InteractiveFloorMap: React.FC<InteractiveFloorMapProps> = ({
  stations,
  stationAlerts,
  onSelectStation,
  onQuickWalkIn,
}) => {
  const [hoveredStation, setHoveredStation] = useState<LiveStationItem | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>('ALL');

  // Group stations into physical floor zones
  const zones = [
    { id: 'ALL', name: 'Whole Venue Floor' },
    { id: 'VIP', name: 'VIP Stage Arena' },
    { id: 'ESPORTS_A', name: 'Esports Pods Alpha' },
    { id: 'ESPORTS_B', name: 'Esports Pods Beta' },
    { id: 'LOUNGE', name: 'Sim Racing & Console Lounge' },
  ];

  const getStationZone = (st: LiveStationItem): string => {
    if (st.type === 'VIP_BOOTH' || st.name.includes('VIP')) return 'VIP';
    if (st.type === 'RACING_SIM' || st.type === 'CONSOLE_BOOTH' || st.name.includes('SIM') || st.name.includes('PS5')) return 'LOUNGE';
    const num = parseInt(st.name.replace(/\D/g, ''), 10) || 1;
    return num <= 6 ? 'ESPORTS_A' : 'ESPORTS_B';
  };

  const filteredStations = stations.filter((st) => {
    if (selectedZone === 'ALL') return true;
    return getStationZone(st) === selectedZone;
  });

  return (
    <div className="space-y-4">
      {/* Zone Switcher & Map Legend */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-zinc-900/80 border border-white/[0.08] p-3.5 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {zones.map((z) => (
            <button
              key={z.id}
              onClick={() => setSelectedZone(z.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedZone === z.id
                  ? 'bg-white text-black shadow-md'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white border border-white/[0.04]'
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-medium self-end md:self-auto">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>Available</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            <span>In-Game</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Reserved</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>Staff Call</span>
          </span>
        </div>
      </div>

      {/* 2D Interactive Blueprint Floor Surface */}
      <div className="relative rounded-3xl border border-white/[0.08] bg-[#0c0d12] p-6 shadow-2xl overflow-hidden min-h-[580px] bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]">
        {/* Subtle Ambient Floor Lighting */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Floor Zones Grid */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* VIP Stage Arena */}
          {(selectedZone === 'ALL' || selectedZone === 'VIP') && (
            <div className="lg:col-span-12 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] p-4 relative backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3 border-b border-amber-500/10 pb-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>VIP Glass Stage Arena (4090 Tournament Rigs)</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Isolated Soundproof Zone • 360Hz</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {stations
                  .filter((s) => getStationZone(s) === 'VIP')
                  .map((st) => (
                    <StationMapNode
                      key={st.id}
                      station={st}
                      hasAlert={Boolean(stationAlerts[st.id] || stationAlerts[st.name])}
                      onHover={setHoveredStation}
                      onSelect={onSelectStation}
                      onWalkIn={onQuickWalkIn}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Esports Pods Alpha */}
          {(selectedZone === 'ALL' || selectedZone === 'ESPORTS_A') && (
            <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 relative backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2 text-zinc-200 font-bold text-xs uppercase tracking-wider">
                  <Monitor className="w-4 h-4 text-emerald-400" />
                  <span>Esports Pods Alpha (Row 01-06)</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">RTX 4080 • 280Hz</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stations
                  .filter((s) => getStationZone(s) === 'ESPORTS_A')
                  .map((st) => (
                    <StationMapNode
                      key={st.id}
                      station={st}
                      hasAlert={Boolean(stationAlerts[st.id] || stationAlerts[st.name])}
                      onHover={setHoveredStation}
                      onSelect={onSelectStation}
                      onWalkIn={onQuickWalkIn}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Esports Pods Beta */}
          {(selectedZone === 'ALL' || selectedZone === 'ESPORTS_B') && (
            <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 relative backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2 text-zinc-200 font-bold text-xs uppercase tracking-wider">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  <span>Esports Pods Beta (Row 07-12)</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">RTX 4080 • 280Hz</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stations
                  .filter((s) => getStationZone(s) === 'ESPORTS_B')
                  .map((st) => (
                    <StationMapNode
                      key={st.id}
                      station={st}
                      hasAlert={Boolean(stationAlerts[st.id] || stationAlerts[st.name])}
                      onHover={setHoveredStation}
                      onSelect={onSelectStation}
                      onWalkIn={onQuickWalkIn}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Sim Racing & Consoles Lounge */}
          {(selectedZone === 'ALL' || selectedZone === 'LOUNGE') && (
            <div className="lg:col-span-12 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 relative backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4 text-purple-400" />
                  <span>Cockpit Simulators &amp; PS5 Couches</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Fanatec Direct Drive • 4K OLED 120Hz</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stations
                  .filter((s) => getStationZone(s) === 'LOUNGE')
                  .map((st) => (
                    <StationMapNode
                      key={st.id}
                      station={st}
                      hasAlert={Boolean(stationAlerts[st.id] || stationAlerts[st.name])}
                      onHover={setHoveredStation}
                      onSelect={onSelectStation}
                      onWalkIn={onQuickWalkIn}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StationMapNodeProps {
  station: LiveStationItem;
  hasAlert: boolean;
  onHover: (s: LiveStationItem | null) => void;
  onSelect: (s: LiveStationItem) => void;
  onWalkIn: (s: LiveStationItem) => void;
}

const StationMapNode: React.FC<StationMapNodeProps> = ({
  station,
  hasAlert,
  onHover,
  onSelect,
  onWalkIn,
}) => {
  const isAvailable = station.status === 'AVAILABLE';
  const isOccupied = station.status === 'OCCUPIED';
  const isBooked = station.status === 'BOOKED';

  return (
    <div
      onMouseEnter={() => onHover(station)}
      onMouseLeave={() => onHover(null)}
      onClick={() => (isAvailable ? onWalkIn(station) : onSelect(station))}
      className={`group relative p-3 rounded-2xl border transition-all duration-200 cursor-pointer select-none flex flex-col justify-between min-h-[105px] ${
        hasAlert
          ? 'bg-rose-950/40 border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse'
          : isAvailable
          ? 'bg-zinc-900/90 border-emerald-500/30 hover:border-emerald-400 hover:shadow-[0_0_15px_rgba(52,211,153,0.25)] hover:scale-[1.02]'
          : isOccupied
          ? 'bg-indigo-950/30 border-indigo-500/40 hover:border-indigo-400 hover:shadow-[0_0_15px_rgba(129,140,248,0.25)] hover:scale-[1.02]'
          : isBooked
          ? 'bg-amber-950/30 border-amber-500/30 hover:border-amber-400'
          : 'bg-zinc-900/30 border-white/[0.04]'
      }`}
    >
      {/* Node Top: Name + Beacon */}
      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-white tracking-tight group-hover:text-emerald-300 transition-colors">
          {station.name}
        </span>

        {/* Live Status LED */}
        <span className="relative flex h-2.5 w-2.5">
          {hasAlert ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </>
          ) : isAvailable ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </>
          ) : isOccupied ? (
            <>
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-400" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
          )}
        </span>
      </div>

      {/* Node Content */}
      <div className="my-1.5">
        {hasAlert ? (
          <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-400" />
            <span>Staff Call</span>
          </div>
        ) : isOccupied && station.current_session ? (
          <div>
            <div className="text-[11px] font-semibold text-zinc-200 truncate">
              {station.current_session.customer_name}
            </div>
            <div className="text-[10px] text-indigo-300 font-mono flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              <span>{station.current_session.minutes_remaining}m left</span>
            </div>
          </div>
        ) : isAvailable ? (
          <div>
            <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              <span>Click to Play</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
              {(station.rate_minor / 100).toFixed(0)} RON/h
            </div>
          </div>
        ) : isBooked ? (
          <div className="text-[11px] font-medium text-amber-300">
            Arriving soon
          </div>
        ) : (
          <div className="text-[10px] text-zinc-500">Maintenance</div>
        )}
      </div>

      {/* Node Bottom Bar */}
      <div className="pt-1 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>{station.type.split('_')[0]}</span>
        <span className="group-hover:text-white transition-colors">&rarr;</span>
      </div>
    </div>
  );
};
