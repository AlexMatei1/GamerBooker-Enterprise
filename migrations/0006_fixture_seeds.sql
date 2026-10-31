-- ENG-004: Fixture seeds for initial data (tenants, venues, rooms, zones, resources)
-- No BEGIN/COMMIT here: db/migrate.js wraps each file in one transaction.

-- 1. Tenants
INSERT INTO tenants (id, legal_name, billing_profile)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Tenant', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. Venues (one per tenant)
INSERT INTO venues (id, tenant_id, name, slug, address, publication_state, contact)
VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Demo Venue', 'demo-venue', '{}'::jsonb, 'PUBLISHED', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. Rooms
INSERT INTO rooms (id, venue_id, name, geometry_metadata)
VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Main Hall', '{}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Side Room', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4. Zones (one per room)
INSERT INTO zones (id, room_id, venue_id, name)
VALUES
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Zone A'),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Zone B')
ON CONFLICT (id) DO NOTHING;

-- 5. Resources (PCs, CONSOLE_SETUP, PRIVATE_ROOM)
INSERT INTO resources (id, venue_id, room_id, zone_id, type, name, attributes, bookable, status)
VALUES
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'PC', 'PC #1', '{}'::jsonb, true, 'AVAILABLE'),
  ('88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'PC', 'PC #2', '{}'::jsonb, true, 'AVAILABLE'),
  ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', NULL, NULL, 'PRIVATE_ROOM', 'VIP Suite', '{}'::jsonb, true, 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;
