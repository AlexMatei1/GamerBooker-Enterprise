import React, { useState } from 'react';
import { Monitor, Cpu, Check, Clock, ChevronRight } from 'lucide-react';
import type { StationItem } from '../types/mobile';

interface SeatPickerProps {
  stations: StationItem[];
  selectedStation: StationItem | null;
  onSelectStation: (station: StationItem) => void;
  selectedDuration: number;
  onSelectDuration: (duration: number) => void;
  onProceedToCheckout: () => void;
}

export const SeatPicker: React.FC<SeatPickerProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  selectedDuration,
  onSelectDuration,
  onProceedToCheckout,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('ALL');

  const zones = ['ALL', 'VIP Stage', 'Esports Pod', 'Sim Racing', 'Console Lounge'];

  const filteredStations = stations.filter(
    (s) => selectedZone === 'ALL' || s.zone === selectedZone
  );

  return (
    <div className="space-y-4 pb-28">
      <div>
        <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">Step 1 of 2</span>
        <h1 className="text-2xl font-black text-white tracking-tight">Pick Your Rig</h1>
        <p className="text-xs text-slate-400">Select your battle station & session duration</p>
      </div>

      {/* Zone filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {zones.map((zone) => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedZone === zone
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            {zone}
          </button>
        ))}
      </div>

      {/* Duration Selector */}
      <div className="glass-card p-3 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Session Duration
          </span>
          <span className="text-cyan-400 font-mono font-bold">{selectedDuration} Hours</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 5].map((hours) => (
            <button
              key={hours}
              onClick={() => onSelectDuration(hours)}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                selectedDuration === hours
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {hours}h
            </button>
          ))}
        </div>
      </div>

      {/* Stations Grid / Cards */}
      <div className="space-y-2.5">
        {filteredStations.map((station) => {
          const isSelected = selectedStation?.id === station.id;
          const isOccupied = station.status === 'OCCUPIED';

          return (
            <div
              key={station.id}
              onClick={() => !isOccupied && onSelectStation(station)}
              className={`glass-card p-3.5 rounded-xl border transition-all ${
                isOccupied
                  ? 'opacity-40 cursor-not-allowed border-slate-800/40'
                  : isSelected
                  ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/10 cursor-pointer'
                  : 'border-slate-800 hover:border-slate-700 cursor-pointer'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950'
                        : isOccupied
                        ? 'bg-slate-800 text-slate-500'
                        : 'bg-slate-900 border border-slate-800 text-cyan-400'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-white">{station.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                        {station.zone}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Cpu className="w-3 h-3 text-cyan-400" /> {station.gpu}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-black text-cyan-300">
                    {(station.hourlyRate / 100).toFixed(0)} RON
                  </div>
                  <div className="text-[10px] text-slate-500">per hour</div>
                </div>
              </div>

              {/* Hardware specifications */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate max-w-[220px]">{station.peripherals}</span>
                {isOccupied ? (
                  <span className="text-amber-400 font-semibold font-mono">In Session</span>
                ) : isSelected ? (
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Selected
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold">Available</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Action Bar */}
      {selectedStation && (
        <div className="fixed bottom-16 left-0 right-0 p-4 max-w-md mx-auto z-40 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent">
          <div className="glass-card p-3 rounded-2xl border border-cyan-500/40 flex items-center justify-between shadow-2xl">
            <div>
              <div className="text-[10px] uppercase text-cyan-400 font-bold">Ready to Reserve</div>
              <div className="text-xs font-bold text-white">
                {selectedStation.name} &bull; {selectedDuration}h Session
              </div>
              <div className="text-sm font-extrabold text-cyan-300 font-mono">
                Total: {((selectedStation.hourlyRate * selectedDuration) / 100).toFixed(0)} RON
              </div>
            </div>
            <button
              onClick={onProceedToCheckout}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-transform"
            >
              Checkout <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
