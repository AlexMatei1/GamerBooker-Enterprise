# Visual Layout Builder — specificație de implementare

## Scop și limite
Proprietarul poate **desena liber** planul sălii și poate plasa elemente vizuale sau resurse rezervabile într-un canvas 2D multi-room. Editorul este un instrument de configurare, **nu** un CAD cu precizie inginerească sau un scanner 3D.

## Model scenă
- `Scene`: coordonate în unități logice, scene bounds, zoom, background, grid.
- `RoomShape`: polygon/rect; fiecare room fizic are `room_id` stabil și denumire.
- `ZoneShape`: polygon/rect în room cu `zone_id`; membership poate fi ajustat explicit.
- `DecorNode`: wall, door, floor, aisle, desk, couch, bar, reception, label, image, decorative shape.
- `ResourceNode`: `resource_id` stabil pentru PC/CONSOLE_SETUP/PRIVATE_ROOM; transform x/y/rotation/size.
- `Layer`: room boundaries / walls / furniture / equipment / labels / occupancy overlay.
- `Revision`: scene JSON cu schema version, author, timestamps, publish state; nu conține solduri/booking statuses.

## Funcții V1 [CONFIRMED / ACCEPTED DESIGN]
1. Free draw walls/doors/rooms/shape & move/resize/rotate; multi-room native, unlimited logically dar limite de performanță explicite.
2. Drag-drop PC, console, private room, mobilier, bar/reception/obstacles, labels.
3. Snap-to-grid configurabil, zoom/pan, undo/redo, multi-select, duplicate, align, rotate, group/ungroup.
4. Preset templates: 5 PCs row, 5v5 mirrored, console lounge, VIP U-shape, private gaming room; configurable counts.
5. Inspector per selected node: stable ID, name, photos, specs, category, zone, policy, hourly price inheritance, status.
6. Bulk edit: 5–100 stații, duplicate & rename incrementally (`PC A1`, ...), change zone/pricing.
7. Preview as customer: published-like 2D map with resource selection, occupancy for sample interval, prices, labels, availability legend.
8. Draft save / validation / publish; audit, rollback of visuals without breaking current bookings.

## Multi-room
- Owner adaugă rooms, denumește, plasează walls & doors, mută resurse între ele; `room_id` immutable.
- Fiecare room poate conține zone: Standard, VIP, Console.
- Room privat rezervabil are un `Resource` de tip PRIVATE_ROOM legat de `RoomShape` și component list; la rezervare se blochează toate componentele active conform snapshot.

## Separarea geometriei de booking
- Geometria vizuală este **doar prezentare**. Schimbarea coordonatelor unui PC nu șterge/clonează resource identity sau booking history.
- Editorul nu deduce automat că două PC-uri sunt adiacente doar din apropiere grafică: trebuie generate/confirmate explicit `adjacency_edges` pentru algoritmul Smart Seat; se pot sugera din geometrie, cu confirmare operator.
- Private room membership explicit în DB; geometria nu controlează singură drepturile de booking.

## Schema scenă exemplificativă
```json
{
  "schema_version": 1,
  "venue_id": "<uuid>",
  "revision": 7,
  "canvas": {"width": 1200, "height": 800, "grid": 20},
  "rooms": [{"id": "room-a", "name": "Sala 1", "shape": {"kind": "rect", "x": 50, "y": 30, "w": 600, "h": 400}}],
  "nodes": [
    {"id": "wall-1", "kind": "WALL", "room_id": "room-a", "geometry": {"x": 50, "y": 30, "w": 600, "h": 10}},
    {"id": "node-pc-a1", "kind": "RESOURCE", "resource_id": "<pc-uuid>", "room_id": "room-a", "x": 120, "y": 100, "rotation": 0},
    {"id": "desk-1", "kind": "FURNITURE", "room_id": "room-a", "geometry": {"x": 90, "y": 140, "w": 80, "h": 40}}
  ]
}
```

## Validare înainte de publish
- Schema conformă, resource IDs existente și aparțin aceluiași venue, fără duplicate nodes pentru același resource fizic (dacă nu are explicit multi-view).
- Fiecare resursă published bookable are categorie, room, zone/policy resolved, preț și calendar.
- Private room component graph fără cycle, resource children fără cross-venue; verificare conflict cu rezervări/hold-uri viitoare.
- Delete/deactivate a resource cu booking viitor → publish respins și workflow explicit de relocare/cancel/refund.
- Obiectele decorative pot fi editate/liber repoziționate; validator avertizează despre elemente suprapuse grafic, dar nu blochează automat dacă designul intenționat permite.
- Publish atomic `draft_revision -> immutable published_revision`, idempotent și concurență optimistă `If-Match`.

## Rollback
Rollback layout publicat creează o **nouă revizie** bazată pe una anterioară și trece prin toate validările. Nu schimbă rezervări sau prețuri existente.

## Colaborare & securitate
- V1: un editor active writer per venue/revision; optimistic lock + conflict UI. Nu este nevoie de collaborative CRDT.
- RBAC: owner/manager pot edita/publish conform permisiunilor; recepția vizualizează doar live map.
- Audit pentru publish: autor, versiune, diff de resurse/zone, decizii de validare, motive.

## Performanță
- Lazy render nodes per room; pan/zoom responsive țintă 60 fps pe desktop uzual în 100 nodes vizibile [PROPOSED].
- Scene JSON versioning + migration; import/export scene doar sub controale de securitate; upload imagini scanat.

## Acceptare
- 3 camere desenate cu walls/doors/decor/PC/PS5/private room, publish succes și preview identic semantic.
- Mutare vizuală PC cu booking viitor nu afectează booking id.
- Ștergere PC rezervat viitor este blocată.
- Rezervare private room suprapusă cu PC intern respinsă.
- Undo/redo, autosave, draft rollback și conflict de publicare testate.
