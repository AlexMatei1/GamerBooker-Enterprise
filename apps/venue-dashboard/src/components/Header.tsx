import React from "react";
import {
  Aperture,
  CalendarDays,
  Map,
  ShoppingBag,
  Wallet,
  Settings2,
  Search,
  ArrowUpRight,
} from "lucide-react";
import type { VenueRole } from "../types/dashboard";
interface Props {
  currentTab: string;
  onSelectTab: (s: string) => void;
  currentRole: VenueRole;
  onSelectRole: (s: VenueRole) => void;
  venueName: string;
  onOpenCommandPalette: () => void;
}
export const Header: React.FC<Props> = ({
  currentTab,
  onSelectTab,
  currentRole,
  onSelectRole,
  onOpenCommandPalette,
}) => (
  <>
    <aside className="venue-rail">
      <a
        className="wordmark"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab("today");
        }}
      >
        <Aperture size={29} />
        <span>
          Gamer
          <br />
          Booker<span className="brand-dot">.</span>
        </span>
      </a>
      <div className="rail-venue">
        NEXUS ARENA<span>București · Centru</span>
      </div>
      <nav aria-label="Navigație locație">
        {[
          { id: "today", label: "Astăzi", icon: Aperture },
          { id: "reservations", label: "Rezervări", icon: CalendarDays },
          { id: "floor", label: "Sala", icon: Map },
          { id: "bar", label: "Comenzi", icon: ShoppingBag },
          { id: "financials", label: "Încasări", icon: Wallet },
          { id: "layout", label: "Configurare", icon: Settings2 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelectTab(id)}
            className={currentTab === id ? "active" : ""}
          >
            <Icon size={19} />
            {label}
            <span>↗</span>
          </button>
        ))}
      </nav>
      <div className="rail-bottom">
        <span>PROTOTIP LOCAL</span>
        <p>
          Date demonstrative.
          <br />
          Acțiunile nu confirmă operațiuni reale.
        </p>
        <button onClick={() => onSelectTab("runbooks")}>
          Ghiduri operaționale <ArrowUpRight size={15} />
        </button>
      </div>
    </aside>
    <header className="venue-topbar">
      <div>
        <strong>Nexus Gaming Arena</strong>
        <span>București / Europe–Bucharest</span>
      </div>
      <div className="topbar-actions">
        <button aria-label="Caută" onClick={onOpenCommandPalette}>
          <Search size={17} />
          <span>Caută · Ctrl K</span>
        </button>
        <label>
          Rol demo
          <select
            value={currentRole}
            onChange={(e) => onSelectRole(e.target.value as VenueRole)}
          >
            <option value="OWNER">Proprietar</option>
            <option value="VENUE_MANAGER">Manager</option>
            <option value="RECEPTION">Recepție</option>
            <option value="BAR_STAFF">Bar</option>
          </select>
        </label>
      </div>
    </header>
  </>
);
