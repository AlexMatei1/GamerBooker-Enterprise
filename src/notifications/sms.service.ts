import { Injectable, Logger } from '@nestjs/common';

export interface SendSmsInput {
  toPhoneNumber: string;
  messageText: string;
  senderName?: string;
}

export interface SendSmsResult {
  success: boolean;
  messageId: string;
  provider: 'smslink_ro' | 'twilio' | 'simulator';
  deliveredAt: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioSid: string;
  private readonly twilioToken: string;
  private readonly twilioFrom: string;
  private readonly smsLinkConnectionId: string;
  private readonly smsLinkPassword: string;

  constructor() {
    this.twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.twilioFrom = process.env.TWILIO_FROM_NUMBER || 'GamerBooker';
    this.smsLinkConnectionId = process.env.SMSLINK_CONNECTION_ID || '';
    this.smsLinkPassword = process.env.SMSLINK_PASSWORD || '';
  }

  /**
   * Normalize Romanian phone numbers to international E.164 (+407xxxxxxxx)
   */
  normalizeRomanianPhone(raw: string): string {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.startsWith('40') && cleaned.length === 11) {
      return `+${cleaned}`;
    }
    if (cleaned.startsWith('07') && cleaned.length === 10) {
      return `+4${cleaned}`;
    }
    if (cleaned.startsWith('7') && cleaned.length === 9) {
      return `+40${cleaned}`;
    }
    return raw.startsWith('+') ? raw : `+${cleaned}`;
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const recipient = this.normalizeRomanianPhone(input.toPhoneNumber);
    const timestamp = new Date().toISOString();

    // 1. Romanian SMSLink Gateway integration (Primary in RO)
    if (this.smsLinkConnectionId && this.smsLinkPassword) {
      try {
        const url = new URL('https://www.smslink.ro/sms/gateway/communicate/index.php');
        url.searchParams.set('connection_id', this.smsLinkConnectionId);
        url.searchParams.set('password', this.smsLinkPassword);
        url.searchParams.set('to', recipient.replace('+', ''));
        url.searchParams.set('message', input.messageText);

        const res = await fetch(url.toString(), { method: 'GET' });
        const text = await res.text();

        if (text.includes('MESSAGE ;')) {
          const parts = text.split(';');
          return {
            success: true,
            messageId: parts[1]?.trim() || `smslink_${Date.now()}`,
            provider: 'smslink_ro',
            deliveredAt: timestamp,
          };
        }
      } catch (err) {
        this.logger.error('SMSLink dispatch failed', err);
      }
    }

    // 2. Global Twilio integration (Secondary)
    if (this.twilioSid && this.twilioToken) {
      try {
        const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');
        const body = new URLSearchParams({
          To: recipient,
          From: this.twilioFrom,
          Body: input.messageText,
        });

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (res.ok) {
          const data = (await res.json()) as { sid: string };
          return {
            success: true,
            messageId: data.sid,
            provider: 'twilio',
            deliveredAt: timestamp,
          };
        }
      } catch (err) {
        this.logger.error('Twilio SMS dispatch failed', err);
      }
    }

    // 3. Simulated delivery (Development & Sandbox)
    this.logger.log(`[SMS-SIMULATOR] Dispatched to ${recipient}: "${input.messageText}"`);
    return {
      success: true,
      messageId: `sim_sms_${Date.now()}`,
      provider: 'simulator',
      deliveredAt: timestamp,
    };
  }
}
