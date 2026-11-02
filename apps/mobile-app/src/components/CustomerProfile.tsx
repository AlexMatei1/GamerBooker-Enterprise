import React, { useState } from 'react';
import {
  Shield,
  CreditCard,
  Award,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { UserProfile } from '../types/mobile';
import { mobileApi } from '../api/client';

interface CustomerProfileProps {
  profile: UserProfile;
  onLogout: () => void;
}

export const CustomerProfile: React.FC<CustomerProfileProps> = ({ profile, onLogout }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedSuccess, setDeletedSuccess] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    await mobileApi.deleteAccount();
    setIsDeleting(false);
    setDeletedSuccess(true);
    setTimeout(() => {
      onLogout();
    }, 2000);
  };

  const badges = [
    { title: 'Night Owl', desc: '50+ late night sessions', icon: '🦉' },
    { title: 'Esports Finalist', desc: 'Competed in LAN 5v5', icon: '🏆' },
    { title: 'RTX 4090 Enthusiast', desc: '100+ hours in VIP tier', icon: '⚡' },
    { title: 'ANAF Verified', desc: 'Law 42/2024 compliance', icon: '🛡️' },
  ];

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-extrabold">Account Center</span>
        <h1 className="text-2xl font-black text-white">Gamer Profile</h1>
      </div>

      {/* User Card */}
      <div className="glass-card p-4 rounded-3xl border border-slate-800 flex items-center gap-3.5 shadow-xl">
        <img
          src={profile.avatarUrl}
          alt={profile.fullName}
          className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400 shadow-lg shadow-cyan-500/20"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-white truncate">{profile.fullName}</h2>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
              {profile.loyaltyTier}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">{profile.email}</p>
          <p className="text-[11px] text-slate-500 font-mono">{profile.phone}</p>
        </div>
      </div>

      {/* XP Progress Bar Card */}
      <div className="glass-card p-4 rounded-3xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-extrabold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" /> Level 42 Cyber Champion
          </span>
          <span className="font-mono text-cyan-300 font-bold text-[11px]">8,450 / 10,000 XP</span>
        </div>
        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
          <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full rounded-full w-[84.5%]" />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Tier: Challenger Elite</span>
          <span>1,550 XP to Next Arena Tier</span>
        </div>
      </div>

      {/* Gaming Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" /> Time In Arenas
          </div>
          <div className="text-2xl font-black font-mono text-cyan-300 mt-1">
            {profile.hoursPlayedTotal} <span className="text-xs font-normal text-slate-400">Hours</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-400" /> Member Tier
          </div>
          <div className="text-lg font-black text-amber-300 mt-1">
            Elite Pro
          </div>
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-400" /> Arena Achievements ({badges.length})
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <div key={b.title} className="glass-card p-3 rounded-2xl border border-slate-800 flex items-center gap-2.5">
              <span className="text-2xl">{b.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{b.title}</div>
                <div className="text-[10px] text-slate-500 truncate">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Romanian ID & Compliance */}
      <div className="space-y-1 glass-card p-2 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-900/60 transition-colors">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-bold text-white">Romanian ID & Age Verification</div>
              <div className="text-[10px] text-slate-400">Certified for Law 42/2024 compliance</div>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900">
            VERIFIED
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-900/60 transition-colors">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-xs font-bold text-white">Saved Payment Methods</div>
              <div className="text-[10px] text-slate-400">2 Cards stored with 3D Secure 2.0</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </div>
      </div>

      {/* Apple 5.1.1(v) Account Deletion */}
      <div className="p-4 rounded-3xl bg-red-950/20 border border-red-900/40 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Account Deletion (Apple 5.1.1(v) & GDPR Art. 17)</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          You have the immediate right to permanently purge your account, payment tokens, and history.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-1 w-full py-2.5 rounded-xl bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-800/80 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Permanently Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-5 rounded-3xl border border-red-500/40 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Permanently Delete Account?</h3>
              <p className="text-xs text-slate-400 mt-1">
                This action is irreversible. All your booking history, loyalty points, and passes will be permanently erased.
              </p>
            </div>

            {deletedSuccess ? (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center text-xs text-emerald-300 font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Account Erased.
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30"
                >
                  {isDeleting ? 'Purging...' : 'Confirm Purge'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
