/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { query } from '../db/connection.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';

export const receiptsRouter = Router();

// List Receipts
receiptsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { propertyId, month, search } = req.query;

    let sql = `
      SELECT r.*,
             t.full_name as tenant_name,
             t.phone_number as tenant_phone,
             t.email as tenant_email,
             ru.unit_number,
             p.id as property_id,
             p.name as property_name,
             p.code as property_code,
             py.status as payment_status,
             py.payment_reference
      FROM receipts r
      JOIN tenants t ON t.id = r.tenant_id
      JOIN rental_units ru ON ru.id = r.unit_id
      JOIN properties p ON p.id = ru.property_id
      JOIN payments py ON py.id = r.payment_id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Tenant Isolation
    if (user.role === 'tenant') {
      params.push(user.tenantId);
      sql += ` AND r.tenant_id = $${params.length}`;
    }

    if (propertyId) {
      params.push(propertyId);
      sql += ` AND p.id = $${params.length}`;
    }

    if (month) {
      params.push(`${month}%`);
      sql += ` AND r.payment_date::text LIKE $${params.length}`;
    }

    if (search && search.toString().trim()) {
      params.push(`%${search.toString().trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(r.receipt_number) LIKE $${params.length} OR
        LOWER(t.full_name) LIKE $${params.length} OR
        LOWER(COALESCE(r.transaction_reference, '')) LIKE $${params.length}
      )`;
    }

    sql += ` ORDER BY r.generated_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch receipts' });
  }
});

// Single Receipt Details (Print View)
receiptsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const result = await query(
      `SELECT r.*,
              t.full_name as tenant_name,
              t.phone_number as tenant_phone,
              t.national_id as tenant_national_id,
              t.email as tenant_email,
              ru.unit_number,
              ru.unit_type,
              ru.floor,
              p.id as property_id,
              p.name as property_name,
              p.code as property_code,
              p.address as property_address,
              p.estate as property_estate,
              p.city as property_city,
              py.payment_reference,
              py.status as payment_status,
              py.reversal_reason,
              u.full_name as issued_by_name
       FROM receipts r
       JOIN tenants t ON t.id = r.tenant_id
       JOIN rental_units ru ON ru.id = r.unit_id
       JOIN properties p ON p.id = ru.property_id
       JOIN payments py ON py.id = r.payment_id
       LEFT JOIN users u ON u.id = py.recorded_by
       WHERE (r.id::text = $1 OR r.receipt_number = $1)`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = result.rows[0];

    // Tenant Isolation
    if (user.role === 'tenant' && receipt.tenant_id !== user.tenantId) {
      return res.status(403).json({ error: 'Tenant isolation violation. Cannot access another tenant receipt.' });
    }



    return res.json(receipt);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch receipt' });
  }
});
