/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';

export interface AiDraftRequest {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  amountKSh?: number;
  balanceKSh?: number;
  dueDate?: string;
  paymentMethod?: string;
  tone: 'professional' | 'warm_friendly' | 'swahili_bilingual' | 'formal_legal' | 'gentle_reminder';
  eventType: 'payment_acknowledgement' | 'rent_reminder' | 'overdue_notice' | 'welcome_tenant';
  customInstructions?: string;
}

export interface AiDraftResponse {
  smsMessage: string;
  smsCharacterCount: number;
  emailSubject: string;
  emailBody: string;
  culturalNotes: string;
  modelUsed: string;
}

export interface AiCollectionInsightRequest {
  totalCollectedKSh: number;
  expectedRentKSh: number;
  collectionRatePct: number;
  occupiedUnits: number;
  vacantUnits: number;
  totalArrearsKSh: number;
  monthName: string;
}

export interface AiCollectionInsightResponse {
  executiveSummary: string;
  collectionHealth: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
  recommendations: string[];
  suggestedActionPlan: string;
}

export class NotificationAiService {
  private ai: GoogleGenAI | null = null;

  private getAi(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY' && !key.startsWith('MY_') && key.length > 10) {
      if (!this.ai) {
        try {
          this.ai = new GoogleGenAI({ apiKey: key });
        } catch (e: any) {
          console.warn('GoogleGenAI initialization error:', e.message);
          return null;
        }
      }
      return this.ai;
    }
    return null;
  }

  /**
   * Draft tailored SMS & Email notifications using Gemini 3.8 Flash
   */
  public async draftNotification(params: AiDraftRequest): Promise<AiDraftResponse> {
    const formattedAmount = params.amountKSh ? `KSh ${params.amountKSh.toLocaleString('en-KE')}` : 'rent';
    const formattedBalance = params.balanceKSh !== undefined ? `KSh ${params.balanceKSh.toLocaleString('en-KE')}` : 'KSh 0';
    const prompt = `
You are the AI Communication Engine for KodiPay, a Kenyan rental property management platform.
Compose a rent notification for both SMS and Email in the Kenyan context.

CONTEXT:
- Event: ${params.eventType}
- Tenant Name: ${params.tenantName}
- Unit: ${params.unitNumber}
- Property: ${params.propertyName}
- Rent Amount: ${formattedAmount}
- Current Outstanding Balance: ${formattedBalance}
- Payment Method: ${params.paymentMethod || 'M-Pesa'}
- Due Date: ${params.dueDate || '5th of this month'}
- Requested Tone: ${params.tone}
${params.customInstructions ? `- Additional Guidance: ${params.customInstructions}` : ''}

TONE GUIDELINES:
- 'swahili_bilingual': Blend English and polite Kenyan Swahili (e.g., "Jambo", "Habari", "Asante sana", "Lipia mapema").
- 'warm_friendly': Welcoming, polite, community-focused while maintaining clarity.
- 'professional': Standard formal Kenyan corporate communication.
- 'formal_legal': Strict tenancy agreement and contract reference.
- 'gentle_reminder': Courteous reminder without being confrontational.

REQUIREMENTS:
1. SMS Message: MUST be crisp, clear, and ideally UNDER 160 characters (one standard SMS credit in Kenya). Must include unit number and key figures.
2. Email Subject: Concise, informative.
3. Email Body: 2 to 3 concise paragraphs with bullet points for key details (Amount, Unit, Property, Balance, Paybill/Account info).
4. Cultural Notes: A brief 1-sentence note explaining the communication approach.

Respond in strict JSON with keys:
{
  "smsMessage": "string",
  "emailSubject": "string",
  "emailBody": "string",
  "culturalNotes": "string"
}
`;

    try {
      const ai = this.getAi();
      if (ai) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const text = response.text?.trim() || '';
        const parsed = JSON.parse(text);
        return {
          smsMessage: parsed.smsMessage || '',
          smsCharacterCount: (parsed.smsMessage || '').length,
          emailSubject: parsed.emailSubject || '',
          emailBody: parsed.emailBody || '',
          culturalNotes: parsed.culturalNotes || 'Generated tailored message for Kenyan rental context.',
          modelUsed: 'gemini-3.8-flash'
        };
      }
    } catch (err: any) {
      console.warn('Gemini API call failed, using intelligent fallback generator:', err.message);
    }

    // High quality intelligent Kenyan fallback templates
    return this.generateFallbackDraft(params, formattedAmount, formattedBalance);
  }

  /**
   * Executive AI Collection Insights for Landlord Dashboard
   */
  public async generateCollectionInsights(
    data: AiCollectionInsightRequest
  ): Promise<AiCollectionInsightResponse> {
    const prompt = `
You are the Chief Financial AI Analyst for KodiPay Kenya Rental Management.
Analyze the following property portfolio collection performance for ${data.monthName}:

- Total Rent Expected: KSh ${data.expectedRentKSh.toLocaleString('en-KE')}
- Total Rent Collected to Date: KSh ${data.totalCollectedKSh.toLocaleString('en-KE')}
- Collection Rate: ${data.collectionRatePct.toFixed(1)}%
- Total Arrears Remaining: KSh ${data.totalArrearsKSh.toLocaleString('en-KE')}
- Occupied Units: ${data.occupiedUnits}
- Vacant Units: ${data.vacantUnits}

Provide an executive landlord briefing in JSON format with keys:
{
  "executiveSummary": "string (2-3 sentences assessing overall financial momentum and collection pace)",
  "collectionHealth": "Excellent" | "Good" | "Needs Attention" | "Critical",
  "recommendations": ["string", "string", "string"],
  "suggestedActionPlan": "string (1-2 sentences on immediate actions for the next 48 hours)"
}
`;

    try {
      const ai = this.getAi();
      if (ai) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const text = response.text?.trim() || '';
        return JSON.parse(text);
      }
    } catch (err: any) {
      console.warn('Gemini collection insights call fallback:', err.message);
    }

    // Intelligent fallback
    const rate = data.collectionRatePct;
    let health: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical' = 'Good';
    if (rate >= 90) health = 'Excellent';
    else if (rate >= 75) health = 'Good';
    else if (rate >= 50) health = 'Needs Attention';
    else health = 'Critical';

    return {
      executiveSummary: `For ${data.monthName}, your portfolio has collected KSh ${data.totalCollectedKSh.toLocaleString('en-KE')} out of KSh ${data.expectedRentKSh.toLocaleString('en-KE')}, reaching a ${data.collectionRatePct.toFixed(1)}% collection efficiency across ${data.occupiedUnits} occupied units. Outstanding arrears total KSh ${data.totalArrearsKSh.toLocaleString('en-KE')}.`,
      collectionHealth: health,
      recommendations: [
        'Send automated M-Pesa STK push reminders to tenants with pending balances before the 10th.',
        'Follow up directly with partially paid tenants to establish scheduled settlement plans.',
        'Market the currently vacant units across digital portals to restore 100% occupancy.'
      ],
      suggestedActionPlan: `Dispatch automated SMS rent receipts to confirmed payers, and initiate personalized M-Pesa reminder prompts for the remaining KSh ${data.totalArrearsKSh.toLocaleString('en-KE')} in arrears.`
    };
  }

  private generateFallbackDraft(
    params: AiDraftRequest,
    amountStr: string,
    balanceStr: string
  ): AiDraftResponse {
    let sms = '';
    let emailSubj = '';
    let emailBody = '';
    let notes = '';

    if (params.eventType === 'payment_acknowledgement') {
      if (params.tone === 'swahili_bilingual') {
        sms = `KODIPAY: Jambo ${params.tenantName}, tumepokea ${amountStr} ya Unit ${params.unitNumber} (${params.propertyName}). Salio ni ${balanceStr}. Asante sana!`;
        emailSubj = `Uthibitisho wa Malipo: ${amountStr} - Unit ${params.unitNumber}, ${params.propertyName}`;
        emailBody = `Habari ${params.tenantName},\n\nTunathibitisha kupokea malipo yako ya kodi ya ${amountStr} kwa ajili ya Unit ${params.unitNumber} (${params.propertyName}).\n\n• Kiasi Kilicholipwa: ${amountStr}\n• Salio Lililobaki: ${balanceStr}\n\nRisiti yako rasmi imeambatanishwa kwenye mfumo wako wa KodiPay.\n\nAsante kwa ushirikiano wako.\nKodiPay Kenya`;
        notes = 'Polite Swahili-English bilingual receipt with culturally resonant appreciation.';
      } else {
        sms = `KODIPAY: Receipt for ${params.tenantName}. Received ${amountStr} for Unit ${params.unitNumber} (${params.propertyName}). Bal: ${balanceStr}. Asante!`;
        emailSubj = `Official Rent Receipt: ${amountStr} for Unit ${params.unitNumber} - ${params.propertyName}`;
        emailBody = `Dear ${params.tenantName},\n\nThis is an official acknowledgement that your payment of ${amountStr} for Unit ${params.unitNumber} at ${params.propertyName} has been verified.\n\n• Paid Amount: ${amountStr}\n• Remaining Balance: ${balanceStr}\n• Date: ${new Date().toLocaleDateString('en-GB')}\n\nThank you for choosing KodiPay.`;
        notes = 'Clear, concise English receipt meeting Kenyan tenancy communication norms.';
      }
    } else if (params.eventType === 'rent_reminder') {
      sms = `KODIPAY REMINDER: Jambo ${params.tenantName}, rent of ${amountStr} for Unit ${params.unitNumber} (${params.propertyName}) is due on ${params.dueDate || '5th'}. Lipa na M-Pesa Paybill 400200.`;
      emailSubj = `Upcoming Rent Due Notice: Unit ${params.unitNumber} - ${params.propertyName}`;
      emailBody = `Dear ${params.tenantName},\n\nThis is a friendly reminder that rent for Unit ${params.unitNumber} at ${params.propertyName} is due on ${params.dueDate || '5th of this month'}.\n\n• Rent Due: ${amountStr}\n• Outstanding Balance: ${balanceStr}\n• Payment Option: M-Pesa Paybill 400200, Acc: Unit ${params.unitNumber}\n\nPlease reach out if you have any questions.\n\nRegards,\nProperty Management`;
      notes = 'Gentle advance reminder with clear Paybill payment instructions.';
    } else {
      sms = `KODIPAY NOTICE: Dear ${params.tenantName}, outstanding rent of ${balanceStr} for Unit ${params.unitNumber} (${params.propertyName}) is overdue. Please settle promptly via M-Pesa 400200.`;
      emailSubj = `Overdue Rent Notice: Unit ${params.unitNumber} - ${params.propertyName}`;
      emailBody = `Dear ${params.tenantName},\n\nOur records indicate an overdue balance of ${balanceStr} for Unit ${params.unitNumber} at ${params.propertyName}.\n\nKindly make arrangements to settle this balance immediately via M-Pesa Paybill 400200 or contact management.\n\nThank you for your prompt attention.`;
      notes = 'Firm but polite overdue notice protecting landlord rights.';
    }

    return {
      smsMessage: sms,
      smsCharacterCount: sms.length,
      emailSubject: emailSubj,
      emailBody: emailBody,
      culturalNotes: notes,
      modelUsed: 'gemini-3.8-flash (intelligent fallback)'
    };
  }
}

export const notificationAi = new NotificationAiService();
