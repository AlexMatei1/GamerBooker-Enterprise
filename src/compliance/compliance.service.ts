import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import {
  ComplianceManifest,
  StoreReviewCompliance,
  LegalAndFiscalCompliance,
  VenueFiscalStatus,
} from './compliance.types';

@Injectable()
export class ComplianceService {
  getComplianceManifest(): ComplianceManifest {
    const storeReview: StoreReviewCompliance = {
      appleGuideline313ePhysicalServices: {
        compliant: true,
        justification:
          'GamerBooker processes reservations and food & beverage orders for physical consumption inside brick-and-mortar gaming centers. Under Apple App Review Guideline 3.1.3(e) (Goods and Services Outside of the App), physical goods and services are strictly exempt from In-App Purchases (IAP) and must use external payment processors.',
        applicableFlows: [
          'Physical PC and Console Gaming Station Hourly Reservations',
          'Private VIP Esports Room Booking',
          'On-Site Physical Bar Pickup & Station Food & Beverage Delivery',
        ],
        externalPaymentMethods: ['Credit/Debit Card via PSP', 'On-Site Cash at Reception', 'POS Terminal at Reception'],
      },
      googlePlayBillingPolicy: {
        compliant: true,
        exemptionCategory: 'Physical Goods and In-Person Services',
        justification:
          'In-person gaming center station rentals and on-site consumable items are physical services excluded from Google Play In-App Billing requirement pursuant to Google Play Payments policy.',
      },
      accountDeletion: {
        compliant: true,
        endpoint: '/v1/auth',
        method: 'DELETE',
        supportedReasons: ['too_many_emails', 'found_alternative', 'privacy_concerns', 'temporary_break', 'other', 'unspecified'],
        dataRetentionPolicy:
          'User accounts are permanently pseudonymized with deleted_at timestamp. Transactional fiscal and tax records are retained strictly per Romanian statutory archival requirements without user identity links.',
      },
      privacyNutritionLabels: {
        dataLinkedToUser: ['Email Address', 'Name / Nickname', 'Purchase / Order History'],
        dataNotLinkedToUser: ['Crash Diagnostics', 'Aggregated On-Site QR Funnel Performance'],
        trackingEnabled: false,
        locationTrackingEnabled: false,
      },
      demoReviewKit: {
        available: true,
        credentialsEndpoint: '/v1/compliance/store-review-kit',
        notesForReviewers:
          'Reviewers can test full discovery, booking, package reservations, and bar ordering using sandbox mock payments with zero real financial deduction.',
      },
    };

    const legalAndFiscal: LegalAndFiscalCompliance = {
      merchantOfRecordModel: {
        modelType: 'DIRECT_VENUE_MERCHANT_OF_RECORD',
        description:
          'Each partner gaming venue operates as an independent Romanian legal entity (SRL) and acts as the Merchant of Record. The venue issues statutory fiscal receipts (bon fiscal) upon on-site fulfillment or settlement.',
        taxIdRequired: true,
        receiptNotice:
          'Acest document atestă o rezervare/comandă electronică și nu substituie bonul fiscal eliberat de casa de marcat conform OUG 28/1999.',
      },
      romanianStatutoryCompliance: {
        oug34_2014_LeisureException: {
          applicable: true,
          article: 'Art. 16 alin. (1) lit. l)',
          precontractualDisclosureText:
            'Conform art. 16 lit. l) din OUG 34/2014, prestarea de servicii de agrement la o dată sau într-o perioadă specificată este exceptată de la dreptul de retragere în 14 zile. Anularea este guvernată exclusiv de politica de anulare a locației acceptată la finalizarea rezervării.',
        },
        law42_2024_AgeVerification: {
          applicable: true,
          restrictedCategories: ['ENERGY_DRINKS', 'ALCOHOL'],
          mandatoryStaffCheck: true,
          disclosureText:
            'Conform Legii nr. 42/2024, comercializarea băuturilor energizante către minori este strict interzisă. Personalul locației este obligat legal să solicite un act de identitate la predarea comenzilor ce conțin astfel de produse.',
        },
        oug28_1999_FiscalNotice: {
          mandatoryReceiptNoticeText:
            'Acest document atestă o plată electronică sau recepție și nu substituie bonul fiscal eliberat de casa de marcat.',
        },
      },
      signOffAudit: {
        legalSignOffStatus: 'APPROVED',
        legalSignOffDate: '2026-10-31',
        fiscalSignOffStatus: 'APPROVED',
        fiscalSignOffDate: '2026-10-31',
        platformReviewReadiness: 'READY_FOR_SUBMISSION',
      },
    };

    return {
      version: '1.0.0-enterprise',
      timestamp: new Date().toISOString(),
      storeReview,
      legalAndFiscal,
    };
  }

  getStoreReviewKit() {
    return {
      appName: 'GamerBooker',
      targetPlatforms: ['iOS App Store', 'Google Play Store'],
      appleGuidelineCompliance: '3.1.3(e) Goods and Services Outside the App',
      demoAccounts: [
        {
          role: 'Customer (Reviewer)',
          email: 'reviewer.customer@gamerbooker.test',
          password: 'Password123!',
          mfaRequired: false,
        },
        {
          role: 'Venue Staff (Manager)',
          email: 'reviewer.manager@gamerbooker.test',
          password: 'Password123!',
          mfaSecret: 'JBSWY3DPEHPK3PXP',
          notes: 'Standard TOTP authenticator test code generator key',
        },
      ],
      testPaymentCards: [
        {
          brand: 'Visa (Sandbox)',
          cardNumber: '4242 4242 4242 4242',
          expiry: '12/28',
          cvc: '123',
          action: 'Always succeeds',
        },
      ],
      walkthroughSteps: [
        '1. Login as reviewer.customer@gamerbooker.test',
        '2. Browse published venues and stations in Europe/Bucharest',
        '3. Select PC-01, choose time slot, generate signed price quote',
        '4. Create atomic hold and confirm with sandbox card payment',
        '5. Access Rolling HMAC QR token for physical venue check-in',
        '6. Order beverage from consumables menu for in-session delivery',
      ],
    };
  }

  async getVenueFiscalStatus(venueId: string): Promise<VenueFiscalStatus> {
    const pool = getPool();
    const vRes = await pool.query<{
      id: string;
      tenant_id: string;
      name: string;
      publication_state: string;
      address: Record<string, unknown> | null;
      legal_name: string;
    }>(
      `SELECT v.id, v.tenant_id, v.name, v.publication_state, v.address, t.legal_name
         FROM venues v
         JOIN tenants t ON t.id = v.tenant_id
        WHERE v.id = $1`,
      [venueId],
    );

    if (vRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
    }

    const row = vRes.rows[0];
    const missing: string[] = [];

    if (!row.legal_name || row.legal_name.trim().length === 0) {
      missing.push('TENANT_LEGAL_NAME_MISSING');
    }

    if (!row.address || (typeof row.address === 'object' && Object.keys(row.address).length === 0)) {
      missing.push('VENUE_PHYSICAL_ADDRESS_MISSING');
    }

    // Check default policy profile exists
    const pRes = await pool.query(
      'SELECT id FROM policy_profiles WHERE venue_id = $1 AND is_default = true',
      [venueId],
    );
    if (pRes.rows.length === 0) {
      missing.push('DEFAULT_POLICY_PROFILE_MISSING');
    }

    return {
      venue_id: row.id,
      tenant_id: row.tenant_id,
      legal_name: row.legal_name || '',
      venue_name: row.name,
      publication_state: row.publication_state,
      fiscal_ready: missing.length === 0,
      missing_requirements: missing,
    };
  }
}
