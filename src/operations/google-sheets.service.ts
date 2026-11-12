import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { writeAudit } from '../auth/audit';
import { hash } from '../auth/password';

/**
 * Cafe intake from a Google Form / Google Sheet.
 *
 * The public application channel is a Google Form whose answers land in a
 * Google Sheet. A platform admin triggers the import; nothing is imported
 * automatically and the public internet cannot reach this code path.
 *
 * Configuration is fail-closed: without CAFE_INTAKE_CSV_URL (the sheet's
 * "Publish to web -> CSV" URL) the endpoint refuses to run and reports that
 * intake is not configured instead of pretending the import worked.
 */

export interface NormalizedApplication {
  legal_name: string;
  venue_name: string;
  timezone: string;
  city: string;
  applicant_email: string;
  cui?: string;
  address?: string;
  phone?: string;
  stations_count?: string;
  rate_standard?: string;
  rate_vip?: string;
  schedule?: string;
  amenities?: string;
  raw_fields?: Record<string, string>;
}

export interface IntakeAccount {
  email: string;
  temporary_password: string | null;
  application_id: string;
  created: boolean;
}

export interface IntakeResult {
  configured: boolean;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  accounts: IntakeAccount[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** CSV parser: RFC 4180 quoting, CRLF/LF, doubled quotes, embedded newlines. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((value) => value.some((cell) => cell.trim() !== ''));
}

function cleanText(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export type ApplicationFormField =
  | 'legal_name'
  | 'venue_name'
  | 'timezone'
  | 'city'
  | 'applicant_email'
  | 'cui'
  | 'address'
  | 'phone'
  | 'stations_count'
  | 'rate_standard'
  | 'rate_vip'
  | 'schedule'
  | 'amenities';

export function matchHeaderToField(header: string): ApplicationFormField | 'unknown' {
  const clean = cleanText(header);
  if (/\b(cui|cif)\b|codul\s+unic|fiscal/.test(clean) || /^cuicif/.test(clean)) return 'cui';
  if (/juridic|srl|pfa|denumire.*firma|legalname|legal_name/.test(clean)) return 'legal_name';
  if (/email|e-mail/.test(clean)) return 'applicant_email';
  if (/telefon|phone|mobil/.test(clean)) return 'phone';
  if (/adresa|strada|address/.test(clean)) return 'address';
  if (/oras|city|localitate/.test(clean)) return 'city';
  if (/vip|bootcamp/.test(clean)) return 'rate_vip';
  if (/standard/.test(clean)) return 'rate_standard';
  if (/dotari|mentiuni|specificat|gpu|fanatec|amenities/.test(clean)) return 'amenities';
  if (/numar.*statii|total.*statii|statii.*pc|total.*pc|statii/.test(clean)) return 'stations_count';
  if (/program|orar|interval|schedule/.test(clean)) return 'schedule';
  if (/nume.*internet|nume.*cafe|numelocatie|nume.*sala|venue|locatie/.test(clean)) return 'venue_name';
  return 'unknown';
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeRow(
  headers: string[],
  values: string[],
): NormalizedApplication {
  const extracted: Partial<Record<ApplicationFormField, string>> = {};
  const rawFields: Record<string, string> = {};

  headers.forEach((header, position) => {
    const rawVal = clean(values[position]);
    if (header.trim()) {
      rawFields[header.trim()] = rawVal;
    }
    const matched = matchHeaderToField(header);
    if (matched !== 'unknown' && rawVal && !extracted[matched]) {
      extracted[matched] = rawVal;
    }
  });

  const legal_name = extracted.legal_name || '';
  const venue_name = extracted.venue_name || '';
  const city = extracted.city || '';
  const applicant_email = (extracted.applicant_email || '').toLowerCase();
  const timezone = extracted.timezone || 'Europe/Bucharest';

  if (legal_name.length < 2 || legal_name.length > 160) {
    throw new Error('denumirea juridică lipsește sau nu are între 2 și 160 de caractere');
  }
  if (venue_name.length < 2 || venue_name.length > 120) {
    throw new Error('numele cafenelei lipsește sau nu are între 2 și 120 de caractere');
  }
  if (city.length < 2 || city.length > 120) {
    throw new Error('orașul lipsește sau nu are între 2 și 120 de caractere');
  }
  if (!EMAIL_RE.test(applicant_email) || applicant_email.length > 254) {
    throw new Error('adresa de email este invalidă');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('fusul orar este invalid');
  }

  return {
    legal_name,
    venue_name,
    timezone,
    city,
    applicant_email,
    cui: extracted.cui || '',
    address: extracted.address || '',
    phone: extracted.phone || '',
    stations_count: extracted.stations_count || '20',
    rate_standard: extracted.rate_standard || '25',
    rate_vip: extracted.rate_vip || '',
    schedule: extracted.schedule || '10:00 - 02:00',
    amenities: extracted.amenities || '',
    raw_fields: rawFields,
  };
}

export function normalizeGoogleSheetsUrl(input: string): string {
  let url = (input ?? '').trim();
  if (!url) return '';

  if (/docs\.google\.com\/forms\//i.test(url)) {
    throw new AuthHttpError(
      400,
      'INTAKE_FORM_NOT_SHEET',
      'Ați introdus linkul formularului Google Forms, nu al foii de calcul cu răspunsuri. În Google Forms: mergeți la tab-ul «Răspunsuri» (Responses) -> apăsați pe pictograma verde «Trimiteți în Foi de calcul» (Link to Sheets) -> copiați linkul acelei foi Google Sheets create și introduceți-l aici.',
    );
  }

  if (/output=csv|format=csv/i.test(url)) {
    return url;
  }

  const pubMatch = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)\/(?:pubhtml|pub)/i);
  if (pubMatch) {
    return `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv`;
  }

  const sheetMatch = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheetMatch) {
    const sheetId = sheetMatch[1];
    const gidMatch = url.match(/[?&#]gid=([0-9]+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
  }

  return url;
}

@Injectable()
export class GoogleSheetsService {
  private url = (process.env.CAFE_INTAKE_CSV_URL ?? '').trim();

  status(): { configured: boolean; url: string } {
    return { configured: this.url.length > 0, url: this.url };
  }

  setUrl(newUrl: string): { configured: boolean; url: string } {
    this.url = normalizeGoogleSheetsUrl(newUrl);
    process.env.CAFE_INTAKE_CSV_URL = this.url;
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        if (/CAFE_INTAKE_CSV_URL=/.test(content)) {
          content = content.replace(/CAFE_INTAKE_CSV_URL=.*/, `CAFE_INTAKE_CSV_URL=${this.url}`);
        } else {
          content += `\nCAFE_INTAKE_CSV_URL=${this.url}\n`;
        }
        fs.writeFileSync(envPath, content, 'utf8');
      }
    } catch {
      // Ignored if write restricted
    }
    return this.status();
  }

  /** Downloads and parses the published sheet. Never logs row content. */
  async fetchRows(): Promise<string[][]> {
    if (!this.url) {
      throw new AuthHttpError(
        503,
        'INTAKE_NOT_CONFIGURED',
        'Importul din Google Sheets nu este configurat pe acest server.',
      );
    }
    let response: Response;
    try {
      response = await fetch(this.url, {
        redirect: 'follow',
        headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AuthHttpError(
        502,
        'INTAKE_UNAVAILABLE',
        'Foaia Google nu poate fi descărcată acum.',
      );
    }
    if (!response.ok) {
      throw new AuthHttpError(
        502,
        'INTAKE_UNAVAILABLE',
        'Foaia Google nu poate fi descărcată acum.',
      );
    }
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html') || trimmed.includes('<body')) {
      throw new AuthHttpError(
        400,
        'INTAKE_SHEET_NOT_PUBLIC',
        'Foaia de calcul Google Sheets nu este accesibilă public. În Google Sheets: apăsați butonul „Trimiteți” (Share) din dreapta sus -> la „Acces general” alegeți „Oricine are linkul poate vizualiza” (Anyone with the link can view) -> Salvați, apoi reîncercați sincronizarea.',
      );
    }
    const rows = parseCsv(text);
    if (rows.length < 2) {
      throw new AuthHttpError(
        400,
        'INTAKE_EMPTY',
        'Foaia nu conține încă nicio cerere completată.',
      );
    }
    return rows;
  }

  async syncFromSheet(actorId: string): Promise<IntakeResult> {
    const rows = await this.fetchRows();
    return this.processRows(actorId, rows);
  }

  async syncFromCsvText(actorId: string, csvText: string): Promise<IntakeResult> {
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new AuthHttpError(
        400,
        'INTAKE_EMPTY',
        'Foaia sau textul CSV nu conține antet și cel puțin un rând de date.',
      );
    }
    return this.processRows(actorId, rows);
  }

  private async processRows(actorId: string, rows: string[][]): Promise<IntakeResult> {
    const headers = rows[0];
    const result: IntakeResult = {
      configured: true,
      total: rows.length - 1,
      imported: 0,
      skipped: 0,
      errors: [],
      accounts: [],
    };

    for (let index = 1; index < rows.length; index++) {
      try {
        const normalized = normalizeRow(headers, rows[index]);
        const outcome = await this.importRow(actorId, normalized);
        if (outcome.imported) result.imported++;
        else result.skipped++;
        if (outcome.account) result.accounts.push(outcome.account);
      } catch (error) {
        result.skipped++;
        const message = error instanceof Error ? error.message : 'rând invalid';
        result.errors.push(`rândul ${index + 1}: ${message}`);
      }
    }
    return result;
  }

  private async importRow(
    actorId: string,
    input: NormalizedApplication,
  ): Promise<{ imported: boolean; account?: IntakeAccount }> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const outcome = await this.importRowInTransaction(client, actorId, input);
      await client.query('COMMIT');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async importRowInTransaction(
    client: PoolClient,
    actorId: string,
    input: NormalizedApplication,
  ): Promise<{ imported: boolean; account?: IntakeAccount }> {
    const existing = await client.query<{
      id: string;
      email_verified_at: Date | null;
      identity_status: string;
      deleted_at: Date | null;
    }>(
      `SELECT id, email_verified_at, identity_status, deleted_at
         FROM users WHERE lower(email) = lower($1)`,
      [input.applicant_email],
    );

    let userId: string;
    let temporaryPassword: string | null = null;
    let created = false;

    const found = existing.rows[0];
    if (found) {
      if (found.deleted_at || found.identity_status === 'suspended') {
        throw new Error('contul asociat adresei de email este închis sau suspendat');
      }
      const admin = await client.query(
        'SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL',
        [found.id],
      );
      if (admin.rowCount) {
        throw new Error('adresa aparține unui cont de administrator de platformă');
      }
      if (!found.email_verified_at || found.identity_status !== 'verified') {
        await client.query(
          `UPDATE users SET email_verified_at=now(), identity_status='verified', updated_at=now()
            WHERE id=$1`,
          [found.id],
        );
      }
      userId = found.id;
    } else {
      temporaryPassword = randomBytes(18).toString('base64url');
      const passwordHash = await hash(temporaryPassword);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, email_verified_at, identity_status)
         VALUES ($1, $2, now(), 'verified') RETURNING id`,
        [input.applicant_email, passwordHash],
      );
      userId = inserted.rows[0].id;
      created = true;
    }

    const application = await client.query<{ id: string; status: string; form_data?: any }>(
      'SELECT id, status, form_data FROM cafe_applications WHERE applicant_user_id=$1 FOR UPDATE',
      [userId],
    );
    let applicationId: string;
    let imported: boolean;
    const existingFormData = (typeof application.rows[0]?.form_data === 'object' && application.rows[0]?.form_data !== null)
      ? (application.rows[0].form_data as Record<string, any>)
      : {};
    const effectiveTempPassword = temporaryPassword || existingFormData.temporary_password || null;
    const formData = {
      cui: input.cui || '',
      address: input.address || '',
      phone: input.phone || '',
      stations_count: input.stations_count || '20',
      rate_standard: input.rate_standard || '25',
      rate_vip: input.rate_vip || '',
      schedule: input.schedule || '10:00 - 02:00',
      amenities: input.amenities || '',
      raw_fields: input.raw_fields || {},
      ...(effectiveTempPassword ? {
        temporary_password: effectiveTempPassword,
        temporary_password_generated_at: existingFormData.temporary_password_generated_at || new Date().toISOString(),
      } : {}),
    };

    if (!application.rowCount) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO cafe_applications
           (applicant_user_id, legal_name, venue_name, timezone, city, form_data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
        [
          userId,
          input.legal_name,
          input.venue_name,
          input.timezone,
          input.city,
          JSON.stringify(formData),
        ],
      );
      applicationId = inserted.rows[0].id;
      imported = true;
    } else if (application.rows[0].status !== 'PENDING') {
      // Decisions are immutable. A sheet row must never reopen an approved or
      // rejected application.
      applicationId = application.rows[0].id;
      imported = false;
    } else {
      await client.query(
        `UPDATE cafe_applications
            SET legal_name=$2, venue_name=$3, timezone=$4, city=$5, form_data=$6::jsonb, updated_at=now()
          WHERE id=$1`,
        [
          application.rows[0].id,
          input.legal_name,
          input.venue_name,
          input.timezone,
          input.city,
          JSON.stringify(formData),
        ],
      );
      applicationId = application.rows[0].id;
      imported = true;
    }

    await writeAudit(
      client,
      'cafe.application_imported',
      actorId,
      {
        application_id: applicationId,
        email_hash: createHash('sha256')
          .update(input.applicant_email)
          .digest('hex'),
        account_created: created,
        imported,
      },
      { targetId: applicationId, targetType: 'CAFE_APPLICATION' },
    );

    if (imported && temporaryPassword) {
      return {
        imported,
        account: {
          email: input.applicant_email,
          temporary_password: temporaryPassword,
          application_id: applicationId,
          created,
        },
      };
    }
    return { imported };
  }
}
