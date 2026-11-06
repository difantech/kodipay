/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { query } from '../db/connection.ts';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationPreferences {
  id?: string;
  user_id: string;
  sms_payment_received: boolean;
  email_payment_received: boolean;
  sms_tenant_receipt: boolean;
  email_tenant_receipt: boolean;
  sms_arrears_reminder: boolean;
  email_monthly_statement: boolean;
  updated_at?: string;
}

export interface PaymentNotificationParams {
  paymentId: string;
  receiptId?: string;
  receiptNumber?: string;
  tenancyId: string;
  amountCents: number;
  paymentMethod: string;
  transactionReference?: string;
  paymentDate: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  unitNumber: string;
  propertyName: string;
  landlordId?: string;
  landlordName?: string;
  landlordPhone?: string;
  landlordEmail?: string;
  remainingBalanceCents: number;
  periodCovered?: string;
}

export interface NotificationLogRecord {
  id: string;
  event_type: string;
  recipient_type: 'landlord' | 'tenant' | 'admin';
  recipient_id?: string | null;
  recipient_name: string;
  recipient_contact: string;
  channel: 'sms' | 'email' | 'in_app';
  subject?: string | null;
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'simulated' | 'skipped_by_preference';
  metadata: any;
  created_at: string;
}

export class NotificationService {
  /**
   * Normalize Kenyan phone number format to international standard (e.g. +2547XXXXXXXX)
   */
  public formatKenyanPhone(phone: string): string {
    if (!phone) return '+254700000000';
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+254')) return cleaned;
    if (cleaned.startsWith('254') && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.startsWith('0') && cleaned.length === 10) return `+254${cleaned.slice(1)}`;
    if (cleaned.length === 9) return `+254${cleaned}`;
    return cleaned;
  }

  /**
   * Retrieve landlord/user notification preferences or return defaults
   */
  public async getPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const res = await query(
        `SELECT * FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );

      if (res.rows.length > 0) {
        return res.rows[0];
      }

      // Insert default preferences if not yet established
      const insertRes = await query(
        `INSERT INTO notification_preferences (
          user_id,
          sms_payment_received,
          email_payment_received,
          sms_tenant_receipt,
          email_tenant_receipt,
          sms_arrears_reminder,
          email_monthly_statement
        ) VALUES ($1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
        RETURNING *`,
        [userId]
      );
      return insertRes.rows[0];
    } catch (err: any) {
      console.warn('Failed to fetch user notification preferences, using fallback defaults:', err.message);
      return {
        user_id: userId,
        sms_payment_received: true,
        email_payment_received: true,
        sms_tenant_receipt: true,
        email_tenant_receipt: true,
        sms_arrears_reminder: true,
        email_monthly_statement: true
      };
    }
  }

  /**
   * Update notification preferences for a user / landlord
   */
  public async updatePreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current, ...prefs, updated_at: new Date().toISOString() };

    const res = await query(
      `INSERT INTO notification_preferences (
        user_id,
        sms_payment_received,
        email_payment_received,
        sms_tenant_receipt,
        email_tenant_receipt,
        sms_arrears_reminder,
        email_monthly_statement,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        sms_payment_received = EXCLUDED.sms_payment_received,
        email_payment_received = EXCLUDED.email_payment_received,
        sms_tenant_receipt = EXCLUDED.sms_tenant_receipt,
        email_tenant_receipt = EXCLUDED.email_tenant_receipt,
        sms_arrears_reminder = EXCLUDED.sms_arrears_reminder,
        email_monthly_statement = EXCLUDED.email_monthly_statement,
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        updated.sms_payment_received,
        updated.email_payment_received,
        updated.sms_tenant_receipt,
        updated.email_tenant_receipt,
        updated.sms_arrears_reminder,
        updated.email_monthly_statement
      ]
    );

    return res.rows[0];
  }

  /**
   * Log notification event to persistent database
   */
  public async logNotification(entry: {
    eventType: string;
    recipientType: 'landlord' | 'tenant' | 'admin';
    recipientId?: string | null;
    recipientName: string;
    recipientContact: string;
    channel: 'sms' | 'email' | 'in_app';
    subject?: string;
    message: string;
    status: 'sent' | 'delivered' | 'failed' | 'simulated' | 'skipped_by_preference';
    metadata?: any;
  }): Promise<NotificationLogRecord> {
    try {
      const res = await query(
        `INSERT INTO notification_logs (
          event_type, recipient_type, recipient_id, recipient_name,
          recipient_contact, channel, subject, message, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          entry.eventType,
          entry.recipientType,
          entry.recipientId || null,
          entry.recipientName,
          entry.recipientContact,
          entry.channel,
          entry.subject || null,
          entry.message,
          entry.status,
          JSON.stringify(entry.metadata || {})
        ]
      );
      return res.rows[0];
    } catch (err: any) {
      console.error('Failed to log notification entry:', err.message);
      return {
        id: uuidv4(),
        event_type: entry.eventType,
        recipient_type: entry.recipientType,
        recipient_id: entry.recipientId,
        recipient_name: entry.recipientName,
        recipient_contact: entry.recipientContact,
        channel: entry.channel,
        subject: entry.subject,
        message: entry.message,
        status: entry.status,
        metadata: entry.metadata,
        created_at: new Date().toISOString()
      };
    }
  }

  /**
   * Trigger notifications when a rent payment is successfully recorded / confirmed
   * Dispatches notifications to BOTH the tenant and the property owner (landlord).
   */
  public async notifyPaymentReceived(params: PaymentNotificationParams): Promise<{
    dispatchedCount: number;
    logs: NotificationLogRecord[];
  }> {
    const logs: NotificationLogRecord[] = [];
    const amountKSh = (params.amountCents / 100).toLocaleString('en-KE');
    const balanceKSh = (params.remainingBalanceCents / 100).toLocaleString('en-KE');
    const methodClean = params.paymentMethod === 'mpesa' ? 'M-Pesa' : params.paymentMethod.replace('_', ' ');
    const txRefDisplay = params.transactionReference || 'N/A';
    const receiptDisplay = params.receiptNumber || 'RCP-PENDING';

    // Retrieve landlord preferences if landlordId is present
    let prefs: NotificationPreferences = {
      user_id: params.landlordId || '',
      sms_payment_received: true,
      email_payment_received: true,
      sms_tenant_receipt: true,
      email_tenant_receipt: true,
      sms_arrears_reminder: true,
      email_monthly_statement: true
    };

    if (params.landlordId) {
      prefs = await this.getPreferences(params.landlordId);
    }

    // -------------------------------------------------------------------------
    // 1. TENANT NOTIFICATIONS
    // -------------------------------------------------------------------------
    const tenantFormattedPhone = this.formatKenyanPhone(params.tenantPhone);

    // 1A. Tenant SMS Receipt
    const tenantSmsMessage =
      `KODIPAY: Jambo ${params.tenantName}, your rent payment of KSh ${amountKSh} for Unit ${params.unitNumber} (${params.propertyName}) has been received via ${methodClean} (Ref: ${txRefDisplay}). Outstanding balance: KSh ${balanceKSh}. Official Receipt #${receiptDisplay} issued. Asante!`;

    if (prefs.sms_tenant_receipt) {
      const smsLog = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'tenant',
        recipientId: undefined,
        recipientName: params.tenantName,
        recipientContact: tenantFormattedPhone,
        channel: 'sms',
        subject: 'Rent Payment Receipt SMS',
        message: tenantSmsMessage,
        status: 'delivered',
        metadata: {
          gateway: "Safaricom SMS / Africa's Talking (Simulated)",
          paymentId: params.paymentId,
          receiptNumber: receiptDisplay,
          amountKSh
        }
      });
      logs.push(smsLog);
    } else {
      const skippedSms = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'tenant',
        recipientId: undefined,
        recipientName: params.tenantName,
        recipientContact: tenantFormattedPhone,
        channel: 'sms',
        subject: 'Rent Payment Receipt SMS (Disabled)',
        message: tenantSmsMessage,
        status: 'skipped_by_preference',
        metadata: { reason: 'Disabled by landlord preference toggle' }
      });
      logs.push(skippedSms);
    }

    // 1B. Tenant Email Receipt
    const tenantEmailSubject = `Payment Receipt: KSh ${amountKSh} for Unit ${params.unitNumber} - ${params.propertyName}`;
    const tenantEmailBody = `
Dear ${params.tenantName},

We acknowledge receipt of your rent payment. Details of your transaction:

• Property & Unit: ${params.propertyName} - Unit ${params.unitNumber}
• Amount Paid: KSh ${amountKSh}
• Payment Method: ${methodClean}
• Transaction Reference: ${txRefDisplay}
• Official Receipt Number: ${receiptDisplay}
• Payment Date: ${params.paymentDate}
• Remaining Outstanding Balance: KSh ${balanceKSh}

You can view and download your full official printable PDF receipt anytime by logging into your KodiPay Tenant Portal.

Thank you for your tenancy.
KodiPay Automated Property Management System
    `.trim();

    if (prefs.email_tenant_receipt && params.tenantEmail) {
      const emailLog = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'tenant',
        recipientId: undefined,
        recipientName: params.tenantName,
        recipientContact: params.tenantEmail,
        channel: 'email',
        subject: tenantEmailSubject,
        message: tenantEmailBody,
        status: 'delivered',
        metadata: {
          gateway: 'KodiPay Mailer SMTP (Simulated)',
          paymentId: params.paymentId,
          receiptNumber: receiptDisplay
        }
      });
      logs.push(emailLog);
    } else if (!prefs.email_tenant_receipt) {
      const skippedEmail = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'tenant',
        recipientId: undefined,
        recipientName: params.tenantName,
        recipientContact: params.tenantEmail || 'no-email@tenant.ke',
        channel: 'email',
        subject: tenantEmailSubject,
        message: tenantEmailBody,
        status: 'skipped_by_preference',
        metadata: { reason: 'Disabled by landlord preference toggle' }
      });
      logs.push(skippedEmail);
    }

    // -------------------------------------------------------------------------
    // 2. LANDLORD / OWNER NOTIFICATIONS
    // -------------------------------------------------------------------------
    const ownerName = params.landlordName || 'Property Owner';
    const ownerPhone = params.landlordPhone ? this.formatKenyanPhone(params.landlordPhone) : '+254722000000';
    const ownerEmail = params.landlordEmail || 'landlord@kodipay.co.ke';

    // 2A. Landlord SMS Alert
    const landlordSmsMessage =
      `KODIPAY OWNER ALERT: Rent payment of KSh ${amountKSh} received from ${params.tenantName} for Unit ${params.unitNumber} (${params.propertyName}) via ${methodClean} (Ref: ${txRefDisplay}). Total collection tally updated on your dashboard.`;

    if (prefs.sms_payment_received) {
      const landlordSmsLog = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'landlord',
        recipientId: params.landlordId || null,
        recipientName: ownerName,
        recipientContact: ownerPhone,
        channel: 'sms',
        subject: 'Rent Collected Owner Alert',
        message: landlordSmsMessage,
        status: 'delivered',
        metadata: {
          gateway: "Safaricom Bulk SMS (Simulated)",
          paymentId: params.paymentId,
          amountKSh
        }
      });
      logs.push(landlordSmsLog);
    } else {
      const skippedLandlordSms = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'landlord',
        recipientId: params.landlordId || null,
        recipientName: ownerName,
        recipientContact: ownerPhone,
        channel: 'sms',
        subject: 'Rent Collected Owner Alert (Disabled)',
        message: landlordSmsMessage,
        status: 'skipped_by_preference',
        metadata: { reason: 'Disabled by landlord preference toggle' }
      });
      logs.push(skippedLandlordSms);
    }

    // 2B. Landlord Email Notification
    const landlordEmailSubject = `Rent Collected: KSh ${amountKSh} from ${params.tenantName} (${params.propertyName} - Unit ${params.unitNumber})`;
    const landlordEmailBody = `
Hello ${ownerName},

A new rent collection has been registered and verified for your property portfolio:

• Property: ${params.propertyName}
• Unit: ${params.unitNumber}
• Tenant: ${params.tenantName} (${params.tenantPhone})
• Amount Collected: KSh ${amountKSh}
• Method: ${methodClean} (Ref: ${txRefDisplay})
• Receipt Number: ${receiptDisplay}
• Collection Date: ${params.paymentDate}
• Tenant Remainder Balance: KSh ${balanceKSh}

Your system financial metrics and collection roll have been updated automatically.

KodiPay Real-Time Notification Engine
    `.trim();

    if (prefs.email_payment_received && ownerEmail) {
      const landlordEmailLog = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'landlord',
        recipientId: params.landlordId || null,
        recipientName: ownerName,
        recipientContact: ownerEmail,
        channel: 'email',
        subject: landlordEmailSubject,
        message: landlordEmailBody,
        status: 'delivered',
        metadata: {
          gateway: 'KodiPay SMTP Service (Simulated)',
          paymentId: params.paymentId
        }
      });
      logs.push(landlordEmailLog);
    } else if (!prefs.email_payment_received) {
      const skippedLandlordEmail = await this.logNotification({
        eventType: 'rent_payment_received',
        recipientType: 'landlord',
        recipientId: params.landlordId || null,
        recipientName: ownerName,
        recipientContact: ownerEmail,
        channel: 'email',
        subject: landlordEmailSubject,
        message: landlordEmailBody,
        status: 'skipped_by_preference',
        metadata: { reason: 'Disabled by landlord preference toggle' }
      });
      logs.push(skippedLandlordEmail);
    }

    // 2C. In-App Notification entry for the landlord dashboard feed
    const inAppLog = await this.logNotification({
      eventType: 'rent_payment_received',
      recipientType: 'landlord',
      recipientId: params.landlordId || null,
      recipientName: ownerName,
      recipientContact: ownerEmail,
      channel: 'in_app',
      subject: `Payment of KSh ${amountKSh} Received`,
      message: `${params.tenantName} paid KSh ${amountKSh} for Unit ${params.unitNumber} (${params.propertyName}) via ${methodClean}.`,
      status: 'delivered',
      metadata: {
        paymentId: params.paymentId,
        receiptNumber: receiptDisplay,
        amountCents: params.amountCents
      }
    });
    logs.push(inAppLog);

    const deliveredCount = logs.filter((l) => l.status === 'delivered').length;
    return { dispatchedCount: deliveredCount, logs };
  }

  /**
   * Retrieve notification logs with optional filters
   */
  public async getLogs(options?: {
    channel?: string;
    recipientType?: string;
    eventType?: string;
    limit?: number;
  }): Promise<NotificationLogRecord[]> {
    let sql = `SELECT * FROM notification_logs WHERE 1=1`;
    const params: any[] = [];

    if (options?.channel) {
      params.push(options.channel);
      sql += ` AND channel = $${params.length}`;
    }

    if (options?.recipientType) {
      params.push(options.recipientType);
      sql += ` AND recipient_type = $${params.length}`;
    }

    if (options?.eventType) {
      params.push(options.eventType);
      sql += ` AND event_type = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${options?.limit || 100}`;

    const res = await query(sql, params);
    return res.rows;
  }
}

export const notificationService = new NotificationService();
