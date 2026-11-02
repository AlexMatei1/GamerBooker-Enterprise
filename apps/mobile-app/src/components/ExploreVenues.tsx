import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Flame,
  ChevronRight,
  Zap,
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

  const tags = ['ALL', 'RTX 4090', '500Hz BenQ', 'Custom Sim Rigs', '5v5 Bootcamp', 'PS5 Pro'];

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
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-extrabold flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Esports & LAN Network
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white">Find an Arena</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-xs font-mono font-bold text-cyan-300 shadow-sm shadow-cyan-500/20">
          RO
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search arena, city, RTX 4090, 500Hz..."
          className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedTag === tag
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Verified Romanian Legal Badge */}
      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="text-[11px] leading-tight text-slate-300">
          <span className="font-bold text-emerald-400">Romanian Statutory Verified</span> &bull; Turnstile instant access, fiscal e-receipts & Law 42/2024 minors safety.
        </div>
      </div>

      {/* Featured Arena Card */}
      {filteredVenues.length > 0 && (
        <div
          onClick={() => setInspectVenue(filteredVenues[0])}
          className="relative rounded-3xl overflow-hidden border border-cyan-500/40 group cursor-pointer shadow-2xl shadow-cyan-950/30"
        >
          <img
            src={filteredVenues[0].bannerImage}
            alt={filteredVenues[0].name}
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          <div className="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-red-500/20">
            <Flame className="w-3 h-3" /> FEATURED ARENA
          </div>
          <div className="absolute top-3 right-3 bg-slate-950/90 backdrop-blur-md text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            {filteredVenues[0].availableStations} SEATS OPEN
          </div>

          <div className="absolute bottom-3.5 left-4 right-4">
            <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-mono mb-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold">{filteredVenues[0].rating}</span>
              <span className="text-slate-500">&bull;</span>
              <MapPin className="w-3 h-3 text-slate-400" />
              <span className="text-slate-300">{filteredVenues[0].city}</span>
            </div>
            <h3 className="text-lg font-black text-white leading-tight">
              {filteredVenues[0].name}
            </h3>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {filteredVenues[0].address}
            </p>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/80">
              <div className="flex flex-wrap gap-1">
                {filteredVenues[0].tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-semibold bg-slate-800/80 text-cyan-300 px-2 py-0.5 rounded-lg border border-slate-700/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">from </span>
                <span className="text-base font-black text-cyan-300 font-mono">
                  {(filteredVenues[0].baseHourlyRate / 100).toFixed(0)} RON
                </span>
                <span className="text-[10px] text-slate-500">/hr</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Arenas List */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          All Arenas ({filteredVenues.length})
        </h2>
        {filteredVenues.map((v) => (
          <div
            key={v.id}
            onClick={() => setInspectVenue(v)}
            className="glass-card p-3 rounded-2xl hover:border-cyan-500/40 transition-colors cursor-pointer flex items-center gap-3.5 shadow-sm"
          >
            <img
              src={v.bannerImage}
              alt={v.name}
              className="w-18 h-18 rounded-xl object-cover shrink-0 border border-slate-800"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold mb-0.5">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>{v.rating}</span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-400 font-mono">{v.availableStations} seats ready</span>
              </div>
              <h4 className="text-xs font-bold text-white truncate">{v.name}</h4>
              <p className="text-[11px] text-slate-400 truncate">{v.address}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-cyan-300 font-bold">
                  {(v.baseHourlyRate / 100).toFixed(0)} RON/h
                </span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-[10px] text-slate-400">{v.zonesCount} zones</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-600 shrink-0" />
          </div>
        ))}
      </div>

      {/* Detailed Arena Modal */}
      {inspectVenue && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end justify-center">
          <div className="glass-card max-w-md w-full rounded-t-3xl border-t border-cyan-500/40 p-5 space-y-4 max-h-[90vh] overflow-y-auto bg-slate-950">
            <div className="relative rounded-2xl overflow-hidden h-40 -mt-2">
              <img
                src={inspectVenue.bannerImage}
                alt={inspectVenue.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setInspectVenue(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">{inspectVenue.name}</h3>
                <span className="font-mono text-sm font-extrabold text-cyan-300">
                  {(inspectVenue.baseHourlyRate / 100).toFixed(0)} RON/h
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {inspectVenue.address}
              </p>
            </div>

            {/* Amenities Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="font-bold text-white text-[11px]">10 Gbps Fiber</div>
                  <div className="text-[10px] text-slate-500">Dedicated LAN Backbone</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-bold text-white text-[11px]">Open Late</div>
                  <div className="text-[10px] text-slate-500">Until {inspectVenue.closingTime}</div>
                </div>
              </div>
            </div>

            {/* Hardware Tags */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Arena Specifications</span>
              <div className="flex flex-wrap gap-1.5">
                {inspectVenue.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-cyan-300 border border-slate-800"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Book Button */}
            <div className="pt-2">
              <button
                onClick={() => {
                  setInspectVenue(null);
                  onSelectVenue(inspectVenue);
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-transform"
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
