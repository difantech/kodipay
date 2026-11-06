/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest, verifyPropertyAccess } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const propertiesRouter = Router();

// List Properties
propertiesRouter.get('/', requireAuth, requireRoles('super_admin', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let sql = `
      SELECT p.*,
             u.full_name as landlord_name,
             u.email as landlord_email,
             COUNT(DISTINCT ru.id) as total_units,
             COUNT(DISTINCT CASE WHEN ru.status = 'occupied' THEN ru.id END) as occupied_units,
             COUNT(DISTINCT CASE WHEN ru.status = 'vacant' THEN ru.id END) as vacant_units,
             COALESCE(SUM(CASE WHEN ru.status = 'occupied' THEN ru.monthly_rent_cents ELSE 0 END), 0) as expected_monthly_rent_cents
      FROM properties p
      LEFT JOIN users u ON u.id = p.landlord_id
      LEFT JOIN rental_units ru ON ru.property_id = p.id AND ru.archived_at IS NULL
      WHERE p.archived_at IS NULL
    `;
    const params: any[] = [];

    sql += ` GROUP BY p.id, u.full_name, u.email ORDER BY p.name ASC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch properties' });
  }
});

// Create Property
const propertySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  address: z.string().min(3),
  estate: z.string().optional(),
  city: z.string().default('Nairobi'),
  county: z.string().default('Nairobi'),
  postalCode: z.string().optional(),
  landlordId: z.string().uuid().optional(),
  description: z.string().optional()
});

propertiesRouter.post('/', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const parse = propertySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;
    const user = req.user!;
    
    const cleanCode = data.code.toUpperCase().trim();

    const existingCode = await query(`SELECT id FROM properties WHERE code = $1 AND archived_at IS NULL`, [cleanCode]);
    if (existingCode.rows.length > 0) {
      return res.status(400).json({ error: `A property with code '${cleanCode}' already exists. Please choose a unique property code.` });
    }

    const assignedLandlordId = data.landlordId || user.id;

    const insertRes = await query(
      `INSERT INTO properties (name, code, address, estate, city, county, postal_code, landlord_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.name.trim(),
        cleanCode,
        data.address.trim(),
        data.estate || '',
        data.city,
        data.county,
        data.postalCode || '',
        assignedLandlordId,
        data.description || ''
      ]
    );

    const property = insertRes.rows[0];

    await logAudit({
      userId: user.id,
      action: 'PROPERTY_CREATED',
      entityType: 'properties',
      entityId: property.id,
      changes: { name: property.name, code: property.code },
      ipAddress: req.ip
    });

    return res.status(201).json(property);
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (error.code === '23505' || msg.includes('properties_code_key') || msg.includes('duplicate key')) {
      return res.status(400).json({ error: 'A property with this code already exists. Please choose a unique property code.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to create property' });
  }
});

// List All Vacant Rental Units across accessible properties (Fast & direct for tenant assignment)
propertiesRouter.get('/units/vacant', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let sql = `
      SELECT ru.*,
             p.name as property_name,
             p.code as property_code,
             p.address as property_address
      FROM rental_units ru
      JOIN properties p ON p.id = ru.property_id
      WHERE ru.status = 'vacant'
        AND ru.archived_at IS NULL
        AND p.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tenancies ty 
          WHERE ty.unit_id = ru.id AND ty.is_active = TRUE
        )
    `;
    const params: any[] = [];

    sql += ` ORDER BY p.name ASC, ru.unit_number ASC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch vacant units' });
  }
});

// List All Rental Units across accessible properties
propertiesRouter.get('/all-units', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let sql = `
      SELECT ru.*,
             p.name as property_name,
             p.code as property_code,
             p.address as property_address,
             t.id as tenant_id,
             t.full_name as tenant_name,
             t.phone_number as tenant_phone
      FROM rental_units ru
      JOIN properties p ON p.id = ru.property_id
      LEFT JOIN tenancies ty ON ty.unit_id = ru.id AND ty.is_active = TRUE
      LEFT JOIN tenants t ON t.id = ty.tenant_id
      WHERE ru.archived_at IS NULL AND p.archived_at IS NULL
    `;
    const params: any[] = [];

    sql += ` ORDER BY p.name ASC, ru.unit_number ASC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch all units' });
  }
});

// Get Single Property with Units
propertiesRouter.get('/:id', requireAuth, requireRoles('super_admin', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await verifyPropertyAccess(req.user!, id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to access this property.' });
    }

    const propRes = await query(
      `SELECT p.*, u.full_name as landlord_name, u.email as landlord_email
       FROM properties p
       LEFT JOIN users u ON u.id = p.landlord_id
       WHERE p.id = $1 AND p.archived_at IS NULL`,
      [id]
    );

    if (propRes.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const property = propRes.rows[0];

    // Fetch units with current tenant if occupied
    const unitsRes = await query(
      `SELECT ru.*,
              ty.id as active_tenancy_id,
              t.id as tenant_id,
              t.full_name as tenant_name,
              t.phone_number as tenant_phone,
              ty.rent_amount_cents as active_rent_cents,
              ty.start_date as tenancy_start_date
       FROM rental_units ru
       LEFT JOIN tenancies ty ON ty.unit_id = ru.id AND ty.is_active = TRUE
       LEFT JOIN tenants t ON t.id = ty.tenant_id
       WHERE ru.property_id = $1 AND ru.archived_at IS NULL
       ORDER BY ru.unit_number ASC`,
      [id]
    );

    return res.json({
      ...property,
      units: unitsRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch property' });
  }
});

propertiesRouter.put('/:id', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await verifyPropertyAccess(req.user!, id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized property update.' });
    }

    const parse = propertySchema.partial().safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;
    const updateRes = await query(
      `UPDATE properties
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           estate = COALESCE($3, estate),
           city = COALESCE($4, city),
           county = COALESCE($5, county),
           postal_code = COALESCE($6, postal_code),
           description = COALESCE($7, description),
           updated_at = NOW()
       WHERE id = $8 AND archived_at IS NULL
       RETURNING *`,
      [data.name, data.address, data.estate, data.city, data.county, data.postalCode, data.description, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'PROPERTY_UPDATED',
      entityType: 'properties',
      entityId: id,
      changes: data,
      ipAddress: req.ip
    });

    return res.json(updateRes.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update property' });
  }
});

propertiesRouter.delete('/:id', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const hasAccess = await verifyPropertyAccess(req.user!, id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized property archival.' });
    }

    // Check if any occupied units exist
    const occupiedCheck = await query(
      `SELECT COUNT(*) as count FROM rental_units WHERE property_id = $1 AND status = 'occupied' AND archived_at IS NULL`,
      [id]
    );
    if (parseInt(occupiedCheck.rows[0].count, 10) > 0) {
      return res.status(400).json({ 
        error: 'Cannot archive a property with occupied units. Please terminate active tenancies first.' 
      });
    }

    await query(`UPDATE properties SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);

    await logAudit({
      userId: req.user!.id,
      action: 'PROPERTY_ARCHIVED',
      entityType: 'properties',
      entityId: id,
      ipAddress: req.ip
    });

    return res.json({ message: 'Property archived successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to archive property' });
  }
});

// Add Rental Unit
const unitSchema = z.object({
  unitNumber: z.string().min(1),
  floor: z.string().optional(),
  unitType: z.string().min(1), // e.g. "1 Bedroom", "2 Bedroom", "Bedsitter", "Commercial"
  monthlyRentKSh: z.number().positive(),
  defaultDueDay: z.number().int().min(1).max(28).default(5)
});

propertiesRouter.post('/:id/units', requireAuth, requireRoles('super_admin', 'landlord'), async (req: AuthRequest, res) => {
  try {
    const { id: propertyId } = req.params;
    const hasAccess = await verifyPropertyAccess(req.user!, propertyId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized to add unit to this property.' });
    }

    const parse = unitSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { unitNumber, floor, unitType, monthlyRentKSh, defaultDueDay } = parse.data;
    const trimmedUnitNo = unitNumber.trim();

    // Check for existing active unit with same number on this property
    const existing = await query(
      `SELECT id FROM rental_units 
       WHERE property_id = $1 
         AND LOWER(TRIM(unit_number)) = LOWER(TRIM($2)) 
         AND archived_at IS NULL`,
      [propertyId, trimmedUnitNo]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: `Unit '${trimmedUnitNo}' already exists in this property. Please choose a different unit number.`
      });
    }

    const monthlyRentCents = Math.round(monthlyRentKSh * 100);

    const insertRes = await query(
      `INSERT INTO rental_units (property_id, unit_number, floor, unit_type, monthly_rent_cents, default_due_day, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'vacant')
       RETURNING *`,
      [propertyId, trimmedUnitNo, floor || '', unitType, monthlyRentCents, defaultDueDay]
    );

    const unit = insertRes.rows[0];

    await logAudit({
      userId: req.user!.id,
      action: 'UNIT_CREATED',
      entityType: 'rental_units',
      entityId: unit.id,
      changes: { unitNumber: trimmedUnitNo, propertyId, monthlyRentKSh },
      ipAddress: req.ip
    });

    return res.status(201).json(unit);
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (error.code === '23505' || msg.includes('unique_property_unit') || msg.includes('duplicate key')) {
      return res.status(409).json({ error: 'A unit with this unit number already exists in this property. Please choose a different unit number.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to add rental unit' });
  }
});

// Update Unit
propertiesRouter.put('/units/:unitId', requireAuth, requireRoles('super_admin', 'landlord'), async (req: AuthRequest, res) => {
  try {
    const { unitId } = req.params;
    const unitCheck = await query(`SELECT property_id, unit_number FROM rental_units WHERE id = $1`, [unitId]);
    if (unitCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Rental unit not found' });
    }

    const propertyId = unitCheck.rows[0].property_id;
    const hasAccess = await verifyPropertyAccess(req.user!, propertyId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized unit update.' });
    }

    const parse = unitSchema.partial().safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { unitNumber, floor, unitType, monthlyRentKSh, defaultDueDay } = parse.data;

    // Check duplicate unit number if changing
    if (unitNumber && unitNumber.trim() !== unitCheck.rows[0].unit_number) {
      const existing = await query(
        `SELECT id FROM rental_units 
         WHERE property_id = $1 
           AND LOWER(TRIM(unit_number)) = LOWER(TRIM($2)) 
           AND id != $3 
           AND archived_at IS NULL`,
        [propertyId, unitNumber.trim(), unitId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `A unit with number '${unitNumber.trim()}' already exists in this property. Please choose a different unit number.`
        });
      }
    }

    const monthlyRentCents = monthlyRentKSh !== undefined ? Math.round(monthlyRentKSh * 100) : undefined;

    const updateRes = await query(
      `UPDATE rental_units
       SET unit_number = COALESCE($1, unit_number),
           floor = COALESCE($2, floor),
           unit_type = COALESCE($3, unit_type),
           monthly_rent_cents = COALESCE($4, monthly_rent_cents),
           default_due_day = COALESCE($5, default_due_day),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [unitNumber ? unitNumber.trim() : undefined, floor, unitType, monthlyRentCents, defaultDueDay, unitId]
    );

    await logAudit({
      userId: req.user!.id,
      action: 'UNIT_UPDATED',
      entityType: 'rental_units',
      entityId: unitId,
      changes: req.body,
      ipAddress: req.ip
    });

    return res.json(updateRes.rows[0]);
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (error.code === '23505' || msg.includes('unique_property_unit') || msg.includes('duplicate key')) {
      return res.status(409).json({ error: 'A unit with this unit number already exists in this property. Please choose a different unit number.' });
    }
    return res.status(500).json({ error: error.message || 'Failed to update unit' });
  }
});
