export type Screen = 'explore' | 'station' | 'checkout' | 'pass' | 'bar' | 'profile';

export interface MobileVenue {
  id: string;
  name: string;
  slug: string;
  city: string;
  address: string;
  rating: number;
  openNow: boolean;
  closingTime: string;
  baseHourlyRate: number; // in bani (e.g. 3000 = 30.00 RON)
  bannerImage: string;
  tags: string[];
  zonesCount: number;
  totalStations: number;
  availableStations: number;
}

export interface StationItem {
  id: string;
  name: string;
  zone: 'VIP Stage' | 'Esports Pod' | 'Bootcamp 5v5' | 'Console Lounge' | 'Sim Racing';
  hardware: string;
  gpu: string;
  peripherals: string;
  hourlyRate: number; // bani
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
  coordinates: { x: number; y: number };
}

export interface BookingQuote {
  venueId: string;
  stationId: string;
  stationName: string;
  durationHours: number;
  startTime: string;
  endTime: string;
  ratePerHour: number;
  totalAmount: number;
  depositAmount: number;
  remainingOnSite: number;
  signature: string;
  expiresAt: string;
  cancellationCutoff: string;
}

export interface ActivePass {
  bookingId: string;
  venueName: string;
  stationName: string;
  zoneName: string;
  startTime: string;
  endTime: string;
  totalRon: string;
  depositPaidRon: string;
  hmacToken: string;
  sessionStatus: 'UPCOMING' | 'ACTIVE' | 'EXTENDED' | 'COMPLETED';
  remainingSeconds: number;
}

export interface BarMenuItem {
  id: string;
  name: string;
  category: 'ENERGY' | 'SNACK' | 'DRINK' | 'HOT_FOOD' | 'ALCOHOL';
  price: number; // in bani
  requiresAgeVerification: boolean;
  imageIcon: string;
  inStock: boolean;
}

export interface BarOrder {
  id: string;
  bookingId: string;
  stationName: string;
  items: { item: BarMenuItem; quantity: number }[];
  totalAmount: number;
  crockfordCode: string;
  status: 'PLACED' | 'PREPARING' | 'READY' | 'HANDED_OFF';
  placedAt: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  loyaltyTier: 'ELITE_PRO' | 'CHALLENGER' | 'RECRUIT';
  hoursPlayedTotal: number;
  savedCardsCount: number;
  ageVerified: boolean;
}
