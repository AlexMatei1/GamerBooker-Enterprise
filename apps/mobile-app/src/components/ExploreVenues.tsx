import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  ChevronRight,
  Clock,
  Wifi,
  X,
} from 'lucide-react';
import type { MobileVenue } from '../types/mobile';

interface ExploreVenuesProps {
  venues: MobileVenue[];
  onSelectVenue: (venue: MobileVenue) => void;
}

export const ExploreVenues: React.FC<ExploreVenuesProps> = ({ venues, onSelectVenue }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [inspectVenue, setInspectVenue] = useState<MobileVenue | null>(null);

  const tags = ['ALL', 'RTX 4090', '500Hz BenQ', 'Custom Sim Rigs', '5v5 Bootcamp'];

  const filteredVenues = venues.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = selectedTag === 'ALL' || v.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Top Mobile Bar */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
            Esports LAN Network
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Explore Arenas</h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/[0.1] flex items-center justify-center text-xs font-mono font-medium text-zinc-300">
          RO
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by arena, city, hardware..."
          className="w-full bg-zinc-900/90 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedTag === tag
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Statutory Standard Notice */}
      <div className="p-3 rounded-xl bg-zinc-900/70 border border-white/[0.06] flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="text-[11px] leading-tight text-zinc-400">
          <span className="font-medium text-zinc-200">Romanian Statutory Standard:</span> Direct turnstile entry, fiscal receipts, and Law 42/2024 compliance.
        </div>
      </div>

      {/* Featured Arena Card */}
      {filteredVenues.length > 0 && (
        <div
          onClick={() => setInspectVenue(filteredVenues[0])}
          className="rounded-2xl overflow-hidden border border-white/[0.1] bg-zinc-900/90 cursor-pointer group shadow-xl"
        >
          <div className="relative h-44 overflow-hidden">
            <img
              src={filteredVenues[0].bannerImage}
              alt={filteredVenues[0].name}
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
            <div className="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md text-emerald-400 text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border border-emerald-500/30">
              {filteredVenues[0].availableStations} SEATS OPEN
            </div>
            <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium mb-0.5">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{filteredVenues[0].rating}</span>
                <span className="text-zinc-500">&bull;</span>
                <span className="text-zinc-300">{filteredVenues[0].city}</span>
              </div>
              <h3 className="text-base font-bold text-white leading-tight">
                {filteredVenues[0].name}
              </h3>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {filteredVenues[0].address}
              </p>
            </div>
          </div>

          <div className="p-3 flex items-center justify-between border-t border-white/[0.06] bg-zinc-900/60">
            <div className="flex gap-1">
              {filteredVenues[0].tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-white/[0.04]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-400">from </span>
              <span className="text-sm font-semibold text-white font-mono">
                {(filteredVenues[0].baseHourlyRate / 100).toFixed(0)} RON
              </span>
              <span className="text-[10px] text-zinc-500">/h</span>
            </div>
          </div>
        </div>
      )}

      {/* All Arenas List */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          All Arenas ({filteredVenues.length})
        </span>
        {filteredVenues.map((v) => (
          <div
            key={v.id}
            onClick={() => setInspectVenue(v)}
            className="p-3 rounded-xl bg-zinc-900/70 border border-white/[0.06] hover:border-white/[0.12] transition-colors cursor-pointer flex items-center gap-3"
          >
            <img
              src={v.bannerImage}
              alt={v.name}
              className="w-16 h-16 rounded-lg object-cover shrink-0 border border-white/[0.06]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium mb-0.5">
                <Star className="w-2.5 h-2.5 fill-amber-400" />
                <span>{v.rating}</span>
                <span className="text-zinc-600">&bull;</span>
                <span className="text-emerald-400 font-mono">{v.availableStations} free</span>
              </div>
              <h4 className="text-xs font-semibold text-white truncate">{v.name}</h4>
              <p className="text-[11px] text-zinc-400 truncate">{v.address}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-zinc-200 font-medium">
                  {(v.baseHourlyRate / 100).toFixed(0)} RON/h
                </span>
                <span className="text-zinc-600">&bull;</span>
                <span className="text-[10px] text-zinc-500">{v.zonesCount} zones</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
          </div>
        ))}
      </div>

      {/* Arena Details Modal */}
      {inspectVenue && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center">
          <div className="max-w-md w-full rounded-t-2xl border-t border-white/[0.1] p-5 space-y-4 max-h-[88vh] overflow-y-auto bg-zinc-950">
            <div className="relative rounded-xl overflow-hidden h-36 -mt-1">
              <img
                src={inspectVenue.bannerImage}
                alt={inspectVenue.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setInspectVenue(null)}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">{inspectVenue.name}</h3>
                <span className="font-mono text-xs font-semibold text-zinc-200">
                  {(inspectVenue.baseHourlyRate / 100).toFixed(0)} RON/h
                </span>
              </div>
              <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-zinc-500" /> {inspectVenue.address}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-white/[0.06] flex items-center gap-2">
                <Wifi className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="font-medium text-white text-[11px]">10 Gbps LAN</div>
                  <div className="text-[10px] text-zinc-500">Low Ping Backbone</div>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-white/[0.06] flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="font-medium text-white text-[11px]">Opening Hours</div>
                  <div className="text-[10px] text-zinc-500">Until {inspectVenue.closingTime}</div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-zinc-500">Rig Specifications</span>
              <div className="flex flex-wrap gap-1">
                {inspectVenue.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded text-[11px] bg-zinc-900 text-zinc-300 border border-white/[0.06]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setInspectVenue(null);
                  onSelectVenue(inspectVenue);
                }}
                className="w-full py-3 rounded-xl bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1 hover:bg-zinc-200 transition-colors shadow-sm"
              >
                <span>Select Battle Station</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
