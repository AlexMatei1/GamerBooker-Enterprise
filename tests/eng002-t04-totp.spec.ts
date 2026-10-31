/**
 * RFC 4226 / RFC 6238 conformance for the hand-rolled TOTP implementation.
 *
 * This file exists because src/auth/totp.ts replaced otplib (decision D14 in
 * notes/eng-002-slice-b-part-2-plan.md): otplib 13.5.0's CJS build requires the
 * ESM-only @scure/base, which Node 22+ resolves through require(esm) but the
 * Jest runtime does not. A published-vector suite is what makes that trade
 * honest: the algorithm is checked against the RFCs, not against itself.
 */
import { base32Decode, base32Encode, checkTotp, hotp, timeStepAt } from '../src/auth/totp';

/** RFC 4226 and RFC 6238 use the ASCII string "12345678901234567890". */
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET = Buffer.from(RFC_SECRET_ASCII, 'ascii');

describe('base32 (RFC 4648 alphabet, no padding)', () => {
  it('encodes and decodes the RFC secret losslessly', () => {
    const encoded = base32Encode(RFC_SECRET);
    expect(base32Decode(encoded).equals(RFC_SECRET)).toBe(true);
  });

  it('encodes the RFC 4648 test vector for "foobar"', () => {
    // RFC 4648 section 10: "foobar" -> MZXW6YTBOI======
    expect(base32Encode(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
  });

  it('is case-insensitive and ignores padding on decode', () => {
    const encoded = base32Encode(RFC_SECRET);
    expect(base32Decode(encoded.toLowerCase()).equals(RFC_SECRET)).toBe(true);
    expect(base32Decode(encoded + '======').equals(RFC_SECRET)).toBe(true);
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => base32Decode('MZXW6YTB0I')).toThrow(/invalid base32/);
  });
});

describe('HOTP (RFC 4226 Appendix D)', () => {
  const vectors: Array<[number, string]> = [
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ];

  it.each(vectors)('counter %i yields %s', (counter, expected) => {
    expect(hotp(RFC_SECRET, counter)).toBe(expected);
  });
});

describe('TOTP (RFC 6238 Appendix B, SHA-1)', () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('T=%i yields %s at eight digits', (epochSeconds, expected) => {
    const step = timeStepAt(epochSeconds * 1000);
    expect(hotp(RFC_SECRET, step, 8)).toBe(expected);
  });

  it('T=59 at six digits agrees with the RFC 4226 counter-1 vector', () => {
    const step = timeStepAt(59 * 1000);
    expect(step).toBe(1);
    expect(hotp(RFC_SECRET, step, 6)).toBe('287082');
  });
});

describe('checkTotp', () => {
  const secret = base32Encode(RFC_SECRET);
  const at = (seconds: number): number => seconds * 1000;

  it('accepts the code for the current step and reports that step', () => {
    const check = checkTotp(secret, '287082', null, at(59));
    expect(check.valid).toBe(true);
    expect(check.timeStep).toBe(1);
  });

  it('accepts one step of drift in either direction', () => {
    // At T=30 the clock is on step 1, so step 0 is one step behind; at T=60 it
    // is on step 2, so step 1 is one step behind.
    expect(checkTotp(secret, '755224', null, at(30)).timeStep).toBe(0);
    expect(checkTotp(secret, '287082', null, at(60)).timeStep).toBe(1);
  });

  it('refuses a step more than one period away', () => {
    // Step 1 offered at step 3, and step 2 offered at step 0, are both two out.
    expect(checkTotp(secret, '287082', null, at(90)).valid).toBe(false);
    expect(checkTotp(secret, '359152', null, at(0)).valid).toBe(false);
  });

  it('refuses a replayed step even inside its window', () => {
    expect(checkTotp(secret, '287082', 1, at(59)).valid).toBe(false);
  });

  it('refuses a token that is not six digits without throwing', () => {
    for (const token of ['', '12345', '1234567', 'abcdef', ' 287082']) {
      expect(checkTotp(secret, token, null, at(59)).valid).toBe(false);
    }
  });

  it('refuses a code generated for a different secret', () => {
    const other = base32Encode(Buffer.from('abcdefghijklmnopqrst', 'ascii'));
    expect(checkTotp(other, '287082', null, at(59)).valid).toBe(false);
  });
});
