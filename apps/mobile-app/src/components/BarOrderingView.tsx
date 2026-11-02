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
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
          Station Delivery: {stationName}
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Bar & Provisions</h1>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items..."
          className="w-full bg-zinc-900/90 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Active Orders Banner */}
      {activeOrders.length > 0 && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">Pending Orders ({activeOrders.length})</span>
            <span className="text-[10px] text-zinc-500 font-mono">Kitchen Pipeline</span>
          </div>
          {activeOrders.map((ord) => (
            <div key={ord.id} className="flex items-center justify-between text-xs py-1 border-t border-white/[0.04]">
              <span className="text-zinc-300 truncate max-w-[200px]">
                {ord.items.map((i) => `${i.quantity}x ${i.item.name}`).join(', ')}
              </span>
              <span className="font-mono text-zinc-400 font-medium">#{ord.crockfordCode}</span>
            </div>
          ))}
        </div>
      )}

      {/* Law 42 Warning */}
      <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-300 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium text-amber-200">Law 42/2024 Notice:</span> Energy drinks (&gt;150mg/L) and alcoholic beverages require staff physical 18+ ID inspection upon handoff.
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filteredItems.map((item) => {
          const qty = cart[item.id] || 0;
          return (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-zinc-900/80 border border-white/[0.06] flex flex-col justify-between hover:border-white/[0.12] transition-colors"
            >
              <div>
                <div className="text-2xl mb-1">{item.imageIcon}</div>
                <div className="text-xs font-semibold text-white line-clamp-1">{item.name}</div>
                <div className="text-xs text-zinc-300 font-mono font-medium mt-0.5">
                  {(item.price / 100).toFixed(2)} RON
                </div>
                {item.requiresAgeVerification && (
                  <span className="text-[9px] font-medium text-amber-400 bg-amber-950/40 px-1.5 py-0.2 rounded mt-1 inline-block border border-amber-900/50">
                    18+ ID
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/[0.04]">
                {qty === 0 ? (
                  <button
                    onClick={() => handleUpdateQty(item.id, 1)}
                    className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <button
                      onClick={() => handleUpdateQty(item.id, -1)}
                      className="w-6 h-6 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-mono font-medium text-white">{qty}</span>
                    <button
                      onClick={() => handleUpdateQty(item.id, 1)}
                      className="w-6 h-6 rounded-md bg-white text-zinc-950 flex items-center justify-center font-bold hover:bg-zinc-200"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Cart Button */}
      {cartTotalCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 p-4 max-w-md mx-auto z-40 bg-gradient-to-t from-black via-black/90 to-transparent">
          <button
            onClick={handleCheckout}
            className="w-full py-3.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs flex items-center justify-between px-4 shadow-2xl hover:bg-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span>{cartTotalCount} Items</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold">{(cartTotalAmount / 100).toFixed(2)} RON</span>
              <span className="text-zinc-600 font-normal">&bull;</span>
              <span>Order &rarr;</span>
            </div>
          </button>
        </div>
      )}

      {/* Order Confirmed Modal */}
      {createdOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="p-5 rounded-2xl border border-white/[0.1] bg-zinc-950 max-w-sm w-full space-y-4 text-center shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/[0.1] flex items-center justify-center text-white mx-auto">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Order Dispatched</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Delivering directly to <strong>{createdOrderModal.stationName}</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-white/[0.06] space-y-1">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Crockford Pickup Code</span>
              <div className="font-mono font-bold text-xl text-white tracking-widest">
                {createdOrderModal.crockfordCode}
              </div>
            </div>

            <button
              onClick={() => setCreatedOrderModal(null)}
              className="w-full py-2.5 rounded-xl bg-white text-zinc-950 font-medium text-xs hover:bg-zinc-200"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
