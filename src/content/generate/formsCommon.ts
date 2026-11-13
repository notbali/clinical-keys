import type { ISODate } from '../../lib/dates';
import type { Patient } from '../types';
import { int, type Rng } from './rng';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The made-up clinic on every paper document. 555-01xx numbers are reserved for fiction. */
export const CLINIC = 'Maplewood Family Medicine';
export const clinicPhone = (rng: Rng): string => `555-01${String(int(rng, 0, 99)).padStart(2, '0')}`;

/** "11/13/2026" from an ISO date. */
export const usDate = (iso: ISODate): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/** "Delgado, Maria" -> { last: "Delgado", first: "Maria" }. */
export function splitName(p: Patient): { last: string; first: string } {
  const [last, first] = p.name.split(', ');
  return { last, first };
}

/** The date of birth as a patient might write it out: "March 4, 1981". */
export function dobInWords(p: Patient): string {
  const [m, d, y] = p.dob.split('/').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The date of birth as a prescriber writes it by hand: "3/4/1981", no leading zeros. */
export function dobHandwritten(p: Patient): string {
  const [m, d, y] = p.dob.split('/').map(Number);
  return `${m}/${d}/${y}`;
}
