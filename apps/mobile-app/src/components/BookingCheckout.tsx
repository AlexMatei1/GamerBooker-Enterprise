import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, CreditCard, Lock, AlertCircle } from 'lucide-react';
import type { BookingQuote, ActivePass } from '../types/mobile';

interface BookingCheckoutProps {
  quote: BookingQuote;
  onBack: () => void;
  onCompleteBooking: (pass: ActivePass) => void;
}

export const BookingCheckout: React.FC<BookingCheckoutProps> = ({
  quote,
  onBack,
  onCompleteBooking,
}) => {
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const newPass: ActivePass = {
        bookingId: 'bk_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        venueName: 'Nexus Gaming Arena Bucharest',
        stationName: quote.stationName,
        zoneName: 'VIP Stage',
        startTime: quote.startTime,
        endTime: quote.endTime,
        totalRon: (quote.totalAmount / 100).toFixed(2),
        depositPaidRon: (quote.depositAmount / 100).toFixed(2),
        hmacToken: 'GB-HMAC-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        sessionStatus: 'ACTIVE',
        remainingSeconds: quote.durationHours * 3600,
      };
      onCompleteBooking(newPass);
    }, 1200);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">Step 2 of 2</span>
          <h1 className="text-xl font-black text-white">Review & Checkout</h1>
        </div>
      </div>

      {/* Booking Summary Card */}
      <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="text-xs font-semibold text-slate-400">Reserved Station</div>
            <div className="text-base font-extrabold text-white">{quote.stationName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-400">Duration</div>
            <div className="text-base font-mono font-bold text-cyan-300">{quote.durationHours} Hours</div>
          </div>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>Session Window:</span>
            <span className="font-medium text-white">{quote.startTime} &rarr; {quote.endTime}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Hourly Rate:</span>
            <span className="font-mono">{(quote.ratePerHour / 100).toFixed(2)} RON/h</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Subtotal ({quote.durationHours}h):</span>
            <span className="font-mono">{(quote.totalAmount / 100).toFixed(2)} RON</span>
          </div>
        </div>

        {/* Deposit Split */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" /> Online Deposit (30%):
            </span>
            <span className="font-mono text-base font-extrabold text-cyan-300">
              {(quote.depositAmount / 100).toFixed(2)} RON
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Payable on-site at reception (70%):</span>
            <span className="font-mono">{(quote.remainingOnSite / 100).toFixed(2)} RON</span>
          </div>
        </div>
      </div>

      {/* Statutory Cancellation Horizon Accordion */}
      <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] space-y-1.5 text-slate-400">
        <div className="font-bold text-slate-300 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Romanian Cancellation Policy (OG 34/2014 & Law 42/2024)
        </div>
        <p>
          &bull; <strong>100% Deposit Refund</strong> if cancelled &gt; 2 hours before scheduled slot.
        </p>
        <p>
          &bull; <strong>50% Credit Voucher</strong> if cancelled 30 min &ndash; 2 hours before start.
        </p>
        <p>
          &bull; <strong>No-Show Fee</strong>: Station released 15 min after scheduled start time.
        </p>
      </div>

      {/* Terms Checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
        <input
          type="checkbox"
          checked={agreedTerms}
          onChange={(e) => setAgreedTerms(e.target.checked)}
          className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-900"
        />
        <span>
          I agree to venue arena policies, age verification upon entry, and understand the deposit policy.
        </span>
      </label>

      {/* Payment Action */}
      <div className="pt-2">
        <button
          onClick={handlePay}
          disabled={!agreedTerms || isProcessing}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Securing Seat & Authorizing...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>Pay {(quote.depositAmount / 100).toFixed(2)} RON &bull; Lock Seat</span>
            </div>
          )}
        </button>
        <div className="text-center text-[10px] text-slate-500 mt-2 flex items-center justify-center gap-1">
          <CreditCard className="w-3 h-3" /> Encrypted Stripe / Netopia 3D-Secure 2.0
        </div>
      </div>
    </div>
  );
};
