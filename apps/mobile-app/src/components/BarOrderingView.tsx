import React, { useEffect, useRef, useState } from "react";
import { Plus, Minus, Search, ShoppingBag, X } from "lucide-react";
import type { BarMenuItem, BarOrder } from "../types/mobile";
interface Props {
  bookingId:string;
  eligible:boolean;
  onDismiss:()=>void;
  stationName: string;
  cart: Record<string, number>;
  onCartChange: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  menuItems: BarMenuItem[];
  activeOrders: BarOrder[];
  onPlaceOrder: (o: BarOrder) => Promise<boolean>;
}
export const BarOrderingView: React.FC<Props> = ({
  bookingId, eligible, onDismiss,
  stationName,
  cart,
  onCartChange: setCart,
  menuItems,
  activeOrders,
  onPlaceOrder,
}) => {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("ALL"),
    [created, setCreated] = useState<BarOrder | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [submitting,setSubmitting]=useState(false);
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{if(!eligible)setCreated(null);},[eligible]);
  const dismiss=()=>{onDismiss();setCreated(null);};
  const shown = menuItems.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === "ALL" || i.category === category),
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0),
    total = menuItems.reduce((sum, i) => sum + i.price * (cart[i.id] || 0), 0);
  function qty(id: string, change: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + change) }));
  }
  function order() {
    if (!count || !eligible || submitting) return;
    const o: BarOrder = {
      id: "demo-" + Date.now(),
      bookingId,
      stationName,
      items: menuItems
        .filter((i) => cart[i.id] > 0)
        .map((item) => ({ item, quantity: cart[item.id] })),
      totalAmount: total,
      crockfordCode: "D" + Math.floor(100 + Math.random() * 900),
      status: "PLACED",
      placedAt: "Acum",
    };
    setCreated(o);
    setConfirmed(false);
  }
  const states: Record<string, string> = {
    PLACED: "Plasată",
    PREPARING: "În pregătire",
    READY: "Gata de ridicare",
    HANDED_OFF: "Servită",
  };
  return (
    <div className="bar-page">
      <h1>Bar &amp; Snacks</h1>
      <label className="venue-search">
        <Search size={18} />
        <input
          aria-label="Caută produse"
          placeholder="Caută produse…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {activeOrders.length > 0 && (
        <section className="order-progress">
          <h2>Comenzi active</h2>
          {activeOrders.map((o) => (
            <div key={o.id}>
              <strong>
                #{o.crockfordCode} <span>{states[o.status] || o.status}</span>
              </strong>
              <p>
                {o.items
                  .map((i) => i.quantity + " × " + i.item.name)
                  .join(", ")}
              </p>
            </div>
          ))}
        </section>
      )}
      <div className="mobile-chips">
        {[
          ["ALL", "Toate"],
          ["ENERGY", "Energizante"],
          ["DRINK", "Băuturi"],
          ["SNACK", "Gustări"],
          ["HOT_FOOD", "Mâncare"],
          ["ALCOHOL", "Alcool"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="menu-rows">
        {shown.map((i) => (
          <article key={i.id}>
            <div className="menu-product">
              <span>
                <ShoppingBag size={23} />
              </span>
              <div>
                <h2>{i.name}</h2>
                <p>{(i.price / 100).toFixed(2)} RON</p>
                {i.requiresAgeVerification && (
                  <small>Verificare la servire · demo</small>
                )}
                {!i.inStock && <small>Indisponibil</small>}
              </div>
            </div>
            <div className="menu-quantity">
              {(cart[i.id] || 0) > 0 ? (
                <>
                  <button
                    className="btn-secondary"
                    aria-label={"Scade " + i.name}
                    onClick={() => qty(i.id, -1)}
                  >
                    <Minus size={16} />
                  </button>
                  <strong>{cart[i.id]}</strong>
                  <button
                    className="btn-primary"
                    aria-label={"Adaugă " + i.name}
                    onClick={() => qty(i.id, 1)}
                  >
                    <Plus size={16} />
                  </button>
                </>
              ) : (
                <button
                  className="btn-secondary"
                  disabled={!i.inStock}
                  onClick={() => qty(i.id, 1)}
                >
                  <Plus size={16} />
                  Adaugă
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!shown.length && <p className="empty-state">Niciun produs găsit.</p>}
      {count > 0 && eligible && (
        <div className="booking-sticky">
          <div>
            <small>{count} produse în coș</small>
            <strong>
              {(total / 100).toFixed(2)} <span>RON</span>
            </strong>
          </div>
          <button className="btn-primary" onClick={order}>
            Comandă la bar
          </button>
        </div>
      )}
      {created && eligible && (
        <div className="dialog-backdrop">
          <section className="ui-dialog">
            <button
              className="dialog-close"
              aria-label="Închide"
              onClick={dismiss}
            >
              <X />
            </button>
            <p>
              {confirmed ? "Comandă trimisă" : "Verifică comanda"}
            </p>
            <h2>#{created.crockfordCode}</h2>
            <p>
              {created.items
                .map((i) => i.quantity + " × " + i.item.name)
                .join(", ")}
            </p>
            <p>Total: {(created.totalAmount / 100).toFixed(2)} RON</p>
            {confirmed ? (
              <button className="btn-primary" onClick={dismiss}>
                Înapoi la meniu
              </button>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  onClick={dismiss}
                >
                  Anulează
                </button>
                <button
                  className="btn-primary"
                  disabled={submitting}
                  onClick={async () => {
                    if (confirmed || submitting || !eligible) return;
                    setSubmitting(true);
                    const accepted=await onPlaceOrder(created);
                    if(live.current){setSubmitting(false);if(accepted)setConfirmed(true);}
                  }}
                >
                  Trimite comanda
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
