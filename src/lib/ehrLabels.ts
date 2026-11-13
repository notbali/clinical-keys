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
  'ma-terms-2': 'Terminology',
  'ma-complaints': 'Triage: Chief Complaint',
  'ma-abbrev': 'History and Exam Entry',
  'ma-procedures': 'Procedure and Immunization Record',
  'ma-referrals': 'Referrals and Insurance',
  'rx-terms': 'Terminology',
  'rx-sig-2': 'Order Entry: Prescription Directions',
  'rx-lasa-2': 'Drug Name Entry',
  'rx-daysupply': 'Prescription Label Entry',
  'rx-calls': 'Pharmacy Note',
  'ma-hunt': 'Chart Review: Proofread',
  'rx-hunt': 'Pharmacist Check: Proofread',
  'ma-gen-vitals': 'Vitals Flowsheet Entry',
  'ma-gen-soap': 'Progress Note (SOAP)',
  'ma-gen-phone': 'Telephone Encounter',
  'rx-gen-labels': 'Prescription Label Entry',
  'rx-gen-sig': 'Order Entry: Prescription Directions',
  'rx-gen-lasa': 'Drug Name Entry',
  'ma-gen-chart': 'Triage Intake Entry',
  'ma-gen-hunt': 'Chart Review: Proofread',
  'rx-gen-hunt': 'Pharmacist Check: Proofread',
  'ma-test': 'Typing Test',
  'rx-test': 'Typing Test',
};

export const windowTitle = (kind: 'sprint' | 'drill', drillId?: string): string =>
  kind === 'sprint' ? 'Typing Sprint' : (drillId && WINDOW[drillId]) || 'Note';

/** "Whitaker, Hannah" -> "WHITAKER, Hannah", the way many chart banners show it. */
export const bannerName = (name: string): string => {
  const [last, first] = name.split(', ');
  return first ? `${last.toUpperCase()}, ${first}` : name.toUpperCase();
};
