import React, { useState } from "react";
import {
  ChevronRight,
  CalendarDays,
  Receipt,
  Shield,
  HelpCircle,
  Settings,
} from "lucide-react";
import type { UserProfile } from "../types/mobile";
export const CustomerProfile: React.FC<{
  profile: UserProfile;
  onLogout: () => void;
}> = ({ profile, onLogout }) => {
  const [section, setSection] = useState<string | null>(null);
  return (
    <div className="account-page">
      <h1>Contul meu</h1>
      <div className="profile-identity">
        <span>{profile.fullName.slice(0, 1)}</span>
        <div>
          <h2>{profile.fullName}</h2>
          <p>{profile.email}</p>
          <small>Profil demonstrativ</small>
        </div>
      </div>
      <div className="account-rows">
        {[
          {
            name: "Rezervările mele",
            sub: "Permise și istoricul sesiunilor",
            icon: CalendarDays,
          },
          {
            name: "Plăți și documente",
            sub: "Avansuri, resturi și documente demo",
            icon: Receipt,
          },
          { name: "Setări", sub: "Preferințe și notificări", icon: Settings },
          {
            name: "Confidențialitate",
            sub: "Date personale și opțiuni de cont",
            icon: Shield,
          },
          {
            name: "Ajutor și suport",
            sub: "Întrebări despre rezervări și locații",
            icon: HelpCircle,
          },
        ].map(({ name, sub, icon: Icon }) => (
          <button
            key={name}
            onClick={() => setSection(section === name ? null : name)}
          >
            <Icon size={22} />
            <span>
              <strong>{name}</strong>
              <small>{sub}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      {section && (
        <div className="notice">
          <div>
            <strong>{section}</strong>
            <p>
              Secțiune de prezentare locală. Contul, istoricul și documentele
              reale nu sunt conectate.
            </p>
          </div>
        </div>
      )}
      <button className="btn-secondary" onClick={onLogout}>
        Ieși din sesiunea demo
      </button>
      <p className="demo-footnote">
        Nu sunt stocate carduri și nu se șterge un cont real din acest prototip.
      </p>
    </div>
  );
};
