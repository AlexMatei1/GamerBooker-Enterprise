import { Injectable, HttpStatus } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { OrderStatusFlowView, OrderStatusMilestone } from './notifications.types';

@Injectable()
export class OrderStatusService {
  async getOrderStatusFlow(orderId: string, customerId?: string): Promise<OrderStatusFlowView> {
    const pool = getPool();

    // 1. Fetch order
    const orderRes = await pool.query<{
      id: string;
      tenant_id: string;
      venue_id: string;
      customer_id: string;
      public_code: string;
      pickup_code?: string | null;
      fulfillment_mode: 'AT_STATION' | 'BAR_PICKUP';
      target_resource_id?: string | null;
      status: string;
      estimated_prep_minutes?: number;
      created_at: string;
      updated_at: string;
      accepted_at?: string | null;
      prepared_at?: string | null;
      ready_at?: string | null;
      handed_off_at?: string | null;
    }>('SELECT * FROM orders WHERE id = $1', [orderId]);

    if (orderRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
    }

    const order = orderRes.rows[0];

    // Authorization: customer must own the order
    if (customerId && order.customer_id !== customerId) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
    }

    // 2. Fetch station name if AT_STATION
    let stationName: string | null = null;
    if (order.target_resource_id) {
      const resRes = await pool.query<{ name: string }>(
        'SELECT name FROM resources WHERE id = $1',
        [order.target_resource_id],
      );
      if (resRes.rows.length > 0) {
        stationName = resRes.rows[0].name;
      }
    }

    // 3. Fetch line items
    const itemsRes = await pool.query<{
      title: string;
      quantity: number;
      status: string;
    }>(
      `SELECT oi.title, oi.quantity, oi.status
         FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC`,
      [orderId],
    );

    // 4. Construct milestones
    const statusRanks: Record<string, number> = {
      PLACED: 1,
      ACCEPTED: 2,
      PREPARING: 3,
      READY: 4,
      HANDED_OFF: 5,
    };

    const currentRank = statusRanks[order.status] || 0;
    const isCancelled = order.status === 'CANCELLED';

    const milestones: OrderStatusMilestone[] = [
      {
        status: 'PLACED',
        label: 'Order Placed',
        reached: true,
        active: order.status === 'PLACED',
        timestamp: order.created_at,
      },
      {
        status: 'ACCEPTED',
        label: 'Accepted by Bar',
        reached: !isCancelled && currentRank >= 2,
        active: order.status === 'ACCEPTED',
        timestamp: order.accepted_at,
      },
      {
        status: 'PREPARING',
        label: 'In Preparation',
        reached: !isCancelled && currentRank >= 3,
        active: order.status === 'PREPARING',
        timestamp: order.prepared_at,
      },
      {
        status: 'READY',
        label: order.fulfillment_mode === 'BAR_PICKUP' ? 'Ready for Pickup' : 'Ready for Delivery',
        reached: !isCancelled && currentRank >= 4,
        active: order.status === 'READY',
        timestamp: order.ready_at,
      },
      {
        status: 'HANDED_OFF',
        label: 'Fulfilled',
        reached: !isCancelled && currentRank >= 5,
        active: order.status === 'HANDED_OFF',
        timestamp: order.handed_off_at,
      },
    ];

    if (isCancelled) {
      milestones.push({
        status: 'CANCELLED',
        label: 'Order Cancelled',
        reached: true,
        active: true,
        timestamp: order.updated_at,
      });
    }

    return {
      order_id: order.id,
      order_number: order.public_code,
      fulfillment_mode: order.fulfillment_mode,
      pickup_code: order.fulfillment_mode === 'BAR_PICKUP' ? order.pickup_code : null,
      target_station_name: stationName,
      current_status: order.status,
      estimated_prep_minutes: order.estimated_prep_minutes || 10,
      created_at: order.created_at,
      milestones,
      items_summary: itemsRes.rows,
    };
  }
}
