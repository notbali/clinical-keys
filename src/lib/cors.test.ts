import { describe, expect, it } from 'vitest';
import { corsHeaders, parseAllowedOrigins } from '../../supabase/functions/_shared/cors';

describe('parseAllowedOrigins', () => {
  it('defaults to any origin when unset or blank', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['*']);
    expect(parseAllowedOrigins('')).toEqual(['*']);
    expect(parseAllowedOrigins('  ')).toEqual(['*']);
  });
  it('strips trailing slashes and whitespace, which is the mistake that blocked the first sign-in', () => {
    expect(parseAllowedOrigins('https://clinicalkeys.netlify.app/')).toEqual(['https://clinicalkeys.netlify.app']);
    expect(parseAllowedOrigins(' https://a.example// ')).toEqual(['https://a.example']);
  });
  it('accepts several sites separated by commas or spaces', () => {
    expect(parseAllowedOrigins('https://a.example, https://b.example/ https://c.example')).toEqual([
      'https://a.example', 'https://b.example', 'https://c.example',
    ]);
  });
  it('lowercases the host part so a capital letter cannot lock everyone out', () => {
    expect(parseAllowedOrigins('HTTPS://ClinicalKeys.Netlify.app')).toEqual(['https://clinicalkeys.netlify.app']);
  });
});

describe('corsHeaders', () => {
  const allowed = parseAllowedOrigins('https://clinicalkeys.netlify.app/');
  const originOf = (h: Record<string, string>) => h['Access-Control-Allow-Origin'];

  it('echoes the exact origin of the allowed site', () => {
    expect(originOf(corsHeaders('https://clinicalkeys.netlify.app', allowed))).toBe('https://clinicalkeys.netlify.app');
  });
  it('never sends a trailing slash back, even if the request origin had one', () => {
    expect(originOf(corsHeaders('https://clinicalkeys.netlify.app/', allowed))).toBe('https://clinicalkeys.netlify.app');
  });
  it('sends no allow-origin header to a site that is not on the list, so the browser blocks it', () => {
    expect(originOf(corsHeaders('https://evil.example', allowed))).toBeUndefined();
    expect(originOf(corsHeaders(null, allowed))).toBeUndefined();
    expect(originOf(corsHeaders('https://clinicalkeys.netlify.app.evil.example', allowed))).toBeUndefined();
  });
  it('uses * only when every origin is allowed', () => {
    expect(originOf(corsHeaders('https://anything.example', ['*']))).toBe('*');
    expect(originOf(corsHeaders(null, ['*']))).toBe('*');
  });
  it('lets any one of several listed sites through, each with its own origin', () => {
    const many = parseAllowedOrigins('https://a.example,https://b.example');
    expect(originOf(corsHeaders('https://b.example', many))).toBe('https://b.example');
    expect(originOf(corsHeaders('https://c.example', many))).toBeUndefined();
  });
  it('tells caches the answer depends on the origin, and always allows the headers the browser asks for', () => {
    const h = corsHeaders('https://clinicalkeys.netlify.app', allowed);
    expect(h['Vary']).toBe('Origin');
    expect(h['Access-Control-Allow-Headers']).toMatch(/content-type/);
    expect(h['Access-Control-Allow-Headers']).toMatch(/authorization/);
    expect(h['Access-Control-Allow-Methods']).toMatch(/POST/);
  });
});
