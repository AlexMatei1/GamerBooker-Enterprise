import React from "react";
import { Compass, Ticket, User } from "lucide-react";
import type { Screen } from "../types/mobile";
export const BottomNav: React.FC<{
  currentScreen: Screen;
  onSelectScreen: (s: Screen) => void;
  hasActiveBooking: boolean;
}> = ({ currentScreen, onSelectScreen, hasActiveBooking }) => (
  <nav className="mobile-bottom-nav" aria-label="Navigație principală">
    {[
      { id: "explore", label: "Explorează", icon: Compass },
      { id: "pass", label: "Permise", icon: Ticket },
      { id: "profile", label: "Cont", icon: User },
    ].map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        aria-current={
          currentScreen === id ||
          (id === "explore" && ["station","checkout"].includes(currentScreen)) || (id === "pass" && currentScreen === "bar")
            ? "page"
            : undefined
        }
        onClick={() => onSelectScreen(id as Screen)}
      >
        <Icon size={22} />
        <span>{label}</span>
        {id === "pass" && hasActiveBooking && <i />}
      </button>
    ))}
  </nav>
);
