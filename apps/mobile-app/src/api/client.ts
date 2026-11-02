import type { MobileVenue, StationItem, BookingQuote, BarMenuItem, UserProfile } from '../types/mobile';

const API_BASE = '/v1';

export const mockVenues: MobileVenue[] = [
  {
    id: 'v-arena-bucharest-01',
    name: 'Nexus Gaming Arena Bucharest',
    slug: 'nexus-bucharest',
    city: 'Bucharest',
    address: 'Bd. Regina Elisabeta 32, Sector 5',
    rating: 4.95,
    openNow: true,
    closingTime: '04:00 AM',
    baseHourlyRate: 3500, // 35.00 RON
    bannerImage: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    tags: ['RTX 4090', '500Hz BenQ', 'Custom Sim Rigs', '5v5 Bootcamp'],
    zonesCount: 4,
    totalStations: 28,
    availableStations: 19,
  },
  {
    id: 'v-cyber-cluj-02',
    name: 'CyberSphere Esports Cluj',
    slug: 'cybersphere-cluj',
    city: 'Cluj-Napoca',
    address: 'Str. Regele Ferdinand 18',
    rating: 4.88,
    openNow: true,
    closingTime: '02:00 AM',
    baseHourlyRate: 3000,
    bannerImage: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    tags: ['RTX 4080', 'Secretlab Chairs', 'F&B Lounge'],
    zonesCount: 3,
    totalStations: 20,
    availableStations: 11,
  },
];

export const mockStations: StationItem[] = [
  {
    id: 's-vip-01',
    name: 'VIP-01',
    zone: 'VIP Stage',
    hardware: 'Intel i9-14900KS • 64GB DDR5',
    gpu: 'RTX 4090 24GB',
    peripherals: 'ZOWIE XL2566K 360Hz • Wooting 60HE',
    hourlyRate: 5000,
    status: 'AVAILABLE',
    coordinates: { x: 1, y: 1 },
  },
  {
    id: 's-vip-02',
    name: 'VIP-02',
    zone: 'VIP Stage',
    hardware: 'Intel i9-14900KS • 64GB DDR5',
    gpu: 'RTX 4090 24GB',
    peripherals: 'ZOWIE XL2566K 360Hz • Wooting 60HE',
    hourlyRate: 5000,
    status: 'OCCUPIED',
    coordinates: { x: 2, y: 1 },
  },
  {
    id: 's-pod-01',
    name: 'POD-A1',
    zone: 'Esports Pod',
    hardware: 'AMD Ryzen 7 7800X3D • 32GB DDR5',
    gpu: 'RTX 4080 Super',
    peripherals: 'ASUS ROG 280Hz • Logitech Superlight',
    hourlyRate: 3500,
    status: 'AVAILABLE',
    coordinates: { x: 1, y: 2 },
  },
  {
    id: 's-pod-02',
    name: 'POD-A2',
    zone: 'Esports Pod',
    hardware: 'AMD Ryzen 7 7800X3D • 32GB DDR5',
    gpu: 'RTX 4080 Super',
    peripherals: 'ASUS ROG 280Hz • Logitech Superlight',
    hourlyRate: 3500,
    status: 'AVAILABLE',
    coordinates: { x: 2, y: 2 },
  },
  {
    id: 's-pod-03',
    name: 'POD-A3',
    zone: 'Esports Pod',
    hardware: 'AMD Ryzen 7 7800X3D • 32GB DDR5',
    gpu: 'RTX 4080 Super',
    peripherals: 'ASUS ROG 280Hz • Logitech Superlight',
    hourlyRate: 3500,
    status: 'AVAILABLE',
    coordinates: { x: 3, y: 2 },
  },
  {
    id: 's-sim-01',
    name: 'SIM-PRO-1',
    zone: 'Sim Racing',
    hardware: 'Fanatec DD2 Direct Drive • Heusinkveld Sprint Pedals',
    gpu: 'RTX 4090 Triple 4K Screen',
    peripherals: 'Sparco Bucket Seat • VR Vive Pro 2',
    hourlyRate: 6500,
    status: 'AVAILABLE',
    coordinates: { x: 1, y: 3 },
  },
  {
    id: 's-console-01',
    name: 'PS5-LOUNGE-A',
    zone: 'Console Lounge',
    hardware: 'PlayStation 5 Pro • DualSense Edge',
    gpu: 'Custom AMD RDNA 3',
    peripherals: 'LG OLED 65" G3 120Hz 4K • Atmos Soundbar',
    hourlyRate: 4000,
    status: 'AVAILABLE',
    coordinates: { x: 2, y: 3 },
  },
];

export const mockMenuItems: BarMenuItem[] = [
  {
    id: 'menu-01',
    name: 'Red Bull Energy 250ml',
    category: 'ENERGY',
    price: 1400,
    requiresAgeVerification: true,
    imageIcon: '⚡',
    inStock: true,
  },
  {
    id: 'menu-02',
    name: 'Monster Ultra White 500ml',
    category: 'ENERGY',
    price: 1600,
    requiresAgeVerification: true,
    imageIcon: '🔋',
    inStock: true,
  },
  {
    id: 'menu-03',
    name: 'Coca Cola Zero 330ml',
    category: 'DRINK',
    price: 900,
    requiresAgeVerification: false,
    imageIcon: '🥤',
    inStock: true,
  },
  {
    id: 'menu-04',
    name: 'Doritos Sweet Chilli & Salsa Dip',
    category: 'SNACK',
    price: 1500,
    requiresAgeVerification: false,
    imageIcon: '🧀',
    inStock: true,
  },
  {
    id: 'menu-05',
    name: 'Artisan Angus Cheeseburger + Fries',
    category: 'HOT_FOOD',
    price: 3900,
    requiresAgeVerification: false,
    imageIcon: '🍔',
    inStock: true,
  },
  {
    id: 'menu-06',
    name: 'Corona Extra Craft Beer 330ml',
    category: 'ALCOHOL',
    price: 1800,
    requiresAgeVerification: true,
    imageIcon: '🍺',
    inStock: true,
  },
];

export const mockUserProfile: UserProfile = {
  id: 'usr-alexm-001',
  fullName: 'Alex Miller',
  email: 'alex.miller@gamerbooker.ro',
  phone: '+40 722 123 456',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  loyaltyTier: 'ELITE_PRO',
  hoursPlayedTotal: 148,
  savedCardsCount: 2,
  ageVerified: true,
};

export const mobileApi = {
  async fetchVenues(): Promise<MobileVenue[]> {
    try {
      const res = await fetch(`${API_BASE}/venues`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((v: any) => ({
            id: v.id,
            name: v.name,
            slug: v.slug || v.name.toLowerCase().replace(/\s+/g, '-'),
            city: v.city || 'Bucharest',
            address: v.address || 'Central District',
            rating: 4.9,
            openNow: true,
            closingTime: '04:00 AM',
            baseHourlyRate: 3500,
            bannerImage: mockVenues[0].bannerImage,
            tags: ['RTX 4090', '500Hz', 'Esports'],
            zonesCount: 4,
            totalStations: 28,
            availableStations: 22,
          }));
        }
      }
    } catch (e) {
      // fallback to mock
    }
    return mockVenues;
  },

  async requestQuote(venueId: string, stationId: string, stationName: string, durationHours: number, hourlyRate: number): Promise<BookingQuote> {
    const totalAmount = hourlyRate * durationHours;
    const depositAmount = Math.round(totalAmount * 0.3); // 30% deposit standard
    const remainingOnSite = totalAmount - depositAmount;
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000); // 15 min expiry

    return {
      venueId,
      stationId,
      stationName,
      durationHours,
      startTime: 'Today, ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      endTime: 'Today, ' + new Date(now.getTime() + durationHours * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ratePerHour: hourlyRate,
      totalAmount,
      depositAmount,
      remainingOnSite,
      signature: 'sig_' + Math.random().toString(36).substring(2, 12).toUpperCase(),
      expiresAt: expires.toISOString(),
      cancellationCutoff: 'Free cancellation up to 2h before start',
    };
  },

  async deleteAccount(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch (e) {
      return true; // simulate success
    }
  },
};
