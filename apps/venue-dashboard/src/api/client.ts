import type {
  FloorOverviewData,
  CheckinQueueItem,
  BarOrder,
  LayoutDraft,
  ReconciliationReport,
  PolicyPreviewScenario,
} from "../types/dashboard";

const API_BASE = "/v1";

async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody.message || errorBody.error?.message || `HTTP ${res.status}`,
    );
  }

  return res.json();
}

export const api = {
  // Live floor
  async getLiveFloor(venueId: string): Promise<FloorOverviewData> {
    try {
      return await fetchJson<FloorOverviewData>(
        `${API_BASE}/dashboard/venues/${venueId}/live-floor`,
      );
    } catch {
      // Fallback demo data
      return {
        venue_id: venueId,
        timestamp: new Date().toISOString(),
        counts: {
          total: 18,
          available: 11,
          occupied: 4,
          booked: 2,
          maintenance: 1,
        },
        stations: [
          {
            id: "st-01",
            name: "PC-01 (RTX 4090)",
            type: "PC",
            room_name: "Main Arena",
            status: "OCCUPIED",
            rate_minor: 3000,
            current_session: {
              booking_id: "b-01",
              public_code: "GB-992101",
              customer_name: "Alexandru M.",
              starts_at: new Date(Date.now() - 45 * 60000).toISOString(),
              ends_at: new Date(Date.now() + 75 * 60000).toISOString(),
              minutes_remaining: 75,
            },
          },
          {
            id: "st-02",
            name: "PC-02 (RTX 4090)",
            type: "PC",
            room_name: "Main Arena",
            status: "OCCUPIED",
            rate_minor: 3000,
            current_session: {
              booking_id: "b-02",
              public_code: "GB-992102",
              customer_name: "Cristian D.",
              starts_at: new Date(Date.now() - 30 * 60000).toISOString(),
              ends_at: new Date(Date.now() + 90 * 60000).toISOString(),
              minutes_remaining: 90,
            },
          },
          {
            id: "st-03",
            name: "PC-03 (RTX 4080)",
            type: "PC",
            room_name: "Main Arena",
            status: "AVAILABLE",
            rate_minor: 3000,
          },
          {
            id: "st-04",
            name: "PC-04 (RTX 4080)",
            type: "PC",
            room_name: "Main Arena",
            status: "AVAILABLE",
            rate_minor: 3000,
          },
          {
            id: "st-05",
            name: "PC-05 (RTX 4080)",
            type: "PC",
            room_name: "Main Arena",
            status: "BOOKED",
            rate_minor: 3000,
          },
          {
            id: "st-06",
            name: "PC-06 (RTX 4080)",
            type: "PC",
            room_name: "Main Arena",
            status: "AVAILABLE",
            rate_minor: 3000,
          },
          {
            id: "st-07",
            name: "PS5-PRO-01",
            type: "CONSOLE_SETUP",
            room_name: "Console Lounge",
            status: "OCCUPIED",
            rate_minor: 4000,
          },
          {
            id: "st-08",
            name: "PS5-PRO-02",
            type: "CONSOLE_SETUP",
            room_name: "Console Lounge",
            status: "AVAILABLE",
            rate_minor: 4000,
          },
          {
            id: "st-09",
            name: "VIP-SIMULATOR",
            type: "PC",
            room_name: "VIP Suite",
            status: "MAINTENANCE",
            rate_minor: 6000,
          },
          {
            id: "st-10",
            name: "VIP-PC-01",
            type: "PC",
            room_name: "VIP Suite",
            status: "AVAILABLE",
            rate_minor: 5000,
          },
          {
            id: "st-11",
            name: "VIP-PC-02",
            type: "PC",
            room_name: "VIP Suite",
            status: "AVAILABLE",
            rate_minor: 5000,
          },
          {
            id: "st-12",
            name: "VIP-PC-03",
            type: "PC",
            room_name: "VIP Suite",
            status: "AVAILABLE",
            rate_minor: 5000,
          },
        ],
      };
    }
  },

  // Checkin queue
  async getCheckinQueue(venueId: string): Promise<CheckinQueueItem[]> {
    try {
      return await fetchJson<CheckinQueueItem[]>(
        `${API_BASE}/dashboard/venues/${venueId}/checkin-queue`,
      );
    } catch {
      return [
        {
          booking_id: "b-101",
          public_code: "GB-441029",
          customer_name: "Mihai Popescu",
          resource_names: ["PC-05 (RTX 4080)"],
          starts_at: new Date(Date.now() + 10 * 60000).toISOString(),
          ends_at: new Date(Date.now() + 130 * 60000).toISOString(),
          due_balance_minor: 3600,
          payment_status: "BALANCE_DUE",
        },
        {
          booking_id: "b-102",
          public_code: "GB-778103",
          customer_name: "Andrei Ionescu (Group of 3)",
          resource_names: ["PC-07", "PC-08", "PC-09"],
          starts_at: new Date(Date.now() + 14 * 60000).toISOString(),
          ends_at: new Date(Date.now() + 134 * 60000).toISOString(),
          due_balance_minor: 0,
          payment_status: "FULLY_PAID",
        },
      ];
    }
  },

  // Bar Board
  async getBarOrders(venueId: string): Promise<BarOrder[]> {
    try {
      return await fetchJson<BarOrder[]>(
        `${API_BASE}/dashboard/venues/${venueId}/bar-board`,
      );
    } catch {
      return [
        {
          id: "ord-01",
          public_code: "ORD-8812",
          order_type: "IN_SESSION",
          fulfillment_mode: "AT_STATION",
          status: "PLACED",
          target_resource_name: "PC-01",
          items: [
            {
              id: "it-1",
              product_id: "p-1",
              title: "Monster Energy Ultra 500ml",
              quantity: 1,
              unit_price_minor: 1400,
              line_total_minor: 1400,
              age_restricted: true,
            },
            {
              id: "it-2",
              product_id: "p-2",
              title: "Pringles Sour Cream & Onion",
              quantity: 1,
              unit_price_minor: 1600,
              line_total_minor: 1600,
              age_restricted: false,
            },
          ],
          total_minor: 3000,
          age_verification_required: true,
          created_at: new Date(Date.now() - 3 * 60000).toISOString(),
        },
        {
          id: "ord-02",
          public_code: "ORD-8815",
          order_type: "PRE_ORDER",
          fulfillment_mode: "BAR_PICKUP",
          status: "PREPARING",
          pickup_code: "PK-4921",
          items: [
            {
              id: "it-3",
              product_id: "p-3",
              title: "Cyber Cola 330ml",
              quantity: 2,
              unit_price_minor: 1000,
              line_total_minor: 2000,
              age_restricted: false,
            },
            {
              id: "it-4",
              product_id: "p-4",
              title: "Nachos with Cheese Dip",
              quantity: 1,
              unit_price_minor: 2200,
              line_total_minor: 2200,
              age_restricted: false,
            },
          ],
          total_minor: 4200,
          age_verification_required: false,
          created_at: new Date(Date.now() - 8 * 60000).toISOString(),
        },
        {
          id: "ord-03",
          public_code: "ORD-8810",
          order_type: "IN_SESSION",
          fulfillment_mode: "BAR_PICKUP",
          status: "READY",
          pickup_code: "PK-1092",
          items: [
            {
              id: "it-5",
              product_id: "p-5",
              title: "Red Bull 250ml",
              quantity: 1,
              unit_price_minor: 1200,
              line_total_minor: 1200,
              age_restricted: true,
            },
          ],
          total_minor: 1200,
          age_verification_required: true,
          created_at: new Date(Date.now() - 15 * 60000).toISOString(),
        },
      ];
    }
  },

  // Layout draft
  async getLayoutDraft(venueId: string): Promise<LayoutDraft> {
    try {
      return await fetchJson<LayoutDraft>(
        `${API_BASE}/dashboard/venues/${venueId}/layout/draft`,
      );
    } catch {
      return {
        venue_id: venueId,
        revision: 3,
        canvas: { width: 1200, height: 800, grid_size: 20 },
        rooms: [
          {
            id: "rm-1",
            name: "Main Esports Arena",
            bounds: { x: 40, y: 40, width: 680, height: 720 },
          },
          {
            id: "rm-2",
            name: "VIP Streaming Lounge",
            bounds: { x: 760, y: 40, width: 400, height: 340 },
          },
          {
            id: "rm-3",
            name: "Console Pods",
            bounds: { x: 760, y: 420, width: 400, height: 340 },
          },
        ],
        nodes: [
          {
            id: "n-1",
            name: "PC-01",
            type: "PC",
            x: 80,
            y: 100,
            width: 60,
            height: 60,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-2",
            name: "PC-02",
            type: "PC",
            x: 160,
            y: 100,
            width: 60,
            height: 60,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-3",
            name: "PC-03",
            type: "PC",
            x: 240,
            y: 100,
            width: 60,
            height: 60,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-4",
            name: "PC-04",
            type: "PC",
            x: 320,
            y: 100,
            width: 60,
            height: 60,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-5",
            name: "PC-05",
            type: "PC",
            x: 400,
            y: 100,
            width: 60,
            height: 60,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-6",
            name: "Team Alpha Desk",
            type: "FURNITURE",
            x: 70,
            y: 90,
            width: 400,
            height: 80,
            rotation: 0,
            layer: "furniture",
          },
          {
            id: "n-7",
            name: "PS5-01",
            type: "CONSOLE_SETUP",
            x: 800,
            y: 480,
            width: 80,
            height: 80,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-8",
            name: "PS5-02",
            type: "CONSOLE_SETUP",
            x: 920,
            y: 480,
            width: 80,
            height: 80,
            rotation: 0,
            layer: "equipment",
          },
          {
            id: "n-9",
            name: "VIP Studio 1",
            type: "PRIVATE_ROOM",
            x: 800,
            y: 80,
            width: 140,
            height: 100,
            rotation: 0,
            layer: "equipment",
          },
        ],
      };
    }
  },

  // Policy preview estimates (ENG-207)
  async getPolicyEstimates(
    venueId: string,
    settings?: any,
  ): Promise<{ scenarios: PolicyPreviewScenario[]; disclosures: any }> {
    try {
      const url = `${API_BASE}/dashboard/venues/${venueId}/policies/preview-estimates`;
      if (settings)
        throw new Error(
          "Local policy simulation uses illustrative estimates only",
        );
      const res: any = await fetchJson(url);
      return {
        scenarios: res.scenarios,
        disclosures: res.customer_disclosures,
      };
    } catch {
      return {
        scenarios: [
          {
            scenario_id: "solo_1h",
            name: "Sesiune Solo 1 Oră",
            duration_minutes: 60,
            players_count: 1,
            total_price_minor: 3000,
            due_now_minor: 1200,
            remaining_balance_minor: 1800,
            customer_display: {
              price_formatted: "30.00 RON",
              due_now_formatted: "12.00 RON",
              balance_formatted: "18.00 RON",
              free_cancellation_text:
                "Anulare gratuită cu până la 3 ore înainte de sesiune.",
              settlement_options_text:
                "Avans online (40%), rest de plată la recepție sau online.",
            },
          },
          {
            scenario_id: "solo_2h",
            name: "Sesiune Solo 2 Ore",
            duration_minutes: 120,
            players_count: 1,
            total_price_minor: 6000,
            due_now_minor: 2400,
            remaining_balance_minor: 3600,
            customer_display: {
              price_formatted: "60.00 RON",
              due_now_formatted: "24.00 RON",
              balance_formatted: "36.00 RON",
              free_cancellation_text:
                "Anulare gratuită cu până la 3 ore înainte de sesiune.",
              settlement_options_text:
                "Avans online (40%), rest de plată la recepție sau online.",
            },
          },
          {
            scenario_id: "group_5p_2h",
            name: "Sesiune Grup 5 Jucători (2 Ore)",
            duration_minutes: 120,
            players_count: 5,
            total_price_minor: 30000,
            due_now_minor: 12000,
            remaining_balance_minor: 18000,
            per_player_share_minor: 6000,
            per_player_due_now_minor: 2400,
            customer_display: {
              price_formatted: "300.00 RON",
              due_now_formatted: "120.00 RON",
              balance_formatted: "180.00 RON",
              free_cancellation_text:
                "Anulare gratuită cu până la 3 ore înainte de sesiune.",
              settlement_options_text:
                "Fiecare membru achită cota sa de 24.00 RON online.",
            },
          },
        ],
        disclosures: {
          free_cancellation_disclosure:
            "Clienții pot anula gratuit cu până la 3 ore înainte.",
          deposit_disclosure: "Avans obligatoriu de 40% reținut online.",
          statutory_notice:
            "Condiții ilustrative. Verifică politica aprobată a locației înainte de o rezervare reală; acest demo nu validează cerințe legale sau fiscale.",
        },
      };
    }
  },

  // Daily Financial Reconciliation
  async getDailyReconciliation(
    venueId: string,
    date: string,
  ): Promise<ReconciliationReport> {
    try {
      return await fetchJson<ReconciliationReport>(
        `${API_BASE}/dashboard/venues/${venueId}/reconciliation/daily?date=${date}`,
      );
    } catch {
      return {
        date,
        opening_balance_minor: 45000,
        online_captured_minor: 184000,
        reception_cash_minor: 72000,
        reception_card_minor: 58000,
        refunds_minor: 6000,
        voided_offline_minor: 0,
        closing_balance_minor: 353000,
        discrepancies_count: 0,
        status: "BALANCED",
      };
    }
  },

  // System Health
  async getSystemHealth() {
    return fetchJson(`${API_BASE}/observability/system-health`);
  },
};
