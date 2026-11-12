import React, { useState } from "react";
import { Search, MapPin, ArrowUpRight, X } from "lucide-react";
import type { MobileVenue } from "../types/mobile";
export const ExploreVenues: React.FC<{
  venues: MobileVenue[];
  onSelectVenue: (v: MobileVenue) => void;
}> = ({ venues, onSelectVenue }) => {
  const [search, setSearch] = useState(""),
    [tag, setTag] = useState("Toate"),
    [inspect, setInspect] = useState<MobileVenue | null>(null);
  const shown = venues.filter(
    (v) =>
      (v.name + " " + v.city + " " + v.tags.join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (tag === "Toate" || v.tags.some((t) => t.includes(tag))),
  );
  return (
    <div className="explore-page">
      <div className="city-line">
        <MapPin size={16} /> România <span>Locații demonstrative</span>
      </div>
      <h1>
        Găsește-ți
        <br />
        locul de joc.
      </h1>
      <label className="venue-search">
        <Search size={19} />
        <input
          placeholder="Caută o sală sau un oraș"
          aria-label="Caută o sală sau un oraș"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="mobile-chips">
        {["Toate", "RTX 4090", "RTX 4080"].map((t) => (
          <button key={t} aria-pressed={tag === t} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="results-title">
        <h2>Săli de explorat</h2>
        <span>{shown.length} locații</span>
      </div>
      {shown.map((v, i) => (
        <button className="venue-row" key={v.id} onClick={() => setInspect(v)}>
          <div
            className={"venue-drawing variant-" + i}
            aria-label="Ilustrație schematică de sală, nu fotografie"
          >
            <span>0{i + 1}</span>
            <div className="drawing-desks">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <i key={n} />
              ))}
            </div>
            <small>PC / CONSOLE</small>
          </div>
          <div className="venue-row-copy">
            <div className="city-price">
              <span>{v.city}</span>
              <strong>
                {v.baseHourlyRate / 100} <small>RON/h</small>
              </strong>
            </div>
            <h3>{v.name.replace(" Bucharest", "")}</h3>
            <p>{v.address}</p>
            <div className="venue-row-bottom">
              <span>{v.availableStations} locuri · disponibilitate demo</span>
              <ArrowUpRight size={20} />
            </div>
          </div>
        </button>
      ))}
      {!shown.length && (
        <p className="empty-state">
          Nicio sală găsită. Încearcă alt oraș sau șterge filtrul.
        </p>
      )}
      <p className="demo-footnote">
        Prototip web de prezentare. Rezervările reale vor fi disponibile
        exclusiv în aplicația instalată.
      </p>
      {inspect && (
        <div className="dialog-backdrop">
          <section className="ui-dialog">
            <button
              className="dialog-close"
              aria-label="Închide"
              onClick={() => setInspect(null)}
            >
              <X />
            </button>
            <p>
              {inspect.city} · {inspect.zonesCount} zone
            </p>
            <h2>{inspect.name}</h2>
            <p>{inspect.address}</p>
            <p>{inspect.tags.filter((t) => !t.includes("Sim")).join(" · ")}</p>
            <p>
              De la {inspect.baseHourlyRate / 100} RON / oră · program demo până
              la {inspect.closingTime}
            </p>
            <div className="notice">
              Planurile și locurile prezentate sunt exemple locale.
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                onSelectVenue(inspect);
                setInspect(null);
              }}
            >
              Alege un loc în demo →
            </button>
          </section>
        </div>
      )}
    </div>
  );
};
