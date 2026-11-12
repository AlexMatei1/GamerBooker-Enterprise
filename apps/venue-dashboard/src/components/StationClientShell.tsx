import React, { useState, useEffect } from "react";
import {
  Lock,
  Unlock,
  QrCode,
  Clock,
  Sparkles,
  Gamepad2,
  Tv,
  Wifi,
  ShieldCheck,
  Flame,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Play,
  LogOut,
  PlusCircle,
  UtensilsCrossed,
} from "lucide-react";
import { realtime } from "../services/realtime";

interface StationClientShellProps {
  stationId?: string;
  stationName?: string;
  onExitDemo?: () => void;
}

export const StationClientShell: React.FC<StationClientShellProps> = ({
  stationId = "st-vip-01",
  stationName = "VIP-01 (RTX 4090)",
  onExitDemo,
}) => {
  const [isLocked, setIsLocked] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(7200); // 2 hours
  const [activeTab, setActiveTab] = useState<"games" | "apps">("games");
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("ro-RO"),
  );

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("ro-RO"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Session countdown ticker when unlocked
  useEffect(() => {
    if (isLocked) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleLockStation();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked]);

  // Real-time synchronization with mobile app and dashboard
  useEffect(() => {
    const unsubStatus = realtime.subscribe(
      "STATION_STATUS_CHANGED",
      (payload) => {
        if (
          payload.stationId === stationId ||
          payload.stationId === "VIP-01" ||
          payload.stationId?.includes("VIP")
        ) {
          if (payload.data?.status === "OCCUPIED" && isLocked) {
            handleUnlockSuccess(
              payload.data?.customerName || "Alex M. (App Fast Pass)",
            );
          } else if (payload.data?.status === "AVAILABLE" && !isLocked) {
            setIsLocked(true);
          }
        }
      },
    );

    const unsubExtend = realtime.subscribe("SESSION_EXTENDED", (payload) => {
      if (payload.stationId === "VIP-01" || payload.stationId === stationId) {
        setSecondsRemaining((prev) => prev + 3600);
        realtime.playSound("success");
      }
    });

    return () => {
      unsubStatus();
      unsubExtend();
    };
  }, [stationId, isLocked]);

  const handleUnlockSuccess = (userName: string) => {
    setIsLocked(false);
    setSessionUser(userName);
    setPinError(null);
    setPinInput("");
    realtime.playSound("success");
    realtime.broadcastLocal({
      type: "PC_LOCK_EVENT",
      stationId,
      data: {
        status: "UNLOCKED",
        user: userName,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleManualPinUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length >= 4) {
      handleUnlockSuccess(`Player #${pinInput.trim().toUpperCase()}`);
    } else {
      setPinError(
        "Please enter a valid 4-6 digit pass PIN or Crockford token.",
      );
      realtime.playSound("alert");
    }
  };

  const handleLockStation = () => {
    setIsLocked(true);
    setSessionUser(null);
    realtime.playSound("alert");
    realtime.broadcastLocal({
      type: "PC_LOCK_EVENT",
      stationId,
      data: { status: "LOCKED", timestamp: new Date().toISOString() },
    });
  };

  const handleExtendOneHour = () => {
    setSecondsRemaining((prev) => prev + 3600);
    realtime.playSound("success");
    realtime.broadcastLocal({
      type: "SESSION_EXTENDED",
      stationId: "VIP-01",
      data: { remainingSeconds: secondsRemaining + 3600 },
    });
  };

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const gamesList = [
    {
      name: "Counter-Strike 2",
      category: "Tactical Shooter",
      icon: "🎯",
      status: "Ready to Play",
    },
    {
      name: "Valorant",
      category: "Competitive FPS",
      icon: "⚡",
      status: "Updated",
    },
    {
      name: "Cyberpunk 2077",
      category: "Ray Tracing Ultra",
      icon: "🌆",
      status: "Ready",
    },
    { name: "Dota 2", category: "MOBA", icon: "⚔️", status: "Ready" },
    {
      name: "EA Sports FC 25",
      category: "Sports Simulation",
      icon: "⚽",
      status: "Ready",
    },
    {
      name: "League of Legends",
      category: "MOBA",
      icon: "🛡️",
      status: "Ready",
    },
  ];

  return (
    <div className="relative min-h-[720px] rounded-3xl border border-white/[0.1] bg-black overflow-hidden shadow-2xl flex flex-col font-sans select-none">
      {/* Top Demo Bar */}
      <div className="bg-zinc-950 border-b border-white/[0.08] px-4 py-2 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">
            GamerBooker Station Agent v1.0 (Smart Lock)
          </span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-zinc-400">Host: {stationName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-zinc-300">{currentTime}</span>
          {onExitDemo && (
            <button
              onClick={onExitDemo}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold transition-colors"
            >
              Exit Station Client
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. LOCKED WORKSTATION SCREEN (Waiting for QR or PIN)                 */}
      {/* ==================================================================== */}
      {isLocked ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black">
          {/* Animated Ambient Cyber Ring */}
          <div className="absolute w-[600px] h-[600px] rounded-full border border-emerald-500/10 pointer-events-none animate-[spin_60s_linear_infinite]" />
          <div className="absolute w-[450px] h-[450px] rounded-full border border-white/[0.03] pointer-events-none animate-[spin_40s_linear_infinite_reverse]" />

          {/* Station Card Hero */}
          <div className="relative z-10 max-w-md w-full bg-zinc-900/90 border border-white/[0.12] rounded-3xl p-7 shadow-2xl backdrop-blur-2xl text-center space-y-5">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-white/[0.1] flex items-center justify-center text-emerald-400 shadow-inner mb-3">
                <Lock className="w-7 h-7 text-emerald-400" />
              </div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                Nexus Gaming Arena &bull; Rig #01
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
                {stationName}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  RTX 4090 24GB
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  360Hz FAST-IPS
                </span>
              </div>
            </div>

            {/* QR Unlock Area */}
            <div className="bg-black/80 border border-white/[0.08] p-4 rounded-2xl space-y-3">
              <div className="bg-white p-3 rounded-xl inline-block shadow-lg">
                <QrCode className="w-28 h-28 text-black" />
              </div>
              <div className="text-xs text-zinc-300 font-medium">
                Scan with your{" "}
                <span className="text-white font-bold">
                  GamerBooker Mobile App
                </span>{" "}
                to unlock
              </div>
            </div>

            {/* PIN or Crockford Code Unlock Form */}
            <form onSubmit={handleManualPinUnlock} className="space-y-2.5">
              <div className="text-[11px] text-zinc-400">
                Or enter 6-digit Boarding Pass PIN:
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 89A7B3"
                  className="flex-1 bg-black border border-white/[0.12] rounded-xl px-3 py-2 text-center font-mono font-bold text-sm text-emerald-400 tracking-widest focus:outline-none focus:border-emerald-500 uppercase placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock</span>
                </button>
              </div>
              {pinError && (
                <div className="text-[11px] text-rose-400 font-semibold">
                  {pinError}
                </div>
              )}
            </form>

            {/* Quick Demo Simulator Button */}
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => handleUnlockSuccess("Alex M. (Fast Pass)")}
                className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulate 1-Click Mobile QR Scan</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ==================================================================== */
        /* 2. UNLOCKED GAMING DESKTOP LAUNCHER                                  */
        /* ==================================================================== */
        <div className="flex-1 flex flex-col bg-zinc-950 p-6 relative">
          {/* Top HUD Bar (Timer + Quick Actions) */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/90 border border-white/[0.1] p-4 rounded-2xl shadow-xl backdrop-blur-xl mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-zinc-400">Active Player</div>
                <div className="text-sm font-bold text-white">
                  {sessionUser}
                </div>
              </div>
            </div>

            {/* Live Countdown Clock */}
            <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
              <div className="bg-black/80 border border-white/[0.08] px-4 py-2 rounded-xl flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400 animate-spin-slow" />
                <span className="font-mono text-base font-extrabold text-emerald-400 tabular-nums">
                  {formatCountdown(secondsRemaining)}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase font-mono">
                  Left
                </span>
              </div>

              {/* Action Buttons: Extend, Order Snacks, Lock */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExtendOneHour}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.06] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Add 1 hour to this rig session"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+1h</span>
                </button>
                <button
                  onClick={handleLockStation}
                  className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Lock station and end gaming session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Lock Rig</span>
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Launcher Apps / Games */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Installed Games &amp; Esports Suite</span>
              </h3>
              <span className="text-xs text-zinc-500 font-mono">
                SSD Storage: 3.4 TB Free
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gamesList.map((game) => (
                <div
                  key={game.name}
                  className="bg-zinc-900/80 hover:bg-zinc-900 border border-white/[0.06] hover:border-emerald-500/40 p-4 rounded-2xl flex items-center justify-between transition-all group cursor-pointer shadow-sm hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center text-2xl shadow-inner group-hover:border-emerald-500/30 transition-colors">
                      {game.icon}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">
                        {game.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {game.category}
                      </div>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg bg-zinc-800 group-hover:bg-emerald-500 group-hover:text-black text-zinc-200 text-xs font-bold transition-all flex items-center gap-1">
                    <Play className="w-3 h-3 fill-current" />
                    <span>Launch</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
