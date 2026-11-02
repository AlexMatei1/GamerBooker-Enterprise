import React, { useState } from 'react';
import {
  ShieldAlert,
  ShoppingBag,
  Plus,
  Minus,
  Search,
  CheckCircle2,
} from 'lucide-react';
import type { BarMenuItem, BarOrder } from '../types/mobile';

interface BarOrderingViewProps {
  stationName: string;
  menuItems: BarMenuItem[];
  activeOrders: BarOrder[];
  onPlaceOrder: (order: BarOrder) => void;
}

export const BarOrderingView: React.FC<BarOrderingViewProps> = ({
  stationName,
  menuItems,
  activeOrders,
  onPlaceOrder,
}) => {
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [createdOrderModal, setCreatedOrderModal] = useState<BarOrder | null>(null);

  const categories = ['ALL', 'ENERGY', 'HOT_FOOD', 'SNACK', 'DRINK', 'ALCOHOL'];

  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const cartTotalCount = Object.values(cart).reduce((sum, q) => sum + q, 0);

  const cartTotalAmount = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find((i) => i.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const handleUpdateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const current = prev[id] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleCheckout = () => {
    if (cartTotalCount === 0) return;

    // Crockford base32 alphabet (excludes I, L, O, U)
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    const items = Object.entries(cart).map(([id, quantity]) => {
      const item = menuItems.find((i) => i.id === id)!;
      return { item, quantity };
    });

    const newOrder: BarOrder = {
      id: 'ord_' + Math.random().toString(36).substring(2, 7),
      bookingId: 'bk_active',
      stationName,
      items,
      totalAmount: cartTotalAmount,
      crockfordCode: code,
      status: 'PLACED',
      placedAt: 'Just now',
    };

    onPlaceOrder(newOrder);
    setCreatedOrderModal(newOrder);
    setCart({});
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-extrabold">
          In-Seat Delivery &bull; Station: {stationName}
        </span>
        <h1 className="text-2xl font-black text-white">Bar & Snacks</h1>
        <p className="text-xs text-slate-400">Order refreshments straight to your desk</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Red Bull, Doritos, Burgers..."
          className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Law 42/2024 Legal Banner */}
      <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-400">Romanian Law 42/2024 Standard</span>: Sale of energy drinks (&gt;150mg/L caffeine) and alcohol to minors under 18 is prohibited by law. Staff will inspect physical ID upon pickup/delivery.
        </div>
      </div>

      {/* Active Orders Section */}
      {activeOrders.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Active F&B Orders</h2>
          {activeOrders.map((ord) => (
            <div
              key={ord.id}
              className="p-3.5 rounded-2xl bg-slate-900 border border-cyan-500/40 flex items-center justify-between shadow-md"
            >
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Order #{ord.id}</span>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] bg-cyan-950 text-cyan-300 font-mono font-bold border border-cyan-800">
                    Code: {ord.crockfordCode}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {ord.items.map((i) => `${i.quantity}x ${i.item.name}`).join(', ')}
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {ord.status}
                </span>
                <div className="text-xs text-white font-mono font-bold mt-0.5">
                  {(ord.totalAmount / 100).toFixed(2)} RON
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {filteredItems.map((item) => {
          const qty = cart[item.id] || 0;
          return (
            <div
              key={item.id}
              className="glass-card p-3 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="text-3xl mb-1.5">{item.imageIcon}</div>
                <div className="text-xs font-bold text-white line-clamp-1">{item.name}</div>
                <div className="text-xs text-cyan-300 font-mono font-extrabold mt-0.5">
                  {(item.price / 100).toFixed(2)} RON
                </div>
                {item.requiresAgeVerification && (
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded mt-1.5 inline-block border border-amber-900">
                    18+ ID Required
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/80">
                {qty === 0 ? (
                  <button
                    onClick={() => handleUpdateQty(item.id, 1)}
                    className="w-full py-1.5 rounded-xl bg-slate-900 hover:bg-cyan-500/20 hover:text-cyan-300 border border-slate-800 text-[11px] font-bold text-slate-300 flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add to Order
                  </button>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <button
                      onClick={() => handleUpdateQty(item.id, -1)}
                      className="w-7 h-7 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 font-bold"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold font-mono text-cyan-300">{qty}</span>
                    <button
                      onClick={() => handleUpdateQty(item.id, 1)}
                      className="w-7 h-7 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center font-bold hover:bg-cyan-400"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Cart Checkout Bar */}
      {cartTotalCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 p-4 max-w-md mx-auto z-40 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
          <button
            onClick={handleCheckout}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-xs flex items-center justify-between px-5 shadow-2xl shadow-cyan-500/30 hover:brightness-110 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span>{cartTotalCount} Items in Order</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black">{(cartTotalAmount / 100).toFixed(2)} RON</span>
              <span className="bg-slate-950 text-cyan-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                Order Now &rarr;
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Order Confirmed Modal */}
      {createdOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-5 rounded-3xl border border-cyan-500/40 space-y-4 bg-slate-950 text-center">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Order Sent to Bar!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your order is being prepared and will be delivered to <strong>{createdOrderModal.stationName}</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Crockford Pickup Code</span>
              <div className="font-mono font-black text-2xl text-cyan-300 tracking-widest">
                {createdOrderModal.crockfordCode}
              </div>
            </div>

            <button
              onClick={() => setCreatedOrderModal(null)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
