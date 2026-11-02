import React, { useState } from 'react';
import {
  Monitor,
  Cpu,
  Check,
  Clock,
  ChevronRight,
  LayoutGrid,
  Map,
  Sparkles,
} from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('18:00 - 20:00');

  const zones = ['ALL', 'VIP Stage', 'Esports Pod', 'Sim Racing', 'Console Lounge'];
  const timeSlots = ['16:00 - 18:00', '18:00 - 20:00', '20:00 - 22:00', '22:00 - 01:00'];

  const filteredStations = stations.filter(
    (s) => selectedZone === 'ALL' || s.zone === selectedZone,
  );

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-extrabold">Step 1 of 2</span>
          <h1 className="text-2xl font-black text-white tracking-tight">Pick Your Rig</h1>
          <p className="text-xs text-slate-400">Select your battle station & session window</p>
        </div>

        {/* View Switcher Toggle */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setViewMode('map')}
            className={`p-1.5 rounded-lg flex items-center gap-1 transition-colors ${
              viewMode === 'map' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
            title="Floor Seating Map"
          >
            <Map className="w-3.5 h-3.5" />
            <span className="text-[10px]">Map</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg flex items-center gap-1 transition-colors ${
              viewMode === 'list' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
            title="Detailed Specs List"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="text-[10px]">List</span>
          </button>
        </div>
      </div>

      {/* Zone filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {zones.map((zone) => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedZone === zone
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {zone}
          </button>
        ))}
      </div>

      {/* Time Slot Picker */}
      <div className="glass-card p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Start Time Window
          </span>
          <span className="text-cyan-400 font-mono font-bold text-[11px]">{selectedTimeSlot}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {timeSlots.map((slot) => (
            <button
              key={slot}
              onClick={() => setSelectedTimeSlot(slot)}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-mono font-bold transition-all text-center ${
                selectedTimeSlot === slot
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Duration Selector */}
      <div className="glass-card p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 font-bold">Session Duration</span>
          <span className="text-cyan-400 font-mono font-bold">{selectedDuration} Hours</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 5].map((hours) => (
            <button
              key={hours}
              onClick={() => onSelectDuration(hours)}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                selectedDuration === hours
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {hours}h
            </button>
          ))}
        </div>
      </div>

      {/* VIEW MODE 1: Interactive Floor Map Seating Chart */}
      {viewMode === 'map' && (
        <div className="glass-card p-4 rounded-3xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="font-extrabold text-white flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-cyan-400" /> Tap Seat on Arena Floor
            </span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Free
              </span>
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Selected
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-600" /> In Use
              </span>
            </div>
          </div>

          {/* 2D Seating Layout Visual Grid */}
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-900 grid grid-cols-3 gap-2.5">
            {filteredStations.map((station) => {
              const isSelected = selectedStation?.id === station.id;
              const isOccupied = station.status === 'OCCUPIED';

              let seatStyle = 'bg-slate-900 border-slate-800 text-slate-300 hover:border-emerald-500/50';
              if (isOccupied) {
                seatStyle = 'bg-slate-950/60 border-slate-800/40 text-slate-600 opacity-40 cursor-not-allowed';
              } else if (isSelected) {
                seatStyle = 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400';
              }

              return (
                <button
                  key={station.id}
                  disabled={isOccupied}
                  onClick={() => onSelectStation(station)}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between h-24 ${seatStyle}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Monitor className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span className="text-[9px] font-mono font-bold text-slate-400">
                      {(station.hourlyRate / 100).toFixed(0)}L
                    </span>
                  </div>

                  <span className="font-mono font-black text-xs text-white my-1">{station.name}</span>

                  <span className={`text-[9px] font-bold uppercase ${isSelected ? 'text-cyan-400' : isOccupied ? 'text-slate-600' : 'text-emerald-400'}`}>
                    {isSelected ? '✓ Selected' : isOccupied ? 'In Session' : 'Ready'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: Detailed Hardware Cards */}
      {viewMode === 'list' && (
        <div className="space-y-2.5">
          {filteredStations.map((station) => {
            const isSelected = selectedStation?.id === station.id;
            const isOccupied = station.status === 'OCCUPIED';

            return (
              <div
                key={station.id}
                onClick={() => !isOccupied && onSelectStation(station)}
                className={`glass-card p-3.5 rounded-2xl border transition-all ${
                  isOccupied
                    ? 'opacity-40 cursor-not-allowed border-slate-800/40'
                    : isSelected
                    ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/15 cursor-pointer'
                    : 'border-slate-800 hover:border-slate-700 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950'
                          : isOccupied
                          ? 'bg-slate-800 text-slate-500'
                          : 'bg-slate-900 border border-slate-800 text-cyan-400'
                      }`}
                    >
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-white">{station.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold">
                          {station.zone}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Cpu className="w-3 h-3 text-cyan-400" /> {station.gpu}
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-black text-cyan-300">
                      {(station.hourlyRate / 100).toFixed(0)} RON
                    </div>
                    <div className="text-[10px] text-slate-500">per hour</div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate max-w-[210px]">{station.peripherals}</span>
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
      )}

      {/* Floating Bottom Action Bar */}
      {selectedStation && (
        <div className="fixed bottom-16 left-0 right-0 p-4 max-w-md mx-auto z-40 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
          <div className="glass-card p-3.5 rounded-3xl border border-cyan-500/40 flex items-center justify-between shadow-2xl bg-slate-950/90">
            <div>
              <div className="text-[10px] uppercase text-cyan-400 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Station Selected
              </div>
              <div className="text-xs font-bold text-white">
                {selectedStation.name} &bull; {selectedDuration}h Session
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Deposit 30%: <strong className="text-cyan-300">{((selectedStation.hourlyRate * selectedDuration * 0.3) / 100).toFixed(0)} RON</strong>
              </div>
            </div>

            <button
              onClick={onProceedToCheckout}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-transform"
            >
              Checkout <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
