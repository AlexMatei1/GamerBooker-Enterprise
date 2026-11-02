import React, { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { ExploreVenues } from './components/ExploreVenues';
import { SeatPicker } from './components/SeatPicker';
import { BookingCheckout } from './components/BookingCheckout';
import { ActivePassView } from './components/ActivePassView';
import { BarOrderingView } from './components/BarOrderingView';
import { CustomerProfile } from './components/CustomerProfile';
import { mockVenues, mockStations, mockMenuItems, mockUserProfile, mobileApi } from './api/client';
import type { Screen, MobileVenue, StationItem, BookingQuote, ActivePass, BarOrder } from './types/mobile';
import { Monitor, Clock, ChevronRight, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('explore');
  const [selectedVenue, setSelectedVenue] = useState<MobileVenue>(mockVenues[0]);
  const [selectedStation, setSelectedStation] = useState<StationItem | null>(mockStations[0]);
  const [selectedDuration, setSelectedDuration] = useState<number>(2);
  const [pendingQuote, setPendingQuote] = useState<BookingQuote | null>(null);
  const [islandExpanded, setIslandExpanded] = useState<boolean>(false);

  // Active pass state - preloaded with a live active session for immediate exploration
  const [activePass, setActivePass] = useState<ActivePass | null>({
    bookingId: 'BK-NX-8492',
    venueName: 'Nexus Gaming Arena Bucharest',
    stationName: 'VIP-01 (RTX 4090)',
    zoneName: 'VIP Stage Arena',
    startTime: 'Today, 18:00',
    endTime: 'Today, 21:00',
    totalRon: '150.00',
    depositPaidRon: '45.00',
    hmacToken: 'GB-HMAC-89A7B3FC',
    sessionStatus: 'ACTIVE',
    remainingSeconds: 6840, // ~1h 54m
  });

  const [activeOrders, setActiveOrders] = useState<BarOrder[]>([
    {
      id: 'FNB-104',
      bookingId: 'BK-NX-8492',
      stationName: 'VIP-01',
      items: [{ item: mockMenuItems[0], quantity: 2 }],
      totalAmount: 2800,
      crockfordCode: '9H3P',
      status: 'PREPARING',
      placedAt: '4 mins ago',
    },
  ]);

  const handleSelectVenue = (venue: MobileVenue) => {
    setSelectedVenue(venue);
    setCurrentScreen('station');
  };

  const handleProceedToCheckout = async () => {
    if (!selectedStation) return;
    const quote = await mobileApi.requestQuote(
      selectedVenue.id,
      selectedStation.id,
      selectedStation.name,
      selectedDuration,
      selectedStation.hourlyRate
    );
    setPendingQuote(quote);
    setCurrentScreen('checkout');
  };

  const handleCompleteBooking = (newPass: ActivePass) => {
    setActivePass(newPass);
    setCurrentScreen('pass');
  };

  const handlePlaceBarOrder = (order: BarOrder) => {
    setActiveOrders((prev) => [order, ...prev]);
  };

  const handleExtendSession = () => {
    if (!activePass) return;
    setActivePass({
      ...activePass,
      remainingSeconds: activePass.remainingSeconds + 3600,
      totalRon: (parseFloat(activePass.totalRon) + 50).toFixed(2),
    });
  };

  const formatRemaining = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Mobile Phone Viewport */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-3 relative pb-24">
        {/* Apple Dynamic Island Live Activity Bar */}
        <div className="sticky top-2 z-40 mb-3 flex flex-col items-center">
          <div
            onClick={() => setIslandExpanded(!islandExpanded)}
            className={`w-full transition-all duration-300 ease-out bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800/80 shadow-2xl rounded-3xl cursor-pointer hover:border-zinc-700/80 px-4 py-2 ${
              islandExpanded ? 'rounded-2xl py-3 border-zinc-700' : ''
            }`}
          >
            {activePass ? (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                    <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{activePass.stationName.split(' ')[0]}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-emerald-400 font-mono tracking-tight font-semibold">Active</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-300 bg-zinc-900/90 px-2 py-0.5 rounded-full border border-zinc-800">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  <span>{formatRemaining(activePass.remainingSeconds)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-zinc-400 py-0.5">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-zinc-300 font-medium tracking-tight">Nexus Arena Bucharest</span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">Fast Pass Ready</span>
              </div>
            )}

            {/* Dynamic Island Expanded Tray */}
            {islandExpanded && activePass && (
              <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-200">
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Current Rig</span>
                  <span className="font-semibold text-zinc-200">{activePass.stationName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentScreen('bar');
                      setIslandExpanded(false);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg transition-colors"
                  >
                    Order F&B
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentScreen('pass');
                      setIslandExpanded(false);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-zinc-200 text-black rounded-lg transition-colors flex items-center gap-1"
                  >
                    <span>Pass</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Screen Routing */}
        {currentScreen === 'explore' && (
          <ExploreVenues venues={mockVenues} onSelectVenue={handleSelectVenue} />
        )}

        {currentScreen === 'station' && (
          <SeatPicker
            stations={mockStations}
            selectedStation={selectedStation}
            onSelectStation={setSelectedStation}
            selectedDuration={selectedDuration}
            onSelectDuration={setSelectedDuration}
            onProceedToCheckout={handleProceedToCheckout}
          />
        )}

        {currentScreen === 'checkout' && pendingQuote && (
          <BookingCheckout
            quote={pendingQuote}
            onBack={() => setCurrentScreen('station')}
            onCompleteBooking={handleCompleteBooking}
          />
        )}

        {currentScreen === 'pass' && (
          activePass ? (
            <ActivePassView pass={activePass} onExtendSession={handleExtendSession} />
          ) : (
            <div className="py-20 text-center space-y-3">
              <p className="text-zinc-400 text-sm">No active session found</p>
              <button
                onClick={() => setCurrentScreen('station')}
                className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-xl transition-colors"
              >
                Book a Station Now
              </button>
            </div>
          )
        )}

        {currentScreen === 'bar' && (
          <BarOrderingView
            stationName={activePass?.stationName || selectedStation?.name || 'VIP-01'}
            menuItems={mockMenuItems}
            activeOrders={activeOrders}
            onPlaceOrder={handlePlaceBarOrder}
          />
        )}

        {currentScreen === 'profile' && (
          <CustomerProfile
            profile={mockUserProfile}
            onLogout={() => {
              setActivePass(null);
              setCurrentScreen('explore');
            }}
          />
        )}

        {/* Global Bottom Navigation */}
        <BottomNav
          currentScreen={currentScreen}
          onSelectScreen={setCurrentScreen}
          hasActiveBooking={!!activePass}
        />
      </div>
    </div>
  );
};

export default App;
