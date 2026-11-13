import { int, type Rng } from './rng';

/** routine: a normal set. elevated: high blood pressure, otherwise well. febrile: a fever with the fast pulse that goes with it. */
export type VitalsProfile = 'routine' | 'elevated' | 'febrile';

export interface Vitals { sys: number; dia: number; pulse: number; resp: number; tempF: number; spo2: number }
export interface Body { heightIn: number; weightLb: number; bmi: number }

/** A number with one decimal place from `lo` to `hi`, built from whole tenths so it never picks up floating-point dust. */
const tenths = (rng: Rng, lo: number, hi: number): number => (Math.round(lo * 10) + int(rng, 0, Math.round((hi - lo) * 10))) / 10;

/** Adult vitals in ranges a real clinic would see. The diastolic is always at least 30 below the systolic. */
export function makeVitals(rng: Rng, profile: VitalsProfile = 'routine'): Vitals {
  const high = profile === 'elevated';
  const sys = high ? int(rng, 138, 168) : int(rng, 104, 134);
  const dia = high ? int(rng, Math.max(86, sys - 74), Math.min(100, sys - 38)) : int(rng, 62, Math.min(84, sys - 34));
  const febrile = profile === 'febrile';
  return {
    sys,
    dia,
    pulse: febrile ? int(rng, 88, 108) : int(rng, 58, 96),
    resp: febrile ? int(rng, 18, 22) : int(rng, 12, 20),
    tempF: febrile ? tenths(rng, 100.4, 102.8) : tenths(rng, 97.4, 99.2),
    spo2: febrile ? int(rng, 95, 99) : int(rng, 96, 100),
  };
}

/** "BP 128/84 mmHg, P 76 bpm, R 16, T 98.6 F (oral), SpO2 98% on room air." as the written drills show it. */
export const vitalsLine = (v: Vitals): string =>
  `BP ${v.sys}/${v.dia} mmHg, P ${v.pulse} bpm, R ${v.resp}, T ${v.tempF.toFixed(1)} F (oral), SpO2 ${v.spo2}% on room air.`;

/** An adult's height, weight and BMI. The weight is whole pounds and the BMI is worked out from it, so they always agree. */
export function makeBody(rng: Rng, sex: 'F' | 'M'): Body {
  const heightIn = sex === 'F' ? int(rng, 60, 69) : int(rng, 64, 76);
  const target = int(rng, 200, 320) / 10; // BMI 20.0 to 32.0
  const weightLb = Math.round((target * heightIn * heightIn) / 703);
  const bmi = Math.round(((703 * weightLb) / (heightIn * heightIn)) * 10) / 10;
  return { heightIn, weightLb, bmi };
}

/** "Ht 5 ft 6 in, Wt 154 lb, BMI 24.9." */
export const bodyLine = (b: Body): string =>
  `Ht ${Math.floor(b.heightIn / 12)} ft ${b.heightIn % 12} in, Wt ${b.weightLb} lb, BMI ${b.bmi.toFixed(1)}.`;
