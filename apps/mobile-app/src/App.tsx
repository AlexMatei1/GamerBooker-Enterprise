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

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('explore');
  const [selectedVenue, setSelectedVenue] = useState<MobileVenue>(mockVenues[0]);
  const [selectedStation, setSelectedStation] = useState<StationItem | null>(mockStations[0]);
  const [selectedDuration, setSelectedDuration] = useState<number>(2);
  const [pendingQuote, setPendingQuote] = useState<BookingQuote | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-4 relative">
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
              <p className="text-slate-400 text-sm">No active session found</p>
              <button
                onClick={() => setCurrentScreen('station')}
                className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl"
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
