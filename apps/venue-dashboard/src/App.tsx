import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { LiveFloorView } from "./components/LiveFloorView";
import { LayoutBuilder } from "./components/LayoutBuilder";
import { BarBoard } from "./components/BarBoard";
import { PricingPolicies } from "./components/PricingPolicies";
import { FinancialLedger } from "./components/FinancialLedger";
import { OperationsRunbooks } from "./components/OperationsRunbooks";
import { StationClientShell } from "./components/StationClientShell";
import { CommandPalette } from "./components/CommandPalette";
import { PassPreviewOperations } from "./components/PassPreviewOperations";
import type { VenueRole } from "./types/dashboard";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>("today");
  const [currentRole, setCurrentRole] = useState<VenueRole>("OWNER");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const venueId = "v-arena-bucharest-01";
  const venueName = "Nexus Gaming Arena — Bucharest Central";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="dashboard-app">
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        venueName={venueName}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Command Center Content */}
      <main className="venue-main">
        {["today","reservations","pricing"].includes(currentTab) && <PassPreviewOperations />}
        {["today", "floor", "reservations"].includes(currentTab) && (
          <LiveFloorView
            venueId={venueId}
            role={currentRole}
            mode={currentTab}
          />
        )}
        {["layout", "pricing", "runbooks"].includes(currentTab) && (
          <nav className="setup-tabs" aria-label="Configurare">
            {[
              ["layout", "Planul sălii"],
              ["pricing", "Tarife și politici"],
              ["runbooks", "Ghiduri"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={currentTab === id ? "active" : ""}
                onClick={() => setCurrentTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {currentTab === "layout" && (
          <LayoutBuilder venueId={venueId} role={currentRole} />
        )}
        {currentTab === "bar" && (
          <BarBoard venueId={venueId} role={currentRole} />
        )}
        {currentTab === "pricing" && (
          <PricingPolicies venueId={venueId} role={currentRole} />
        )}
        {currentTab === "financials" && (
          <FinancialLedger venueId={venueId} role={currentRole} />
        )}
        {currentTab === "runbooks" && (
          <OperationsRunbooks venueId={venueId} role={currentRole} />
        )}
      </main>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={setCurrentTab}
        onSelectRole={setCurrentRole}
        currentRole={currentRole}
      />

      <footer className="venue-footer">
        GamerBooker · Prototip de operare / Date locale, fără validare fiscală
        sau plăți reale.
      </footer>
    </div>
  );
};

export default App;
