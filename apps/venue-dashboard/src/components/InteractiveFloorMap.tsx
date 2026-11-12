import React from "react";
import type { LiveStationItem } from "../types/dashboard";
interface Props {
  stations: LiveStationItem[];
  stationAlerts: Record<string, string>;
  onSelectStation: (s: LiveStationItem) => void;
  onQuickWalkIn: (s: LiveStationItem) => void;
}
export const statusLabel: Record<string, string> = {
  AVAILABLE: "Liber",
  OCCUPIED: "În sesiune",
  BOOKED: "Rezervat",
  MAINTENANCE: "Mentenanță",
};
export const InteractiveFloorMap: React.FC<Props> = ({
  stations,
  stationAlerts,
  onSelectStation,
}) => {
  const rooms = [...new Set(stations.map((s) => s.room_name))];
  return (
    <div className="floor-plan">
      <div className="plan-heading">
        <strong>Plan de orientare</strong>
        <span>Schemă demo · stări de rezervare / manuale</span>
      </div>
      <div className="plan-rooms">
        {rooms.map((room, i) => (
          <section className="plan-room" key={room}>
            <header>
              <span>0{i + 1}</span>
              <h3>{room}</h3>
              <small>
                {stations.filter((s) => s.room_name === room).length} locuri
              </small>
            </header>
            <div className="station-bank">
              {stations
                .filter((s) => s.room_name === room)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectStation(s)}
                    className={"plan-station " + s.status.toLowerCase()}
                    aria-label={s.name + " — " + statusLabel[s.status]}
                  >
                    <span className="desk-edge" />
                    <strong>
                      {s.name.split(" (")[0].replace("PS5-PRO-", "PS5-")}
                    </strong>
                    <span>{statusLabel[s.status]}</span>
                    {s.current_session && (
                      <small>{s.current_session.minutes_remaining} min</small>
                    )}
                    {(stationAlerts[s.id] || stationAlerts[s.name]) && (
                      <b>Asistență</b>
                    )}
                  </button>
                ))}
            </div>
            <div className="room-door">Acces ↘</div>
          </section>
        ))}
      </div>
      <div className="plan-aisle">
        <span>← Recepție / intrare</span>
        <span>Culoar de circulație → Bar</span>
      </div>
      <div className="plan-legend">
        {Object.entries(statusLabel).map(([id, label]) => (
          <span key={id}>
            <i className={id.toLowerCase()} />
            {label}
          </span>
        ))}
      </div>
      {stations.length === 0 && (
        <p className="empty-state">Niciun loc pentru filtrele selectate.</p>
      )}
    </div>
  );
};
