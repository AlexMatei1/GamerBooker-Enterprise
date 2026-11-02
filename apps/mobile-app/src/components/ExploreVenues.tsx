import React, { useState } from 'react';
import { Search, MapPin, Star, ShieldCheck, Flame, ChevronRight, Zap } from 'lucide-react';
import type { MobileVenue } from '../types/mobile';

interface ExploreVenuesProps {
  venues: MobileVenue[];
  onSelectVenue: (venue: MobileVenue) => void;
}

export const ExploreVenues: React.FC<ExploreVenuesProps> = ({ venues, onSelectVenue }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVenues = venues.filter(
    (v) =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4 pb-20">
      {/* Top Mobile Bar */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Esports & LAN Network
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white">Find an Arena</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-cyan-300">
          RO
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by arena, city, RTX 4090, 500Hz..."
          className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {/* Verified Romanian Legal Badge */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
        <div className="text-[11px] leading-tight text-slate-300">
          <span className="font-semibold text-emerald-400">Romanian Statutory Standard</span>: Real-time turnstile sync, fiscal receipts, and strict Law 42/2024 minors protection.
        </div>
      </div>

      {/* Featured Arena Card */}
      {filteredVenues.length > 0 && (
        <div
          onClick={() => onSelectVenue(filteredVenues[0])}
          className="relative rounded-2xl overflow-hidden border border-cyan-500/30 group cursor-pointer shadow-xl shadow-cyan-950/20"
        >
          <img
            src={filteredVenues[0].bannerImage}
            alt={filteredVenues[0].name}
            className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          <div className="absolute top-3 left-3 bg-red-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <Flame className="w-3 h-3" /> FEATURED ARENA
          </div>
          <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
            {filteredVenues[0].availableStations} SEATS OPEN
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-mono mb-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{filteredVenues[0].rating}</span>
              <span className="text-slate-500">&bull;</span>
              <MapPin className="w-3 h-3 text-slate-400" />
              <span className="text-slate-300">{filteredVenues[0].city}</span>
            </div>
            <h3 className="text-base font-extrabold text-white leading-tight">
              {filteredVenues[0].name}
            </h3>
            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
              {filteredVenues[0].address}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {filteredVenues[0].tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-semibold bg-slate-800/80 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">from </span>
                <span className="text-sm font-extrabold text-cyan-300">
                  {(filteredVenues[0].baseHourlyRate / 100).toFixed(0)} RON
                </span>
                <span className="text-[10px] text-slate-500">/hr</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Venues List */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          All Arenas ({filteredVenues.length})
        </h2>
        {filteredVenues.map((v) => (
          <div
            key={v.id}
            onClick={() => onSelectVenue(v)}
            className="glass-card p-3 rounded-xl hover:border-cyan-500/40 transition-colors cursor-pointer flex items-center gap-3.5"
          >
            <img
              src={v.bannerImage}
              alt={v.name}
              className="w-16 h-16 rounded-lg object-cover shrink-0 border border-slate-800"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold mb-0.5">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>{v.rating}</span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-400">{v.availableStations} seats ready</span>
              </div>
              <h4 className="text-xs font-bold text-white truncate">{v.name}</h4>
              <p className="text-[11px] text-slate-400 truncate">{v.address}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-cyan-300 font-bold">
                  {(v.baseHourlyRate / 100).toFixed(0)} RON/h
                </span>
                <span className="text-[10px] text-slate-500">&bull;</span>
                <span className="text-[10px] text-slate-400">{v.zonesCount} zones</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-600 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
