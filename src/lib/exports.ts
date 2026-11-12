import { toCsv } from './csv';
import type { StudentMetrics } from './metrics';

/** Typing grades as a CSV the instructor can line up with the Blackboard gradebook upload. */
export function gradesCsv(rows: StudentMetrics[]): string {
  const header = [
    'Last Name', 'First Name', 'Username', 'Blackboard Username', 'Track', 'Program Day', 'Typing Grade',
    'Overridden', 'Accuracy (last 3 finished runs)', 'Best WPM', 'Activities Done', 'Activities Assigned', 'Last Active',
  ];
  const body = rows.map((m) => [
    m.student.lastName, m.student.firstName, m.student.username, m.student.externalId ?? '',
    m.student.track === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech', Math.min(Math.max(m.day, 1), 10),
    m.grade.total ?? '', m.grade.override ? 'Yes' : 'No', m.grade.accuracyAvg ?? '', m.grade.bestWpm ?? '',
    m.grade.completion.done, m.grade.completion.total, m.lastActive ?? '',
  ]);
  return toCsv([header, ...body]);
}

/** Starts a browser download of text content. */
export function download(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
