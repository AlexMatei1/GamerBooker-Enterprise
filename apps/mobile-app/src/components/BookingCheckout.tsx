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
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import type { BookingQuote, ActivePass } from '../types/mobile';
import { realtime } from '../services/realtime';

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
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [cardName, setCardName] = useState('ALEX M.');

  const discountAmount = Math.round((quote.depositAmount * appliedDiscountPercent) / 100);
  const finalDepositDue = Math.max(0, quote.depositAmount - discountAmount);

  const handleApplyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'ENTERPRISE10') {
      setAppliedDiscountPercent(10);
      setPromoMessage('10% voucher discount applied to online deposit.');
    } else {
      setPromoMessage('Invalid voucher. Try ENTERPRISE10');
      setAppliedDiscountPercent(0);
    }
  };

  const handlePay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      realtime.playSound('ready');
      realtime.triggerHaptic([60, 80, 60]);

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

      // Broadcast real-time booking event to venue dashboard
      realtime.broadcast({
        type: 'STATION_STATUS_CHANGED',
        stationId: quote.stationName.split(' ')[0],
        venueId: 'v-arena-bucharest-01',
        data: {
          status: 'OCCUPIED',
          customerName: cardName || 'Alex M.',
          bookingId: newPass.bookingId,
          remainingMinutes: quote.durationHours * 60,
        },
      });

      onCompleteBooking(newPass);
    }, 1400);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">Step 2 of 2</span>
          <h1 className="text-xl font-bold tracking-tight text-white">Review & Settle</h1>
        </div>
      </div>

      {/* Booking Summary Box */}
      <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/[0.08] space-y-3 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div>
            <div className="text-[11px] text-zinc-400">Assigned Station</div>
            <div className="text-base font-bold text-white">{quote.stationName}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-zinc-400">Duration</div>
            <div className="text-base font-mono font-semibold text-zinc-100">{quote.durationHours} Hours</div>
          </div>
        </div>

        <div className="space-y-1 text-xs text-zinc-400">
          <div className="flex justify-between">
            <span>Window:</span>
            <span className="text-zinc-200">{quote.startTime} &rarr; {quote.endTime}</span>
          </div>
          <div className="flex justify-between">
            <span>Hourly Rate:</span>
            <span className="font-mono text-zinc-200">{(quote.ratePerHour / 100).toFixed(2)} RON/h</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono text-zinc-200">{(quote.totalAmount / 100).toFixed(2)} RON</span>
          </div>
        </div>

        {/* Deposit Split Box */}
        <div className="p-3 rounded-lg bg-black/60 border border-white/[0.06] space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Online Deposit (30%):
            </span>
            <span className="font-mono text-sm font-bold text-white">
              {(finalDepositDue / 100).toFixed(2)} RON
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] text-zinc-500">
            <span>Settled on-site at reception (70%):</span>
            <span className="font-mono">{(quote.remainingOnSite / 100).toFixed(2)} RON</span>
          </div>
        </div>
      </div>

      {/* Promo Code Input */}
      <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Voucher code (ENTERPRISE10)"
            className="flex-1 bg-transparent px-1 text-xs text-zinc-200 uppercase font-mono placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={handleApplyPromo}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 transition-colors"
          >
            Apply
          </button>
        </div>
        {promoMessage && (
          <div className="text-[11px] text-emerald-400 font-medium pl-6">{promoMessage}</div>
        )}
      </div>

      {/* Payment Method Selector */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-zinc-400 block">Payment Method</span>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setPaymentMethod('APPLE_PAY')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              paymentMethod === 'APPLE_PAY'
                ? 'border-white bg-zinc-800 text-white shadow-sm'
                : 'border-white/[0.06] bg-zinc-900 text-zinc-400'
            }`}
          >
            <Smartphone className="w-4 h-4 mx-auto mb-1 text-zinc-200" />
            <span className="text-[11px] font-medium block">Apple Pay</span>
          </button>

          <button
            onClick={() => setPaymentMethod('CARD')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              paymentMethod === 'CARD'
                ? 'border-white bg-zinc-800 text-white shadow-sm'
                : 'border-white/[0.06] bg-zinc-900 text-zinc-400'
            }`}
          >
            <CreditCard className="w-4 h-4 mx-auto mb-1 text-zinc-200" />
            <span className="text-[11px] font-medium block">Credit Card</span>
          </button>

          <button
            onClick={() => setPaymentMethod('WALLET')}
            className={`p-2.5 rounded-xl border text-center transition-all ${
              paymentMethod === 'WALLET'
                ? 'border-white bg-zinc-800 text-white shadow-sm'
                : 'border-white/[0.06] bg-zinc-900 text-zinc-400'
            }`}
          >
            <Wallet className="w-4 h-4 mx-auto mb-1 text-zinc-200" />
            <span className="text-[11px] font-medium block">Arena Coins</span>
          </button>
        </div>

        {/* Live Stripe Card Elements / Apple Pay Visual Sheet */}
        {paymentMethod === 'CARD' && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-white/[0.1] space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-white/[0.06] pb-1.5">
              <span className="font-semibold text-zinc-200">Stripe Card Details</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 256-bit Encrypted
              </span>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Cardholder Name</label>
              <input
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value.toUpperCase())}
                placeholder="ALEX M."
                className="w-full bg-black border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Card Number</label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="4242 4242 4242 4242"
                className="w-full bg-black border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono tracking-wider focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Expires</label>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/YY"
                  className="w-full bg-black border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono text-center focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">CVC / CVV</label>
                <input
                  type="text"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  placeholder="888"
                  className="w-full bg-black border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono text-center focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {paymentMethod === 'APPLE_PAY' && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-white/[0.1] text-center space-y-2 animate-in fade-in duration-150">
            <div className="w-10 h-10 rounded-2xl bg-white text-black mx-auto flex items-center justify-center font-bold text-lg shadow-md">
              
            </div>
            <div className="text-xs font-semibold text-white">Apple Pay Ready</div>
            <div className="text-[11px] text-zinc-400">
              Double-click side button or use Touch ID on your device to confirm deposit.
            </div>
          </div>
        )}
      </div>

      {/* Romanian Terms */}
      <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04] text-[11px] space-y-1 text-zinc-400">
        <div className="font-medium text-zinc-300 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-zinc-400" /> Romanian Cancellation Standard (OG 34/2014)
        </div>
        <p>&bull; 100% refund if cancelled &gt; 2h before session.</p>
        <p>&bull; 50% arena credit voucher if cancelled within 30m - 2h.</p>
      </div>

      {/* Checkbox */}
      <label className="flex items-start gap-2 cursor-pointer text-xs text-zinc-400 select-none">
        <input
          type="checkbox"
          checked={agreedTerms}
          onChange={(e) => setAgreedTerms(e.target.checked)}
          className="mt-0.5 rounded border-zinc-700 text-white bg-zinc-900"
        />
        <span className="text-[11px]">
          I agree to venue policies and confirm my age satisfies Romanian Law 42/2024 for venue admission.
        </span>
      </label>

      {/* Pay Button */}
      <div className="pt-1">
        <button
          onClick={handlePay}
          disabled={!agreedTerms || isProcessing}
          className="w-full py-3.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              <span>Authorizing with Bank...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
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
