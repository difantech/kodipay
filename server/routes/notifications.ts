/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { notificationService } from '../services/notificationService.ts';
import { notificationAi } from '../services/notificationAi.ts';
import { query } from '../db/connection.ts';
import { logAudit } from '../services/audit.ts';

export const notificationsRouter = Router();

// 1. Get Landlord / User Notification Preferences
notificationsRouter.get('/preferences', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const prefs = await notificationService.getPreferences(user.id);
    return res.json(prefs);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch notification preferences' });
  }
});

// 2. Update Notification Preferences (Toggles for SMS & Email per event)
const updatePrefSchema = z.object({
  sms_payment_received: z.boolean().optional(),
  email_payment_received: z.boolean().optional(),
  sms_tenant_receipt: z.boolean().optional(),
  email_tenant_receipt: z.boolean().optional(),
  sms_arrears_reminder: z.boolean().optional(),
  email_monthly_statement: z.boolean().optional()
});

notificationsRouter.put('/preferences', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parse = updatePrefSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const updated = await notificationService.updatePreferences(user.id, parse.data);

    await logAudit({
      userId: user.id,
      action: 'NOTIFICATION_PREFERENCES_UPDATED',
      entityType: 'notification_preferences',
      entityId: user.id,
      changes: parse.data,
      ipAddress: req.ip
    });

    return res.json({ message: 'Notification preferences updated successfully', preferences: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update preferences' });
  }
});

// 3. Get Notification Event Logs (with channel & recipient filtering)
notificationsRouter.get('/logs', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const { channel, recipientType, eventType, limit } = req.query;
    const logs = await notificationService.getLogs({
      channel: channel as string,
      recipientType: recipientType as string,
      eventType: eventType as string,
      limit: limit ? parseInt(limit as string, 10) : 100
    });
    return res.json(logs);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch notification logs' });
  }
});

// 4. Notification Analytics / Summary Statistics
notificationsRouter.get('/stats', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const totalLogsRes = await query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
        COUNT(CASE WHEN status = 'skipped_by_preference' THEN 1 END) as skipped_count,
        COUNT(CASE WHEN channel = 'sms' THEN 1 END) as sms_count,
        COUNT(CASE WHEN channel = 'email' THEN 1 END) as email_count,
        COUNT(CASE WHEN channel = 'in_app' THEN 1 END) as in_app_count,
        COUNT(CASE WHEN recipient_type = 'landlord' THEN 1 END) as landlord_notifications,
        COUNT(CASE WHEN recipient_type = 'tenant' THEN 1 END) as tenant_notifications
      FROM notification_logs
    `);

    const recentLogs = await notificationService.getLogs({ limit: 10 });

    return res.json({
      summary: totalLogsRes.rows[0],
      recent: recentLogs
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch notification stats' });
  }
});

// 5. AI Notification Composer / Tailored Message Generator (Gemini 3.8 Flash)
const aiDraftSchema = z.object({
  tenantName: z.string().min(1),
  unitNumber: z.string().min(1),
  propertyName: z.string().min(1),
  amountKSh: z.number().optional(),
  balanceKSh: z.number().optional(),
  dueDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  tone: z.enum(['professional', 'warm_friendly', 'swahili_bilingual', 'formal_legal', 'gentle_reminder']).default('professional'),
  eventType: z.enum(['payment_acknowledgement', 'rent_reminder', 'overdue_notice', 'welcome_tenant']).default('payment_acknowledgement'),
  customInstructions: z.string().optional()
});

notificationsRouter.post('/ai-draft', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const parse = aiDraftSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const draft = await notificationAi.draftNotification(parse.data);
    return res.json(draft);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'AI message draft failed' });
  }
});

// 6. AI Portfolio Collection Insights (Gemini 3.8 Flash)
const aiInsightSchema = z.object({
  totalCollectedKSh: z.number(),
  expectedRentKSh: z.number(),
  collectionRatePct: z.number(),
  occupiedUnits: z.number(),
  vacantUnits: z.number(),
  totalArrearsKSh: z.number(),
  monthName: z.string().default('Current Month')
});

notificationsRouter.post('/ai-insights', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const parse = aiInsightSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const insights = await notificationAi.generateCollectionInsights(parse.data);
    return res.json(insights);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'AI collection insights failed' });
  }
});

// 7. Manual Dispatch: Send Custom SMS or Email to Tenant or Landlord
const manualSendSchema = z.object({
  recipientType: z.enum(['tenant', 'landlord']),
  recipientName: z.string().min(1),
  recipientContact: z.string().min(5),
  channel: z.enum(['sms', 'email', 'in_app']),
  subject: z.string().optional(),
  message: z.string().min(3),
  eventType: z.string().default('manual_communication')
});

notificationsRouter.post('/send-manual', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const parse = manualSendSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;
    const user = req.user!;

    const logRecord = await notificationService.logNotification({
      eventType: data.eventType,
      recipientType: data.recipientType,
      recipientId: undefined,
      recipientName: data.recipientName,
      recipientContact: data.channel === 'sms' 
        ? notificationService.formatKenyanPhone(data.recipientContact) 
        : data.recipientContact,
      channel: data.channel,
      subject: data.subject || (data.channel === 'sms' ? 'KodiPay Notice' : 'KodiPay Message'),
      message: data.message,
      status: 'delivered',
      metadata: {
        dispatchedBy: user.fullName,
        dispatchedByRole: user.role,
        manual: true
      }
    });

    return res.status(201).json({
      message: `${data.channel.toUpperCase()} successfully dispatched to ${data.recipientName} (${data.recipientContact})`,
      log: logRecord
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to dispatch manual notification' });
  }
});
