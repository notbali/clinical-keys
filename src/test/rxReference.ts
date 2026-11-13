/**
 * An independent reference for the generated-content tests. It is written separately from the generator's own
 * drug catalog on purpose: a wrong strength or dose in one of them is caught by the other.
 * Strengths are as marketed in the US. Daily maximums are the usual labeled adult maximums, in the strength's own unit.
 * Add a row here, and then to the catalog, whenever you add a drug.
 */
export type Form = 'tablet' | 'capsule';

/** Lowercase printed name (without Tall Man capitals) -> strengths that exist, by dosage form. */
export const PRODUCTS: Record<string, Partial<Record<Form, number[]>>> = {
  lisinopril: { tablet: [2.5, 5, 10, 20, 30, 40] },
  amlodipine: { tablet: [2.5, 5, 10] },
  atorvastatin: { tablet: [10, 20, 40, 80] },
  simvastatin: { tablet: [5, 10, 20, 40, 80] },
  metformin: { tablet: [500, 850, 1000] },
  levothyroxine: { tablet: [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200, 300] },
  losartan: { tablet: [25, 50, 100] },
  'metoprolol tartrate': { tablet: [25, 37.5, 50, 75, 100] },
  'metoprolol succinate er': { tablet: [25, 50, 100, 200] },
  sertraline: { tablet: [25, 50, 100] },
  escitalopram: { tablet: [5, 10, 20] },
  omeprazole: { capsule: [10, 20, 40] },
  hydrochlorothiazide: { tablet: [12.5, 25, 50] },
  montelukast: { tablet: [10] },
  glipizide: { tablet: [5, 10] },
  hydralazine: { tablet: [10, 25, 50, 100] },
  hydroxyzine: { tablet: [10, 25, 50] },
  trazodone: { tablet: [50, 100, 150, 300] },
  'bupropion xl': { tablet: [150, 300] },
  buspirone: { tablet: [5, 7.5, 10, 15, 30] },
  'nifedipine er': { tablet: [30, 60, 90] },
  prednisone: { tablet: [1, 2.5, 5, 10, 20, 50] },
  amoxicillin: { capsule: [250, 500], tablet: [500, 875] },
  cephalexin: { capsule: [250, 500, 750] },
  ciprofloxacin: { tablet: [250, 500, 750] },
  doxycycline: { capsule: [50, 75, 100, 150], tablet: [20, 75, 100, 150] },
  'sulfamethoxazole-trimethoprim ds': { tablet: [800] },
  ibuprofen: { tablet: [400, 600, 800] },
  naproxen: { tablet: [250, 375, 500] },
  meloxicam: { tablet: [7.5, 15] },
  cyclobenzaprine: { tablet: [5, 7.5, 10] },
  ondansetron: { tablet: [4, 8] },
  benzonatate: { capsule: [100, 150, 200] },
};

/** Usual adult maximum per day, in the strength's own unit (levothyroxine is in mcg, everything else in mg). */
export const MAX_DAILY: Record<string, number> = {
  lisinopril: 80, amlodipine: 10, atorvastatin: 80, simvastatin: 40, metformin: 2550, levothyroxine: 300, losartan: 100,
  'metoprolol tartrate': 400, 'metoprolol succinate er': 400, sertraline: 200, escitalopram: 20, omeprazole: 40,
  hydrochlorothiazide: 50, montelukast: 10, glipizide: 40, hydralazine: 300, hydroxyzine: 400, trazodone: 400,
  'bupropion xl': 450, buspirone: 60, 'nifedipine er': 120, prednisone: 60, amoxicillin: 3000, cephalexin: 4000,
  ciprofloxacin: 1500, doxycycline: 200, 'sulfamethoxazole-trimethoprim ds': 3200, ibuprofen: 3200, naproxen: 1500,
  meloxicam: 15, cyclobenzaprine: 30, ondansetron: 24, benzonatate: 600,
};

/** Words that must never appear for a patient with each allergy (matched on the allergy text). */
export const ALLERGY_DRUGS: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin'],
  sulfa: ['sulfamethoxazole', 'trimethoprim', 'bactrim', 'sulfa'],
  codeine: ['codeine', 'tramadol', 'hydrocodone', 'morphine'],
  aspirin: ['aspirin', 'ibuprofen', 'naproxen', 'meloxicam', 'ketorolac'],
  nsaid: ['aspirin', 'ibuprofen', 'naproxen', 'meloxicam', 'ketorolac'],
};

/** Every auxiliary label wording a generated label may carry. Taken from the pharmacy drills' standard wording. */
export const AUX_WORDING = new Set([
  'May cause drowsiness. Alcohol may intensify this effect.',
  'Take with food or milk.',
  'Do not chew or crush. Swallow whole.',
  'Take with a full glass of water.',
  'Avoid prolonged exposure to sunlight.',
  'Finish all of this medication unless otherwise directed by prescriber.',
  'Do not take dairy products, antacids, or iron preparations within one hour of this medication.',
  'Do not take with grapefruit juice.',
  'Shake well before each use.',
  'Refrigerate. Do not freeze.',
]);
