import React, { useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Lock,
  AlertCircle,
  Tag,
  Smartphone,
  Wallet,
} from 'lucide-react';
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
  const [paymentMethod, setPaymentMethod] = useState<'APPLE_PAY' | 'CARD' | 'WALLET'>('APPLE_PAY');
  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscountPercent, setAppliedDiscountPercent] = useState<number>(0);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const discountAmount = Math.round((quote.depositAmount * appliedDiscountPercent) / 100);
  const finalDepositDue = Math.max(0, quote.depositAmount - discountAmount);

  const handleApplyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'ENTERPRISE10') {
      setAppliedDiscountPercent(10);
      setPromoMessage('Promo code applied: 10% discount on online deposit!');
    } else {
      setPromoMessage('Invalid voucher. Try ENTERPRISE10');
      setAppliedDiscountPercent(0);
    }
  };

  const handlePay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const newPass: ActivePass = {
        bookingId: 'BK-NX-' + Math.floor(1000 + Math.random() * 9000),
        venueName: 'Nexus Gaming Arena Bucharest',
        stationName: quote.stationName,
        zoneName: 'VIP Arena Pod',
        startTime: quote.startTime,
        endTime: quote.endTime,
        totalRon: (quote.totalAmount / 100).toFixed(2),
        depositPaidRon: (finalDepositDue / 100).toFixed(2),
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
          className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-extrabold">Step 2 of 2</span>
          <h1 className="text-xl font-black text-white">Review & Checkout</h1>
        </div>
      </div>

      {/* Booking Summary Card */}
      <div className="glass-card p-4 rounded-3xl border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">Reserved Rig</div>
            <div className="text-base font-black text-white">{quote.stationName}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold text-slate-400">Duration</div>
            <div className="text-base font-mono font-bold text-cyan-300">{quote.durationHours} Hours</div>
          </div>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>Session Window:</span>
            <span className="font-semibold text-white">{quote.startTime} &rarr; {quote.endTime}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Hourly Rate:</span>
            <span className="font-mono">{(quote.ratePerHour / 100).toFixed(2)} RON/h</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Total Arena Subtotal:</span>
            <span className="font-mono">{(quote.totalAmount / 100).toFixed(2)} RON</span>
          </div>
        </div>

        {/* Deposit Split Box */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/40 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" /> Online Deposit (30%):
            </span>
            <span className="font-mono text-base font-black text-cyan-300">
              {(finalDepositDue / 100).toFixed(2)} RON
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Payable on-site at reception (70%):</span>
            <span className="font-mono">{(quote.remainingOnSite / 100).toFixed(2)} RON</span>
          </div>
        </div>
      </div>

      {/* Promo Code Input */}
      <div className="glass-card p-3 rounded-2xl border border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-cyan-400" />
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Promo Code (ENTERPRISE10)"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleApplyPromo}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors"
          >
            Apply
          </button>
        </div>
        {promoMessage && (
          <div className="text-[11px] text-cyan-400 font-semibold">{promoMessage}</div>
        )}
      </div>

      {/* Payment Method Selector */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Payment Method</span>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setPaymentMethod('APPLE_PAY')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              paymentMethod === 'APPLE_PAY'
                ? 'border-cyan-400 bg-cyan-950/20 text-white shadow-lg shadow-cyan-500/10'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Smartphone className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
            <span className="text-[11px] font-bold block">Apple Pay</span>
          </button>

          <button
            onClick={() => setPaymentMethod('CARD')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              paymentMethod === 'CARD'
                ? 'border-cyan-400 bg-cyan-950/20 text-white shadow-lg shadow-cyan-500/10'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <CreditCard className="w-5 h-5 mx-auto mb-1 text-purple-400" />
            <span className="text-[11px] font-bold block">Credit Card</span>
          </button>

          <button
            onClick={() => setPaymentMethod('WALLET')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              paymentMethod === 'WALLET'
                ? 'border-cyan-400 bg-cyan-950/20 text-white shadow-lg shadow-cyan-500/10'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Wallet className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
            <span className="text-[11px] font-bold block">Arena Coins</span>
          </button>
        </div>
      </div>

      {/* Romanian Statutory Cancellation Accordion */}
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1 text-slate-400">
        <div className="font-bold text-slate-300 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Romanian Cancellation Standard (OG 34/2014)
        </div>
        <p>&bull; 100% refund if cancelled &gt; 2h before session.</p>
        <p>&bull; 50% arena credit voucher if cancelled within 30m - 2h.</p>
      </div>

      {/* Terms Checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
        <input
          type="checkbox"
          checked={agreedTerms}
          onChange={(e) => setAgreedTerms(e.target.checked)}
          className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900"
        />
        <span>
          I agree to the arena policies and confirm my age satisfies Romanian Law 42/2024 for venue admission.
        </span>
      </label>

      {/* Final Action Button */}
      <div className="pt-2">
        <button
          onClick={handlePay}
          disabled={!agreedTerms || isProcessing}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-2xl shadow-cyan-500/30 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Securing Seat & Authorizing...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>
                {paymentMethod === 'APPLE_PAY' ? ' Pay' : 'Pay'}{' '}
                {(finalDepositDue / 100).toFixed(2)} RON &bull; Lock Seat
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
