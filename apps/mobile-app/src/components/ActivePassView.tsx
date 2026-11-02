import React, { useState, useEffect } from 'react';
import {
  QrCode,
  RefreshCw,
  PlusCircle,
  BellRing,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import type { ActivePass } from '../types/mobile';

interface ActivePassViewProps {
  pass: ActivePass;
  onExtendSession: () => void;
}

export const ActivePassView: React.FC<ActivePassViewProps> = ({
  pass,
  onExtendSession,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(pass.remainingSeconds || 7200);
  const [tokenCounter, setTokenCounter] = useState(30);
  const [staffCalled, setStaffCalled] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      setTokenCounter((prev) => (prev > 1 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCallStaff = () => {
    setStaffCalled(true);
    setTimeout(() => setStaffCalled(false), 5000);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
          Arena Admission
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Boarding Pass</h1>
      </div>

      {/* Apple Wallet Style Digital Ticket Pass */}
      <div className="rounded-2xl border border-white/[0.1] bg-[#121215] overflow-hidden shadow-2xl relative">
        {/* Pass Top Bar */}
        <div className="p-4 bg-zinc-900/90 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white text-zinc-950 flex items-center justify-center font-bold text-xs">
              GB
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{pass.venueName}</div>
              <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> Turnstile Gate 1 &bull; {pass.zoneName}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ACTIVE
          </span>
        </div>

        {/* Station Headline & Countdown Timer */}
        <div className="p-5 text-center space-y-3">
          <div>
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">Assigned Workstation</span>
            <div className="text-3xl font-extrabold tracking-tight text-white mt-0.5 font-mono">
              {pass.stationName}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-black/60 border border-white/[0.06] max-w-xs mx-auto">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Session Remaining
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight text-white mt-0.5 tabular-nums">
              {formatTime(secondsRemaining)}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Ends at {pass.endTime}
            </div>
          </div>

          {/* Perforated Divider with Notch Cutouts */}
          <div className="relative my-4">
            <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-black border border-white/[0.1]" />
            <div className="border-t border-dashed border-zinc-700/80 w-full" />
            <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-black border border-white/[0.1]" />
          </div>

          {/* Dynamic Rolling QR Code */}
          <div className="bg-white p-4 rounded-xl inline-block shadow-inner mx-auto">
            <div className="w-44 h-44 bg-zinc-950 rounded-lg flex flex-col items-center justify-center p-2 relative">
              <QrCode className="w-36 h-36 text-white" />
              <div className="absolute bottom-1 bg-zinc-900 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-300 border border-white/[0.1]">
                {pass.hmacToken}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <RefreshCw className="w-3 h-3 text-zinc-400 animate-spin" />
            <span className="text-[11px]">
              Anti-screenshot pass refreshes in <strong className="text-zinc-300 font-mono">{tokenCounter}s</strong>
            </span>
          </div>

          {/* Booking Meta Details */}
          <div className="grid grid-cols-2 gap-2 text-left pt-3 border-t border-white/[0.06] text-xs font-mono">
            <div>
              <span className="text-zinc-500 text-[10px] block">BOOKING REF</span>
              <span className="font-medium text-white">{pass.bookingId}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-[10px] block">TOTAL VALUE</span>
              <span className="font-medium text-white">{pass.totalRon} RON</span>
            </div>
          </div>
        </div>
      </div>

      {staffCalled && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs flex items-center gap-2 text-zinc-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Floor staff notified for {pass.stationName}.</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onExtendSession}
          className="py-2.5 px-3 rounded-xl bg-white text-zinc-950 font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-200 transition-colors shadow-sm"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Extend (+1h)</span>
        </button>

        <button
          onClick={handleCallStaff}
          className="py-2.5 px-3 rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-300 font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-800 transition-colors"
        >
          <BellRing className="w-3.5 h-3.5 text-zinc-400" />
          <span>Call Staff</span>
        </button>
      </div>
    </div>
  );
};
