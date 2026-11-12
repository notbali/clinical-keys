import { maDrills } from './ma';
import { rxDrills } from './rx';
import type { Drill, Track } from './types';

export const DRILLS: Drill[] = [...maDrills, ...rxDrills];
export const getDrill = (id: string): Drill | undefined => DRILLS.find((d) => d.id === id);
export const drillsForTrack = (track: Track): Drill[] => DRILLS.filter((d) => d.track === track);
export { PROGRAM } from './program';
export { SPRINT } from './sprint';
export { GLOSSARY } from './glossary';
export type * from './types';
