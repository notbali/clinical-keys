import type { NewAttempt } from '../data/api';
import type { FormRunResult } from './grade';
import type { FormTask } from './types';

/** A form run as an attempt. The seed goes in `passage` so the same form can be rebuilt from it. */
export const formAttempt = (task: FormTask, r: FormRunResult): NewAttempt => ({
  kind: 'drill', track: task.track, drillId: task.drillId, passage: task.seed,
  wpm: r.wpm, accuracy: r.accuracy, errorsLeft: r.errorsLeft, seconds: r.seconds,
  completed: r.completed, clean: r.clean, revealed: false,
});
