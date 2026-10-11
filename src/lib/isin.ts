// ISIN: 2 letters (country), 9 alphanumerics, 1 check digit (Luhn over the digit expansion).

export function normalizeIsin(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidIsin(raw: string): boolean {
  const isin = normalizeIsin(raw);
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  // Letters become two digits (A = 10 … Z = 35), then Luhn over the whole digit string.
  const digits = isin
    .split('')
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
