import React, { useState, useEffect } from 'react';
import { QrCode, Clock, ShieldCheck, RefreshCw, PlusCircle } from 'lucide-react';
import type { ActivePass } from '../types/mobile';

interface ActivePassViewProps {
  pass: ActivePass;
  onExtendSession: () => void;
}

export const ActivePassView: React.FC<ActivePassViewProps> = ({ pass, onExtendSession }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(pass.remainingSeconds || 7200);
  const [tokenCounter, setTokenCounter] = useState(30);

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

  return (
    <div className="space-y-4 pb-24">
      {/* Top Header */}
      <div className="text-center">
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          SESSION ACTIVE &bull; TURNSTILE PASS
        </span>
        <h1 className="text-2xl font-black text-white mt-1">{pass.stationName}</h1>
        <p className="text-xs text-slate-400">{pass.venueName}</p>
      </div>

      {/* Digital Boarding Pass Ticket */}
      <div className="glass-card rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl relative">
        {/* Glowing top line */}
        <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600" />

        <div className="p-5 text-center space-y-4">
          {/* Animated Countdown Clock */}
          <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" /> Time Left in Session
            </div>
            <div className="text-4xl font-black font-mono tracking-tight text-white mt-1 text-cyan-300">
              {formatTime(secondsRemaining)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Ends at {pass.endTime} &bull; Overstay auto-bills at standard rate
            </div>
          </div>

          {/* Rolling HMAC QR Code Box */}
          <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mx-auto">
            <div className="w-48 h-48 bg-slate-950 rounded-xl flex flex-col items-center justify-center p-3 text-center relative overflow-hidden">
              <QrCode className="w-36 h-36 text-cyan-400" />
              <div className="absolute bottom-1 bg-slate-900/90 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-cyan-300">
                {pass.hmacToken}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>Refreshes in <strong className="text-white font-mono">{tokenCounter}s</strong> (Anti-Screenshot)</span>
          </div>

          {/* Ticket Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-left pt-3 border-t border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 text-[10px]">BOOKING REF</span>
              <div className="font-mono font-bold text-white">{pass.bookingId}</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px]">ZONE / ARENA</span>
              <div className="font-bold text-white">{pass.zoneName}</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px]">DEPOSIT PAID</span>
              <div className="font-mono font-bold text-emerald-400">{pass.depositPaidRon} RON</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px]">TOTAL VALUE</span>
              <div className="font-mono font-bold text-white">{pass.totalRon} RON</div>
            </div>
          </div>
        </div>

        {/* Turnstile pass notice */}
        <div className="bg-slate-900 px-5 py-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> Turnstile Validated
          </span>
          <span className="font-mono text-slate-500">GATE-A</span>
        </div>
      </div>

      {/* Session Actions */}
      <div className="space-y-2">
        <button
          onClick={onExtendSession}
          className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Extend Session (+1 Hour)
        </button>
      </div>
    </div>
  );
};
