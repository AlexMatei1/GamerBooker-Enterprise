export interface StoreReviewCompliance {
  appleGuideline313ePhysicalServices: {
    compliant: boolean;
    justification: string;
    applicableFlows: string[];
    externalPaymentMethods: string[];
  };
  googlePlayBillingPolicy: {
    compliant: boolean;
    exemptionCategory: string;
    justification: string;
  };
  accountDeletion: {
    compliant: boolean;
    endpoint: string;
    method: 'DELETE';
    supportedReasons: string[];
    dataRetentionPolicy: string;
  };
  privacyNutritionLabels: {
    dataLinkedToUser: string[];
    dataNotLinkedToUser: string[];
    trackingEnabled: boolean;
    locationTrackingEnabled: boolean;
  };
  demoReviewKit: {
    available: boolean;
    credentialsEndpoint: string;
    demoVenueId?: string;
    notesForReviewers: string;
  };
}

export interface LegalAndFiscalCompliance {
  merchantOfRecordModel: {
    modelType: 'DIRECT_VENUE_MERCHANT_OF_RECORD';
    description: string;
    taxIdRequired: boolean;
    receiptNotice: string;
  };
  romanianStatutoryCompliance: {
    oug34_2014_LeisureException: {
      applicable: boolean;
      article: string;
      precontractualDisclosureText: string;
    };
    law42_2024_AgeVerification: {
      applicable: boolean;
      restrictedCategories: string[];
      mandatoryStaffCheck: boolean;
      disclosureText: string;
    };
    oug28_1999_FiscalNotice: {
      mandatoryReceiptNoticeText: string;
    };
  };
  signOffAudit: {
    legalSignOffStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
    legalSignOffDate: string;
    fiscalSignOffStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
    fiscalSignOffDate: string;
    platformReviewReadiness: 'READY_FOR_SUBMISSION' | 'BLOCKED';
  };
}

export interface ComplianceManifest {
  version: string;
  timestamp: string;
  storeReview: StoreReviewCompliance;
  legalAndFiscal: LegalAndFiscalCompliance;
}

export interface VenueFiscalStatus {
  venue_id: string;
  tenant_id: string;
  legal_name: string;
  venue_name: string;
  publication_state: string;
  fiscal_ready: boolean;
  missing_requirements: string[];
}
