import React, { useState } from "react";
import type { StationItem } from "../types/mobile";
interface Props {
  stations: StationItem[];
  selectedStation: StationItem | null;
  onSelectStation: (s: StationItem) => void;
  selectedDuration: number;
  onSelectDuration: (n: number) => void;
  onProceedToCheckout: () => void;
  venueName: string;
  startTime: string;
  onSelectStartTime: (s: string) => void;
}
export const SeatPicker: React.FC<Props> = ({
  stations,
  selectedStation,
  onSelectStation,
  selectedDuration,
  onSelectDuration,
  onProceedToCheckout,
  venueName,
  startTime,
  onSelectStartTime,
}) => {
  const [zone, setZone] = useState("Toate"),
    [list, setList] = useState(false);
  const zones = ["Toate", ...new Set(stations.map((s) => s.zone))];
  const shown = stations.filter((s) => zone === "Toate" || s.zone === zone);
  return (
    <div className="reserve-page">
      <h1>Unde joci?</h1>
      <section className="time-selector">
        <div>
          <h2>Ora de început</h2>
          <span>Astăzi · ora locală</span>
        </div>
        <div className="mobile-chips time-chips">
          {["DEMO+15s", "16:00", "18:00", "20:00", "22:00"].map((t) => (
            <button
              key={t}
              aria-pressed={startTime === t}
              onClick={() => onSelectStartTime(t)}
            >
              {t === 'DEMO+15s' ? 'Demo rapid · +15 secunde' : t}
            </button>
          ))}
        </div>
        <div className="duration-line">
          <span>Durată</span>
          <div className="mobile-chips">
            {[1, 2, 3, 5].map((h) => (
              <button
                key={h}
                aria-pressed={h === selectedDuration}
                onClick={() => onSelectDuration(h)}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="results-title">
        <h2>Planul sălii</h2>
        <button className="text-action" onClick={() => setList(!list)}>
          {list ? "Vezi planul" : "Vezi lista"}
        </button>
      </div>
      <div className="mobile-chips zone-chips">
        {zones.map((z) => (
          <button key={z} aria-pressed={zone === z} onClick={() => setZone(z)}>
            {z === "VIP Stage"
              ? "Zona VIP"
              : z === "Esports Pod"
                ? "Zona PC"
                : z === "Console Lounge"
                  ? "Console"
                  : z}
          </button>
        ))}
      </div>
      <div className={"mobile-floor " + (list ? "is-list" : "")}>
        {[...new Set(shown.map((s) => s.zone))].map((z) => (
          <section className="mobile-room" key={z}>
            <h3>
              {z === "VIP Stage"
                ? "01 / Zona VIP"
                : z === "Esports Pod"
                  ? "02 / Zona PC"
                  : z === "Cluj PC"
                    ? "01 / Cluj PC"
                    : "03 / Console"}
            </h3>
            <div className="mobile-station-bank">
              {shown
                .filter((s) => s.zone === z)
                .map((s) => (
                  <button
                    key={s.id}
                    disabled={s.status !== "AVAILABLE"}
                    aria-pressed={selectedStation?.id === s.id}
                    onClick={() => onSelectStation(s)}
                    className={"mobile-seat " + s.status.toLowerCase()}
                  >
                    <strong>
                      {s.name
                        .replace("VIP-", "V")
                        .replace("POD-", "")
                        .replace("PS5-LOUNGE-", "PS5 ")}
                    </strong>
                    <span>
                      {s.status === "AVAILABLE"
                        ? selectedStation?.id === s.id
                          ? "Selectat"
                          : "Liber"
                        : s.status === "OCCUPIED"
                          ? "Ocupat"
                          : "Mentenanță"}
                    </span>
                  </button>
                ))}
            </div>
            <span className="room-access">Acces ↘</span>
          </section>
        ))}
        <div className="floor-wayfinding">
          ← Intrare / recepție <span>Bar →</span>
        </div>
      </div>
      <p className="demo-footnote">
        Plan schematic demo. Starea și textul indică disponibilitatea.
      </p>
      {selectedStation && (
        <section className="selected-detail">
          <p>Locul ales</p>
          <h2>{selectedStation.name}</h2>
          <p>
            {selectedStation.gpu} · {selectedStation.hardware}
          </p>
          <p>{selectedStation.peripherals}</p>
          <strong>{selectedStation.hourlyRate / 100} RON / oră</strong>
        </section>
      )}
      <div className="booking-sticky">
        <div>
          <small>
            {selectedStation?.name || "Alege un loc"} · {selectedDuration}h
          </small>
          <strong>
            {(
              ((selectedStation?.hourlyRate || 0) * selectedDuration) /
              100
            ).toFixed(2)}{" "}
            <span>RON</span>
          </strong>
        </div>
        <button
          className="btn-primary"
          disabled={!selectedStation}
          onClick={onProceedToCheckout}
        >
          Vezi totalul →
        </button>
      </div>
    </div>
  );
};
