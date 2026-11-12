import type { Patient } from '../content/types';
import { bannerName } from '../lib/ehrLabels';

/** The strip at the top of a chart: who the patient is, and the allergies you must not miss. */
export function PatientBanner({ patient, task }: { patient?: Patient; task: string }) {
  if (!patient) {
    return (
      <div className="pt-banner pt-banner-none" role="region" aria-label="Training context">
        <span className="pt-name">Training exercise</span>
        <span className="pt-item"><span>Task</span><b>{task}</b></span>
        <span className="pt-item"><span>Patient</span><b>None. This exercise is not tied to a patient.</b></span>
      </div>
    );
  }
  const nkda = patient.allergies === 'NKDA';
  return (
    <div className="pt-banner" role="region" aria-label="Patient banner">
      <span className="pt-name" translate="no">{bannerName(patient.name)}</span>
      <span className="pt-item"><span>Sex / Age</span><b>{patient.sex} · {patient.age}</b></span>
      <span className="pt-item"><span>DOB</span><b className="num">{patient.dob}</b></span>
      <span className="pt-item"><span>MRN</span><b className="num">{patient.mrn}</b></span>
      <span className="pt-item"><span>Provider</span><b>{patient.provider ?? '—'}</b></span>
      <span className={`pt-allergy ${nkda ? 'none' : 'has'}`}><span>Allergies</span><b>{nkda ? 'No known drug allergies' : patient.allergies}</b></span>
    </div>
  );
}
