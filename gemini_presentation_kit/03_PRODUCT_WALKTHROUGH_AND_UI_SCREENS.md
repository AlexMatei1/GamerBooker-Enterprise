# 03 — Product Walkthrough & UI Screens

> **Target Audience for LLM:** Use this document to generate Slides 7, 8, and 9 (Customer Experience, Venue Operations POS, and User Journeys).

---

## 1. Customer Mobile Experience (`apps/mobile-app`)

### Screen 1: Arena Explorer & Interactive 2D Seating Minimap
* **Visual Description:** Sleek Apple-inspired dark mode interface. Gamers browse available gaming arenas (e.g., Nexus Gaming Arena Bucharest), view ratings, and open the interactive seating floorplan.
* **Key Features:**
  * Toggle between *Floor Map View* and *List View*.
  * Filter rigs by category: **VIP RTX 4090**, **Standard RTX 4080**, **PS5 Pro Lounges**, and **Direct-Drive Sim Racing Pods**.
  * Dynamic time window pills (`16:00 - 18:00`, `18:00 - 21:00`).

### Screen 2: Apple Dynamic Island Live Activity Bar
* **Visual Description:** A persistent floating black pill at the top of the mobile device.
* **Behavior:**
  * While playing, displays live session status: `VIP-01 • Active • 1h 54m remaining` with a pulsing green micro-LED.
  * Tapping the pill expands a control tray allowing the gamer to order drinks or extend their time with 1 tap.

### Screen 3: Apple Wallet 3D Flip Ticket Pass
* **Visual Description:** Authentic boarding pass ticket with perforated separation, punch notches, dynamic countdown timer, and rolling HMAC QR code.
* **The 3D Flip Feature:** 
  * Gamers can click **"Flip Pass Details"** to flip the pass in 3D space.
  * The back of the ticket reveals the arena's private 10Gbps Wi-Fi (`NEXUS-ARENA-5G` / password `NexusVIP2026`), automated turnstile instructions, and Romanian Law 42/2024 compliance terms.

### Screen 4: In-Seat Snack & Drink Ordering
* **Visual Description:** Clean visual menu cards for energy drinks (Red Bull, Monster), gaming snacks, and meals. Gamers order from their seat, and a 4-character Crockford Base32 security code (`9H3P`) is issued for staff handoff.

---

## 2. Venue Operations POS Dashboard (`apps/venue-dashboard`)

### Screen 1: The Everyday Counter POS (Live Floor)
* **Design Philosophy:** Clean, tactile, and simple (like Square POS or Clover for gaming lounges). Non-technical counter staff can operate it with zero training.
* **Visual Elements:**
  * **Top Stats Banner:** Displays total rigs, available stations (`11 ready to play`), active gamers (`4 in game`), and today's total revenue.
  * **Color-Coded Station Cards:**
    * 🟢 **Free to Play (Green):** Shows PC name, hardware specs, hourly price (`30 Lei / hr`), and a big **"Quick Start Session"** button.
    * 🟣 **In Game (Purple):** Displays the gamer's name (`Alexandru M.`), **giant readable countdown** (`75m left`), progress bar, and 1-click buttons: **`[+30m]`**, **`[+1h]`**, and **`[End]`**.
    * 🟡 **Reserved (Amber):** Displays upcoming booking arrival with **"Check In"** button.

### Screen 2: 10-Second Walk-In Customer Check-In Wizard
* **Visual Description:** A friendly 3-step modal triggered by clicking **"+ Check In Walk-In Customer"**:
  1. Pick station from dropdown or pre-selected card.
  2. Gamer name (e.g., "Andrei" or automatic numbering).
  3. Select duration pills: `[1 Hour • 30 Lei]`, `[2 Hours • 60 Lei]`, `[3 Hours • 85 Lei]`, `[All-Night Pass • 140 Lei]`.
  4. Choose payment: `[💳 Card POS]` or `[💵 Cash Register]`.
  5. Click **"Start Session & Print Receipt"** $\rightarrow$ Station goes live immediately and prints a thermal Romanian fiscal receipt (TVA 19%).

### Screen 3: Snack & Kitchen Order Board (Bar Board)
* **Visual Description:** Clear Kanban columns (`Orders to Prepare` vs. `Delivered`). Kitchen staff see station destination (`PC-01`), items (`2x Red Bull, 1x Nachos`), and verify the customer's 4-character PIN before marking delivered.

### Screen 4: Cash Register & Daily Sales (Financial Ledger)
* **Visual Description:** Balance visualizer: $Starting Cash + Cash Collected + Card POS - Refunds = Daily Total$. Staff can print the daily ANAF Z-report with 1 click.

### Screen 5: Manager Studio (CAD 2D Layout Studio)
* **Visual Description:** Figma/AutoCAD style 2D vector drafting canvas. Venue managers can drag and drop gaming PCs, consoles, and desks, configure 20px grid snapping, set custom hardware tiers, and publish new floorplans without breaking active reservations.
