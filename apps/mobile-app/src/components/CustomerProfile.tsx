import React, { useState } from 'react';
import {
  Shield,
  CreditCard,
  Award,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Clock,
  Sparkles,
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
    { title: 'Night Owl', desc: '50+ late night sessions' },
    { title: 'LAN Finalist', desc: 'Esports 5v5 Tournament' },
    { title: 'VIP Rig Regular', desc: '100+ hours logged' },
    { title: 'ANAF Verified', desc: 'Law 42/2024 compliance' },
  ];

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
          Settings & Identity
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Profile</h1>
      </div>

      {/* User Card */}
      <div className="p-4 rounded-2xl bg-zinc-900/90 border border-white/[0.08] flex items-center gap-3.5 shadow-xl">
        <img
          src={profile.avatarUrl}
          alt={profile.fullName}
          className="w-14 h-14 rounded-full object-cover border border-white/[0.12]"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white truncate">{profile.fullName}</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-white/[0.06]">
              {profile.loyaltyTier}
            </span>
          </div>
          <p className="text-xs text-zinc-400 truncate">{profile.email}</p>
          <p className="text-[11px] text-zinc-500 font-mono">{profile.phone}</p>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-zinc-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400" /> Level 42 Cyber Champion
          </span>
          <span className="font-mono text-zinc-400 text-[11px]">8,450 / 10,000 XP</span>
        </div>
        <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
          <div className="bg-white h-full rounded-full w-[84.5%]" />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>Challenger Elite</span>
          <span>1,550 XP to Next Tier</span>
        </div>
      </div>

      {/* Gaming Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.06]">
          <div className="text-[10px] text-zinc-500 uppercase font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" /> Arena Time
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {profile.hoursPlayedTotal} <span className="text-xs font-normal text-zinc-500">Hours</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.06]">
          <div className="text-[10px] text-zinc-500 uppercase font-mono flex items-center gap-1">
            <Award className="w-3 h-3" /> Member Tier
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            Elite Pro
          </div>
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block">
          Achievements ({badges.length})
        </span>
        <div className="grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <div key={b.title} className="p-2.5 rounded-xl bg-zinc-900/70 border border-white/[0.06]">
              <div className="text-xs font-semibold text-zinc-200">{b.title}</div>
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Romanian ID & Compliance */}
      <div className="p-1 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-0.5">
        <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800/40 transition-colors">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs font-medium text-white">Romanian ID & Age Verification</div>
              <div className="text-[10px] text-zinc-500">Law 42/2024 compliance active</div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            VERIFIED
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800/40 transition-colors">
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-4 h-4 text-zinc-400" />
            <div>
              <div className="text-xs font-medium text-white">Saved Payment Methods</div>
              <div className="text-[10px] text-zinc-500">2 Cards stored with 3D Secure 2.0</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-600" />
        </div>
      </div>

      {/* Apple 5.1.1(v) Account Deletion */}
      <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/30 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-medium text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Account Deletion (Apple 5.1.1(v) & GDPR Art. 17)</span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          You have the immediate right to permanently purge your account, payment tokens, and reservation history.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-1 w-full py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-900/50 text-xs font-medium transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 inline mr-1.5" />
          Permanently Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="p-5 rounded-2xl border border-rose-500/30 bg-zinc-950 max-w-sm w-full space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Delete Account Permanently?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                This action is irreversible. All booking records, loyalty tier points, and active passes will be permanently erased.
              </p>
            </div>

            {deletedSuccess ? (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-center text-xs text-emerald-300 font-medium">
                Account Erased. Redirecting...
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-lg bg-zinc-900 text-zinc-300 hover:text-white border border-white/[0.08] text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md shadow-rose-600/30"
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
