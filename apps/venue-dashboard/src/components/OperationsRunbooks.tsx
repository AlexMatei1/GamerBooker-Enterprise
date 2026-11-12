import React, { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Wrench,
  Search,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { VenueRole } from "../types/dashboard";

interface OperationsRunbooksProps {
  venueId: string;
  role: VenueRole;
}

export const OperationsRunbooks: React.FC<OperationsRunbooksProps> = ({
  venueId,
  role,
}) => {
  const [r1ResourceId, setR1ResourceId] = useState("CYBER-PC-01");
  const [r1Result, setR1Result] = useState<any>(null);
  const [r2IntentRef, setR2IntentRef] = useState("");
  const [r2Result, setR2Result] = useState<any>(null);

  const gates = [
    {
      id: "gate-1",
      name: "Exemplu 1: Publicarea locației",
      status: "PASSED",
      details:
        "Valoare ilustrativă de publicare; starea reală nu este verificată.",
    },
    {
      id: "gate-2",
      name: "Exemplu 2: Revizia planului",
      status: "PASSED",
      details: "Revizie ilustrativă #3; nu confirmă un plan publicat.",
    },
    {
      id: "gate-3",
      name: "Exemplu 3: Resurse rezervabile",
      status: "PASSED",
      details:
        "Scenariu ilustrativ cu 18 locuri; disponibilitatea și tarifele reale nu sunt verificate.",
    },
    {
      id: "gate-4",
      name: "Exemplu 4: Programul locației",
      status: "PASSED",
      details: "Program ilustrativ: luni–duminică 09:00–23:00.",
    },
    {
      id: "gate-5",
      name: "Exemplu 5: Politica locației",
      status: "PASSED",
      details:
        "Politică ilustrativă: avans 40%, anulare cu 3h înainte; nu este o regulă confirmată.",
    },
    {
      id: "gate-6",
      name: "Exemplu 6: Tarife",
      status: "PASSED",
      details:
        "Tarif ilustrativ 30 RON/h; nu a fost verificat un catalog real.",
    },
    {
      id: "gate-7",
      name: "Exemplu 7: Pregătirea personalului",
      status: "EXAMPLE",
      details: "Listă ilustrativă de instruire; nu certifică personalul.",
    },
  ];

  function runR1Audit() {
    setR1Result({
      resource_id: r1ResourceId,
      overlaps_found: 0,
      allegation_verified: false,
      physical_squatting_suspected: true,
      remediation_guidance:
        "Exemplu local, fără acces la baza de date sau la rezervări reale. Nu a fost efectuat un audit al suprapunerilor și nu este stabilită o cauză. Într-un caz real, personalul verifică rezervările și urmează procedura aprobată a locației.",
    });
  }

  function runR2Refund() {
    if (!r2IntentRef.trim()) {
      alert("Introdu o referință ilustrativă pentru această simulare locală.");
      return;
    }
    setR2Result({
      provider_ref: r2IntentRef,
      orphan: true,
      action_taken: "REFUND_SIMULATED_LOCALLY",
      refund_id: `ref_${Date.now()}`,
      notes:
        "Revizuire simulată local. Nu a fost trimisă nicio rambursare și nu a fost efectuată nicio reconciliere financiară reală.",
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="font-extrabold text-base text-white flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-400" />
            Ghiduri operaționale · exemple locale
          </h2>
          <p className="text-xs text-slate-400">
            Scenarii ilustrative. Fără audit al bazei de date, rambursare reală,
            reconciliere financiară sau decizie de lansare.
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs font-extrabold flex items-center gap-2 shadow-sm shadow-emerald-500/20">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          DEMO · FĂRĂ DECIZIE DE LANSARE
        </div>
      </div>

      {/* 7-Gate Go/No-Go Decision Engine Table */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Listă de revizuire · valori ilustrative
        </h3>

        <div className="space-y-2.5">
          {gates.map((g) => (
            <div
              key={g.id}
              className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
            >
              <div className="space-y-0.5">
                <span className="font-bold text-slate-200">{g.name}</span>
                <p className="text-slate-400 text-[11px]">{g.details}</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[10px] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> DEMO
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Runbooks Interactive Simulators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Runbook R1: Double-Booking Allegation Audit */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4 text-xs">
          <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-b border-slate-800 pb-2">
            <Wrench className="w-4 h-4 text-cyan-400" />
            R1 / Revizuirea unei suprapuneri · demo
          </h3>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Afișează un scenariu local prestabilit. Nu citește rezervări reale,
            nu verifică baza de date și nu stabilește o cauză.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={r1ResourceId}
              onChange={(e) => setR1ResourceId(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded text-xs text-white"
              placeholder="ID loc · exemplu local"
            />
            <button
              onClick={runR1Audit}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Search className="w-3.5 h-3.5" /> Arată exemplul local
            </button>
          </div>

          {r1Result && (
            <div className="p-3.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 space-y-2 text-[11px]">
              <div className="flex justify-between font-bold">
                <span className="text-cyan-300">
                  Suprapuneri · valoare ilustrativă:
                </span>
                <span className="text-emerald-400 font-mono">
                  0 · exemplu, fără verificare
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-300">Interpretare locală:</span>
                <span className="text-amber-300">
                  Scenariu ilustrativ, fără constatare
                </span>
              </div>
              <p className="text-slate-300 pt-1 border-t border-slate-800 leading-relaxed">
                {r1Result.remediation_guidance}
              </p>
            </div>
          )}
        </div>

        {/* Runbook R2: Orphan Payment Resolution */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4 text-xs">
          <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-b border-slate-800 pb-2">
            <RotateCcw className="w-4 h-4 text-amber-400" />
            R2 / Revizuirea unei plăți · demo
          </h3>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Afișează un exemplu de revizuire pentru o plată neasociată. Nu
            contactează un furnizor și nu efectuează o rambursare.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={r2IntentRef}
              onChange={(e) => setR2IntentRef(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded text-xs text-white"
              placeholder="Referință ilustrativă · demo_99201"
            />
            <button
              onClick={runR2Refund}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Simulează revizuirea locală
            </button>
          </div>

          {r2Result && (
            <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-2 text-[11px]">
              <div className="flex justify-between font-bold">
                <span className="text-emerald-300">Rezultat local:</span>
                <span className="text-emerald-400">
                  REVIZUIRE SIMULATĂ · FĂRĂ RAMBURSARE
                </span>
              </div>
              <p className="text-slate-300 pt-1 border-t border-slate-800 leading-relaxed font-mono">
                {r2Result.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
