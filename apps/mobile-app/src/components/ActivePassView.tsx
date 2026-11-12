import React, { useState } from "react";
import { QrCode, Plus, BellRing } from "lucide-react";
import type { ActivePass } from "../types/mobile";
import { realtime } from "../services/realtime";
export const ActivePassView: React.FC<{
  pass: ActivePass;
  onExtendSession: () => void;
}> = ({ pass, onExtendSession }) => {
  const [notice, setNotice] = useState("");
  const balance = Math.max(
    0,
    Number(pass.totalRon) - Number(pass.depositPaidRon),
  );
  return (
    <div className="pass-page">
      <h1>Ne vedem în sală.</h1>
      <div className="admission-ticket">
        <div className="ticket-top">
          <strong>GAMERBOOKER / ADMIT ONE</strong>
          <span>VALID</span>
        </div>
        <p>{pass.venueName}</p>
        <h2>{pass.stationName.split(" ")[0]}</h2>
        <div className="ticket-zone">{pass.zoneName}</div>
        <div className="ticket-time">
          <div>
            <small>Interval</small>
            <strong>
              {pass.startTime.replace("Today", "Astăzi")} —{" "}
              {pass.endTime.replace("Today, ", "").replace("Astăzi, ", "")}
            </strong>
          </div>
          <div>
            <small>Timp rămas</small>
            <strong>
              {Math.floor(pass.remainingSeconds / 3600)}h{" "}
              {Math.floor((pass.remainingSeconds % 3600) / 60)}m
            </strong>
          </div>
        </div>
        <div className="ticket-perforation" />
        <div className="ticket-qr">
          <div>
            <QrCode size={124} strokeWidth={1.3} />
          </div>
          <p>
            Cod QR Check-in
            <br />
            <strong>Prezintă codul la recepție</strong>
          </p>
        </div>
        <div className="ticket-reference">{pass.bookingId}</div>
        <div className="ticket-balance">
          <span>
            Avans achitat <b>{pass.depositPaidRon} RON</b>
          </span>
          <span>
            Rest la recepție <b>{balance.toFixed(2)} RON</b>
          </span>
          <span>
            Total <b>{pass.totalRon} RON</b>
          </span>
        </div>
      </div>
      <div className="pass-actions">
        <button
          className="btn-primary"
          onClick={() => {
            onExtendSession();
            setNotice(
              "+1h adăugată cu succes la sesiunea ta.",
            );
          }}
        >
          <Plus size={18} />
          Prelungește · +1h
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            realtime.broadcastLocal({
              type: "STAFF_CALL",
              venueId: pass.venueId,
              stationId: pass.stationName,
              data: { bookingId: pass.bookingId },
            });
            setNotice(
              "Solicitarea de asistență a fost trimisă către recepția sălii.",
            );
          }}
        >
          <BellRing size={18} />
          Asistență
        </button>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
};
