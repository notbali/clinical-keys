/** Names the chart "window" a passage would live in, so typing feels like entering a real record. */
const WINDOW: Record<string, string> = {
  'ma-terms': 'Terminology',
  'ma-vitals': 'Vitals Flowsheet Entry',
  'ma-soap': 'Progress Note (SOAP)',
  'ma-phone': 'Telephone Encounter',
  'ma-edu': 'Patient Instructions (After Visit Summary)',
  'rx-sig': 'Order Entry: Prescription Directions',
  'rx-lasa': 'Drug Name Entry',
  'rx-labels': 'Prescription Label Entry',
  'rx-safety': 'Label Text and Safety Warnings',
  'rx-workflow': 'Pharmacy Note',
};

export const windowTitle = (kind: 'sprint' | 'drill', drillId?: string): string =>
  kind === 'sprint' ? 'Typing Sprint' : (drillId && WINDOW[drillId]) || 'Note';

/** "Whitaker, Hannah" -> "WHITAKER, Hannah", the way many chart banners show it. */
export const bannerName = (name: string): string => {
  const [last, first] = name.split(', ');
  return first ? `${last.toUpperCase()}, ${first}` : name.toUpperCase();
};
