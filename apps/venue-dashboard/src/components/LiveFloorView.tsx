import React, { useState, useEffect } from "react";
import { QrCode, Search, X, ArrowUpRight } from "lucide-react";
import { api } from "../api/client";
import { realtime } from "../services/realtime";
import { InteractiveFloorMap, statusLabel } from "./InteractiveFloorMap";
import type {
  FloorOverviewData,
  CheckinQueueItem,
  LiveStationItem,
  VenueRole,
} from "../types/dashboard";
interface Props {
  venueId: string;
  role: VenueRole;
  mode?: string;
}
export const LiveFloorView: React.FC<Props> = ({
  venueId,
  role,
  mode = "today",
}) => {
  const [data, setData] = useState<FloorOverviewData | null>(null),
    [queue, setQueue] = useState<CheckinQueueItem[]>([]);
  const [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState(""),
    [list, setList] = useState(false),
    [selected, setSelected] = useState<LiveStationItem | null>(null);
  const [modal, setModal] = useState<"scan" | "assist" | null>(null),
    [code, setCode] = useState(""),
    [notice, setNotice] = useState(""),
    [alerts, setAlerts] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    Promise.all([api.getLiveFloor(venueId), api.getCheckinQueue(venueId)])
      .then(([floor, q]) => {
        if (active) {
          setData(floor);
          setQueue(q);
        }
      })
      .catch(() => setNotice("Datele nu pot fi încărcate. Reîncarcă pagina."));
    const unsub = realtime.subscribe("STAFF_CALL", (p) => {
      if (p.venueId !== venueId) return;
      const id = p.stationId || p.data?.stationId;
      if (id) setAlerts((a) => ({ ...a, [id]: "Asistență" }));
    });
    const unsubExtend = realtime.subscribe("SESSION_EXTENDED", (p) => {
      if (p.venueId !== venueId) return;
      setData((d) =>
        d
          ? {
              ...d,
              stations: d.stations.map((st) =>
                (st.id === p.stationId ||
                  st.name === p.stationId ||
                  st.name === p.data?.stationName) &&
                st.current_session
                  ? {
                      ...st,
                      current_session: {
                        ...st.current_session,
                        minutes_remaining: Math.floor(
                          (p.data?.remainingSeconds ||
                            (st.current_session.minutes_remaining + 60) * 60) /
                            60,
                        ),
                      },
                    }
                  : st,
              ),
            }
          : d,
      );
    });
    const unsubStatus = realtime.subscribe("STATION_STATUS_CHANGED", (p) => {
      if (p.venueId !== venueId) return;
      setData((d) =>
        d
          ? {
              ...d,
              stations: d.stations.map((st) => {
                if (st.id !== p.stationId && st.name !== p.stationId) return st;
                if (p.data?.status === "OCCUPIED")
                  return {
                    ...st,
                    status: "OCCUPIED",
                    current_session: {
                      booking_id: p.data.bookingId || "DEMO",
                      public_code: "DEMO",
                      customer_name: p.data.customerName || "Client demo",
                      starts_at: new Date().toISOString(),
                      ends_at: new Date(
                        Date.now() + (p.data.remainingMinutes || 120) * 60000,
                      ).toISOString(),
                      minutes_remaining: p.data.remainingMinutes || 120,
                    },
                  };
                return st;
              }),
            }
          : d,
      );
    });
    return () => {
      active = false;
      unsub();
      unsubExtend();
      unsubStatus();
    };
  }, [venueId]);
  if (!data)
    return (
      <p className="empty-state">
        {notice || "Se încarcă datele demonstrative…"}
      </p>
    );
  const stations = data.stations.filter(
    (s) => !s.name.includes("SIMULATOR") && !s.type.includes("RACING"),
  );
  const shown = stations.filter(
    (s) =>
      (filter === "ALL" || s.status === filter) &&
      (
        s.name +
        " " +
        s.room_name +
        " " +
        (s.current_session?.customer_name || "")
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const count = (status: string) =>
    stations.filter((s) => s.status === status).length;
  const attention = stations.filter(
    (s) =>
      (s.current_session?.minutes_remaining ?? 999) <= 30 ||
      alerts[s.id] ||
      alerts[s.name],
  );
  const canOperate = role !== "BAR_STAFF";
  function checkin(item: CheckinQueueItem) {
    setQueue((q) => q.filter((i) => i.booking_id !== item.booking_id));
    setNotice(
      "Demo local: sosirea " +
        item.customer_name +
        " a fost marcată. Nicio validare server.",
    );
    setModal(null);
  }
  function updateStation(minutes?: number) {
    if (
      !selected ||
      !canOperate ||
      (!minutes && ["OCCUPIED", "BOOKED"].includes(selected.status))
    )
      return;
    setData((d) =>
      d
        ? {
            ...d,
            stations: d.stations.map((s) =>
              s.id !== selected.id
                ? s
                : minutes && s.current_session
                  ? {
                      ...s,
                      current_session: {
                        ...s.current_session,
                        minutes_remaining:
                          s.current_session.minutes_remaining + minutes,
                      },
                    }
                  : {
                      ...s,
                      status:
                        s.status === "MAINTENANCE"
                          ? "AVAILABLE"
                          : "MAINTENANCE",
                    },
            ),
          }
        : d,
    );
    setNotice("Modificare simulată local. Starea nu controlează echipamentul.");
    setSelected(null);
  }
  return (
    <div className="operations-page">
      <div className="page-title">
        <div>
          <p>
            {new Date().toLocaleDateString("ro-RO", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            · Demo local
          </p>
          <h1>
            {mode === "reservations"
              ? "Sosiri și rezervări"
              : mode === "floor"
                ? "Sala, dintr-o privire."
                : "Astăzi, în sală."}
          </h1>
        </div>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => setModal("assist")}>
            Ajută un client
          </button>
          <button
            className="btn-primary"
            disabled={!canOperate}
            onClick={() => setModal("scan")}
          >
            <QrCode size={18} />
            Scanează rezervarea
          </button>
        </div>
      </div>
      <div className="summary-line">
        <span>
          <strong>{count("OCCUPIED")}</strong> în sesiune
        </span>
        <span>
          <strong>{count("AVAILABLE")}</strong> libere
        </span>
        <span>
          <strong>{queue.length}</strong> sosiri așteptate
        </span>
        <span>
          <strong>{count("MAINTENANCE")}</strong> mentenanță
        </span>
        <small>{stations.length} locuri în setul demo</small>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            aria-label="Închide notificarea"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="operations-grid">
        <section className="floor-workspace">
          <div className="floor-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Caută loc sau client"
                placeholder="Caută loc, cameră sau client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="view-switch">
              <button aria-pressed={!list} onClick={() => setList(false)}>
                Plan
              </button>
              <button aria-pressed={list} onClick={() => setList(true)}>
                Listă
              </button>
            </div>
          </div>
          <div className="filter-row">
            {[["ALL", "Toate"], ...Object.entries(statusLabel)].map(
              ([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}{" "}
                  <small>{id === "ALL" ? stations.length : count(id)}</small>
                </button>
              ),
            )}
          </div>
          {mode === "reservations" ? (
            <div className="reservation-table">
              <h2>Rezervări din aplicație</h2>
              {queue.map((q) => (
                <div key={q.booking_id}>
                  <strong>{q.customer_name}</strong>
                  <span>
                    {q.resource_names.join(", ")} · {q.public_code}
                  </span>
                  <span>Rest {(q.due_balance_minor / 100).toFixed(2)} RON</span>
                  <button
                    className="btn-primary"
                    disabled={!canOperate}
                    onClick={() => checkin(q)}
                  >
                    Sosire demo
                  </button>
                </div>
              ))}
              {!queue.length && (
                <p className="empty-state">
                  Nu mai sunt sosiri în coada locală.
                </p>
              )}
            </div>
          ) : list ? (
            <div className="station-list">
              {shown.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)}>
                  <strong>{s.name}</strong>
                  <span>{s.room_name}</span>
                  <span>{statusLabel[s.status]}</span>
                  <span>{s.rate_minor / 100} RON/h ↗</span>
                </button>
              ))}
            </div>
          ) : (
            <InteractiveFloorMap
              stations={shown}
              stationAlerts={alerts}
              onSelectStation={setSelected}
              onQuickWalkIn={setSelected}
            />
          )}
        </section>
        <aside className="attention-queue">
          <div className="attention-title">
            <h2>La recepție</h2>
            <span>{queue.length + attention.length}</span>
          </div>
          <h3>Sosesc în curând</h3>
          {queue.map((q) => (
            <article key={q.booking_id}>
              <div>
                <strong>{q.customer_name}</strong>
                <ArrowUpRight size={16} />
              </div>
              <p>
                {q.resource_names.join(", ")} · {q.public_code}
              </p>
              <p>
                Rest de achitat{" "}
                <b>{(q.due_balance_minor / 100).toFixed(2)} RON</b>
              </p>
              <button
                className="btn-secondary"
                disabled={!canOperate}
                onClick={() => {
                  setCode(q.public_code);
                  setModal("scan");
                }}
              >
                Verifică permisul
              </button>
            </article>
          ))}
          {!queue.length && <p>Toate sosirile locale sunt marcate.</p>}
          <h3>Necesită atenție</h3>
          {attention.map((s) => (
            <article key={s.id}>
              <strong>{s.name}</strong>
              <p>
                {alerts[s.id] || alerts[s.name]
                  ? "Asistență solicitată"
                  : s.current_session?.minutes_remaining +
                    " minute până la final"}
              </p>
              <button onClick={() => setSelected(s)}>Vezi sesiunea →</button>
            </article>
          ))}
          {!attention.length && <p>Nicio alertă în setul demo.</p>
        </aside>
      </div>
      {selected && (
        <div className="dialog-backdrop" onClick={() => setSelected(null)}>
          <section className="ui-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              className="dialog-close"
              aria-label="Închide"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <p>
              {selected.room_name} · {statusLabel[selected.status]}
            </p>
            <h2>{selected.name}</h2>
            <p>{selected.rate_minor / 100} RON / oră · date demo</p>
            {selected.current_session && (
              <p>
                {selected.current_session.customer_name} ·{" "}
                {selected.current_session.minutes_remaining} minute rămase
              </p>
            )}
            <div className="dialog-actions">
              {selected.current_session && (
                <button
                  className="btn-secondary"
                  disabled={!canOperate}
                  onClick={() => updateStation(30)}
                >
                  Simulează +30 min
                </button>
              )}
              <button
                className="btn-secondary"
                disabled={
                  !canOperate ||
                  ["OCCUPIED", "BOOKED"].includes(selected.status)
                }
                onClick={() => updateStation()}
              >
                {selected.status === "MAINTENANCE"
                  ? "Marchează liber · demo"
                  : "Marchează mentenanță · demo"}
              </button>
              {(alerts[selected.id] || alerts[selected.name]) && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setAlerts((a) => {
                      const next = { ...a };
                      delete next[selected.id];
                      delete next[selected.name];
                      return next;
                    });
                    setNotice("Cererea demo a fost marcată ca rezolvată.");
                    setSelected(null);
                  }}
                >
                  Marchează asistența rezolvată
                </button>
              )}
              <button
                className="btn-primary"
                onClick={() => {
                  setSelected(null);
                  setModal("assist");
                }}
              >
                Instrucțiuni pentru client
              </button>
            </div>
          </section>
        </div>
      )}
      {modal && (
        <div className="dialog-backdrop">
          <section className="ui-dialog">
            <button
              className="dialog-close"
              aria-label="Închide"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            <QrCode size={32} />
            <h2>
              {modal === "scan"
                ? "Verifică rezervarea"
                : "Client fără rezervare?"}
            </h2>
            {modal === "assist" ? (
              <>
                <p>
                  Clientul rezervă singur din aplicația instalată GamerBooker.
                  Recepția îl poate ajuta să găsească locația și locul dorit.
                </p>
                <ol>
                  <li>Deschide aplicația și alege Nexus Arena.</li>
                  <li>Alege intervalul, locul și verifică totalul.</li>
                  <li>Prezintă permisul confirmat la recepție.</li>
                </ol>
                <div className="notice">
                  Acest prototip nu creează rezervări pentru clienți.
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = queue.find(
                    (q) =>
                      q.public_code.toLowerCase() === code.trim().toLowerCase(),
                  );
                  if (q) checkin(q);
                  else
                    setNotice(
                      "Cod negăsit în coada demo. Nu a fost validat și nu s-a efectuat check-in.",
                    );
                }}
              >
                <p>
                  Simulare cu un cod din coada locală. Camera și validarea
                  server nu sunt conectate.
                </p>
                <input
                  aria-label="Cod rezervare"
                  placeholder="Codul din coada demo"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn-primary">Verifică în datele demo</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
