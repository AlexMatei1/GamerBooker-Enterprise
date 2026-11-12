export type CompanyRole = 'OWNER' | 'VENUE_MANAGER' | 'RECEPTION' | 'BAR_STAFF';
export type CompanyVenue = { id: string; tenant_id: string; name: string; timezone: string; role: string };
export type AccessContext = { user: { id: string; email: string }; platform_admin: boolean; local_admin_password_only?: boolean; venues: CompanyVenue[] };
export type CompanyTab = 'today' | 'reservations' | 'floor' | 'orders' | 'financials' | 'setup';
export type SetupTab = 'profile' | 'inventory' | 'hours' | 'pricing' | 'layout' | 'guides';
export const COMPANY_TABS: readonly { id: CompanyTab; label: string }[] = [
  { id: 'today', label: 'Astăzi' }, { id: 'reservations', label: 'Rezervări' },
  { id: 'floor', label: 'Sala' }, { id: 'orders', label: 'Comenzi' },
  { id: 'financials', label: 'Încasări' }, { id: 'setup', label: 'Configurare' },
];
export const SETUP_TABS: readonly { id: SetupTab; label: string }[] = [
  { id: 'profile', label: 'Profil' }, { id: 'inventory', label: 'Săli și resurse' },
  { id: 'hours', label: 'Program' }, { id: 'pricing', label: 'Tarife și politici' },
  { id: 'layout', label: 'Planul sălii' }, { id: 'guides', label: 'Ghiduri' },
];
export const roleLabel = (role: string) => ({ OWNER: 'Proprietar', VENUE_MANAGER: 'Manager', RECEPTION: 'Recepție', BAR_STAFF: 'Bar' }[role] ?? role);
export const operationalRole = (role: string) => ['OWNER', 'VENUE_MANAGER', 'RECEPTION'].includes(role);
export const setupRole = (role: string) => ['OWNER', 'VENUE_MANAGER'].includes(role);
export type Booking = { booking_id: string; public_code: string; status: string; starts_at: string; ends_at: string; customer: { email_masked: string }; resource_names?: string[]; resources?: { name: string }[]; is_ready_for_checkin?: boolean };
export type Floor = { venue_id: string; timestamp: string; summary: { total_resources: number; available: number; booked: number; occupied: number; maintenance: number; temp_blocked: number }; resources: { resource_id: string; name: string; type: string; room_name: string | null; zone_name: string | null; current_status: string; active_booking?: { public_code: string; customer_email_masked?: string; ends_at: string } | null }[] };
export type Order = { id: string; status: string; booking_public_code: string; target_resource_name?: string; fulfillment_mode: string; items: { title: string; quantity: number }[] };
export type Inventory = { venue: { id: string; name: string; timezone: string; publication_state: string }; rooms: { id: string; name: string }[]; resources: { id: string; name: string; type: string; status: string; bookable: boolean }[] };
