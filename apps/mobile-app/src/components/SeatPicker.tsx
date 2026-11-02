import React, { useState } from 'react';
import {
  Monitor,
  Cpu,
  Clock,
  ChevronRight,
  LayoutGrid,
  Map,
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
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">Step 1 of 2</span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Select Station</h1>
        </div>

        {/* View Mode Toggle */}
        <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-white/[0.08] text-xs">
          <button
            onClick={() => setViewMode('map')}
            className={`px-2 py-1 rounded-md flex items-center gap-1 transition-colors ${
              viewMode === 'map' ? 'bg-zinc-800 text-white font-medium shadow-sm' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span className="text-[10px]">Map</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 rounded-md flex items-center gap-1 transition-colors ${
              viewMode === 'list' ? 'bg-zinc-800 text-white font-medium shadow-sm' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="text-[10px]">List</span>
          </button>
        </div>
      </div>

      {/* Zone Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {zones.map((zone) => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedZone === zone
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {zone}
          </button>
        ))}
      </div>

      {/* Time Window Selector */}
      <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" /> Start Window
          </span>
          <span className="font-mono text-zinc-200 text-[11px] font-medium">{selectedTimeSlot}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {timeSlots.map((slot) => (
            <button
              key={slot}
              onClick={() => setSelectedTimeSlot(slot)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-mono transition-colors text-center ${
                selectedTimeSlot === slot
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-white'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Duration Selector */}
      <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Duration</span>
          <span className="font-mono text-zinc-200 font-medium">{selectedDuration} Hours</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 5].map((hours) => (
            <button
              key={hours}
              onClick={() => onSelectDuration(hours)}
              className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                selectedDuration === hours
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-white'
              }`}
            >
              {hours}h
            </button>
          ))}
        </div>
      </div>

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/[0.06]">
            <span className="font-medium text-zinc-300">Floor Seating Chart</span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Free
              </span>
              <span className="flex items-center gap-1 text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white" /> Selected
              </span>
              <span className="flex items-center gap-1 text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> In Use
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {filteredStations.map((station) => {
              const isSelected = selectedStation?.id === station.id;
              const isOccupied = station.status === 'OCCUPIED';

              let cardStyle = 'bg-zinc-900/90 border-white/[0.06] text-zinc-300 hover:border-white/[0.16]';
              if (isOccupied) {
                cardStyle = 'bg-zinc-950/40 border-white/[0.02] text-zinc-600 opacity-40 cursor-not-allowed';
              } else if (isSelected) {
                cardStyle = 'bg-zinc-800 border-white text-white shadow-md ring-1 ring-white/50';
              }

              return (
                <button
                  key={station.id}
                  disabled={isOccupied}
                  onClick={() => onSelectStation(station)}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-between h-20 ${cardStyle}`}
                >
                  <div className="flex items-center justify-between w-full text-[10px] text-zinc-500 font-mono">
                    <span>{station.zone === 'VIP Stage' ? 'VIP' : 'PC'}</span>
                    <span>{(station.hourlyRate / 100).toFixed(0)}L</span>
                  </div>

                  <span className="font-mono font-semibold text-xs text-zinc-100">{station.name}</span>

                  <span className={`text-[9px] font-medium uppercase ${isSelected ? 'text-white' : isOccupied ? 'text-zinc-600' : 'text-emerald-400'}`}>
                    {isSelected ? 'Selected' : isOccupied ? 'In Session' : 'Available'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredStations.map((station) => {
            const isSelected = selectedStation?.id === station.id;
            const isOccupied = station.status === 'OCCUPIED';

            return (
              <div
                key={station.id}
                onClick={() => !isOccupied && onSelectStation(station)}
                className={`p-3 rounded-xl border transition-all ${
                  isOccupied
                    ? 'opacity-40 cursor-not-allowed border-white/[0.02] bg-zinc-950'
                    : isSelected
                    ? 'border-white bg-zinc-800 text-white cursor-pointer shadow-md'
                    : 'border-white/[0.06] bg-zinc-900/80 hover:border-white/[0.12] cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/[0.06] flex items-center justify-center text-zinc-300">
                      <Monitor className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white">{station.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {station.zone}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Cpu className="w-3 h-3 text-zinc-500" /> {station.gpu}
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-xs font-semibold text-zinc-100">
                      {(station.hourlyRate / 100).toFixed(0)} RON
                    </div>
                    <div className="text-[10px] text-zinc-500">per hour</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Checkout Button */}
      {selectedStation && (
        <div className="fixed bottom-16 left-0 right-0 p-4 max-w-md mx-auto z-40 bg-gradient-to-t from-black via-black/90 to-transparent">
          <div className="p-3.5 rounded-2xl bg-zinc-900 border border-white/[0.12] flex items-center justify-between shadow-2xl">
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">Selected Station</div>
              <div className="text-xs font-semibold text-white">
                {selectedStation.name} &bull; {selectedDuration}h Session
              </div>
              <div className="text-xs text-zinc-400 font-mono mt-0.5">
                Total: <strong className="text-white">{((selectedStation.hourlyRate * selectedDuration) / 100).toFixed(0)} RON</strong>
              </div>
            </div>

            <button
              onClick={onProceedToCheckout}
              className="px-4 py-2.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1 hover:bg-zinc-200 transition-colors shadow-sm"
            >
              Checkout <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
