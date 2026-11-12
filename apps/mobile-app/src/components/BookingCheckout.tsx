import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import type { BookingQuote, ActivePass } from "../types/mobile";
import { realtime } from "../services/realtime";
export const BookingCheckout: React.FC<{
  quote: BookingQuote;
  venueName: string;
  onBack: () => void;
  onCompleteBooking: (p: ActivePass) => void;
}> = ({ quote, venueName, onBack, onCompleteBooking }) => {
  const [promo, setPromo] = useState(""),
    [discount, setDiscount] = useState(0),
    [message, setMessage] = useState(""),
    [terms, setTerms] = useState(false),
    [processing, setProcessing] = useState(false),
    [payment, setPayment] = useState("Card");
  const reduction = Math.round((quote.depositAmount * discount) / 100),
    due = quote.depositAmount - reduction;
  const completion = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (completion.current !== null) clearTimeout(completion.current);
    },
    [],
  );
  function complete() {
    if (completion.current !== null) return;
    const snapshot = { ...quote };
    const bookedVenueName = venueName,
      bookedReduction = reduction,
      bookedDue = due;

    setProcessing(true);
    completion.current = setTimeout(() => {
      const pass: ActivePass = {
        bookingId: "BK-DEMO-" + Math.floor(1000 + Math.random() * 9000),
        venueName: bookedVenueName,
        venueId: snapshot.venueId,
        stationId: snapshot.stationId,
        hourlyRate: snapshot.ratePerHour,
        stationName: snapshot.stationName,
        zoneName: "Loc selectat · demo",
        startTime: snapshot.startTime,
        endTime: snapshot.endTime,
        totalRon: ((snapshot.totalAmount - bookedReduction) / 100).toFixed(2),
        depositPaidRon: (bookedDue / 100).toFixed(2),
        hmacToken: "DEMO-NOT-VALID",
        sessionStatus: "ACTIVE",
        remainingSeconds: snapshot.durationHours * 3600,
      };
      realtime.broadcastLocal({
        type: "STATION_STATUS_CHANGED",
        stationId: snapshot.stationName,
        venueId: snapshot.venueId,
        data: {
          status: "OCCUPIED",
          customerName: "Client demo",
          bookingId: pass.bookingId,
          remainingMinutes: snapshot.durationHours * 60,
        },
      });
      onCompleteBooking(pass);
      setProcessing(false);
    }, 700);
  }
  const money = (n: number) => (n / 100).toFixed(2) + " RON";
  return (
    <div className="checkout-page">
      <button className="text-action" onClick={onBack}>
        <ArrowLeft size={18} /> Înapoi la locuri
      </button>
      <p className="step-line">02 / Rezumat</p>
      <h1>Verifică totalul.</h1>
      <div className="checkout-summary">
        <p>{venueName}</p>
        <h2>{quote.stationName}</h2>
        <div className="checkout-money">
          <span>
            Interval{" "}
            <b>
              {quote.startTime} — {quote.endTime.replace("Astăzi, ", "")}
            </b>
          </span>
          <span>
            Durată <b>{quote.durationHours}h</b>
          </span>
          <span>
            Tarif / oră <b>{money(quote.ratePerHour)}</b>
          </span>
          <span>
            Subtotal <b>{money(quote.totalAmount)}</b>
          </span>
          {discount > 0 && (
            <span>
              Reducere <b>−{money(reduction)}</b>
            </span>
          )}
          <span className="emphasis">
            Avans online (30%) <b>{money(due)}</b>
          </span>
          <span>
            Rest la recepție <b>{money(quote.remainingOnSite)}</b>
          </span>
          <span className="emphasis">
            Total rezervare <b>{money(quote.totalAmount - reduction)}</b>
          </span>
        </div>
      </div>
      <div className="promo-row">
        <input
          aria-label="Cod promo"
          placeholder="Cod promoțional"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
        />
        <button
          className="btn-secondary"
          onClick={() => {
            const valid = promo.trim().toUpperCase() === "ENTERPRISE10";
            setDiscount(valid ? 10 : 0);
            setMessage(
              valid
                ? "Reducere de 10% aplicată cu succes!"
                : "Cod promoțional invalid.",
            );
          }}
        >
          Aplică
        </button>
      </div>
      {message && (
        <p className="promo-message" role="status">
          {message}
        </p>
      )}
      <h2 className="checkout-heading">Metodă de plată</h2>
      <div className="mobile-chips">
        {["Card", "Apple Pay"].map((p) => (
          <button
            key={p}
            onClick={() => setPayment(p)}
            aria-pressed={p === payment}
          >
            {p}
          </button>
        ))}
      </div>
      <h2 className="checkout-heading">Politica de rezervare &amp; check-in</h2>
      <label className="terms-row">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <span>Sunt de acord cu termenii și condițiile de rezervare.</span>
      </label>
      <button
        className="btn-primary checkout-submit"
        disabled={!terms || processing}
        onClick={complete}
      >
        {processing
          ? "Se procesează rezervarea…"
          : "Confirmă și plătește · " + money(due)}
      </button>
    </div>
  );
};
