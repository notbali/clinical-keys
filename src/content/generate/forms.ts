import type { ISODate } from '../../lib/dates';
import type { FormDrillId, FormTask } from '../../forms/types';
import type { Track } from '../types';
import { makeMaForm } from './formsMa';
import { makeRxForm } from './formsRx';
import { hashSeed, mulberry32 } from './rng';

/** The drill id each track's chart-entry form is saved under. */
export const FORM_DRILL_IDS: Record<Track, FormDrillId> = { ma: 'ma-form', rx: 'rx-form' };

/** The form for a track and a seed. The drill id is folded into the seed so the two forms never share a sequence. */
export function makeFormTask(track: Track, seed: number, today: ISODate): FormTask {
  const drillId = FORM_DRILL_IDS[track];
  const rng = mulberry32(hashSeed(drillId, seed));
  const body = track === 'ma' ? makeMaForm(rng, today) : makeRxForm(rng, today);
  return { drillId, track, seed, ...body };
}
