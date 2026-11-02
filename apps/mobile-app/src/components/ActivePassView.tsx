import React, { useState, useEffect } from 'react';
import {
  QrCode,
  RefreshCw,
  PlusCircle,
  BellRing,
  CheckCircle2,
  MapPin,
  Wifi,
  RotateCw,
  Info,
  ShieldCheck,
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
  const [isFlipped, setIsFlipped] = useState(false);

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
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
            Arena Admission
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Boarding Pass</h1>
        </div>

        {/* Flip Card Toggle */}
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.08] text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          <span>{isFlipped ? 'View Pass' : 'Wi-Fi & Info'}</span>
        </button>
      </div>

      {/* Apple Wallet Style Digital Ticket Pass (Flip Card Container) */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="rounded-2xl border border-white/[0.1] bg-[#121215] overflow-hidden shadow-2xl relative cursor-pointer select-none transition-all duration-300 hover:border-white/[0.2]"
      >
        {!isFlipped ? (
          /* FRONT OF TICKET: Live QR Pass */
          <div>
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
                  Dynamic pass token updates in <strong className="text-zinc-300 font-mono">{tokenCounter}s</strong>
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

            <div className="bg-zinc-900/80 px-4 py-2.5 text-center text-[10px] text-zinc-500 border-t border-white/[0.06] flex items-center justify-center gap-1">
              <Info className="w-3 h-3 text-zinc-400" /> Tap pass to view Arena Wi-Fi & Station Guides
            </div>
          </div>
        ) : (
          /* BACK OF TICKET: Wi-Fi Credentials & Arena Info */
          <div className="p-5 space-y-4 min-h-[460px]">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Pass Details & Amenities</span>
              <span className="text-[10px] font-mono text-emerald-400">VERIFIED</span>
            </div>

            {/* High-Speed Wi-Fi Credentials */}
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.06] space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span>Dedicated 10Gbps Player Wi-Fi</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div>
                  <span className="text-[10px] text-zinc-500 block">SSID</span>
                  <span className="text-zinc-200">NEXUS-ARENA-5G</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">PASSWORD</span>
                  <span className="text-zinc-200 font-bold">NexusVIP2026</span>
                </div>
              </div>
            </div>

            {/* Turnstile Navigation */}
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.06] space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Turnstile Admission</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Scan your front QR code at Turnstile Reader #1. The turnstile gate unlocks automatically.
              </p>
            </div>

            {/* Legal Disclosures */}
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.06] space-y-1 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200 text-[11px] block">Romanian Statutory Standard</span>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                OG 34/2014 & Law 42/2024 compliance active. Physical ID check certified by arena staff upon entry.
              </p>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                className="w-full py-2.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs hover:bg-zinc-200"
              >
                Return to QR Pass
              </button>
            </div>
          </div>
        )}
      </div>

      {staffCalled && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs flex items-center gap-2 text-zinc-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Floor technician notified for {pass.stationName}.</span>
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
