export type FormationBand = 'GK' | 'DEF' | 'DM' | 'MID' | 'FWD';
export type FormationFamily = '3-band' | 'dm-4-band' | 'mid-4-band' | 'unknown';
export type FitQuality = 'exact' | 'tolerant' | 'static';

export interface Coords {
  x: number;
  y: number;
}

export interface FormationSlot {
  /** Slot id: 'GK' | 'CB1' | 'CB2' | 'CB3' | 'LB' | 'RB' | 'DM1' | 'DM2' | 'DM3'
   * | 'CM1' | 'CM2' | 'CM3' | 'LM' | 'RM' | 'AM' | 'AM1' | 'AM2' | 'LW' | 'RW'
   * | 'SS' | 'CF1' | 'CF2' | 'CF3' */
  id: string;
  /** Band per slot INSTANCE (same id may have different band across formations). */
  band: FormationBand;
  /** Final slot coordinates (same orientation as the static dictionary). */
  coords: Coords;
  /** Ordered, best first; matched case-insensitively. */
  preferredPositions: string[];
}

export interface LineupPlayer {
  playerId: number;
  /** Appearance position ONLY (drives fitting; subPosition never does). */
  position: string | null;
}

export interface FittedPlayer extends LineupPlayer {
  /** null in static mode. */
  slotId: string | null;
  /** null in static mode. */
  band: FormationBand | null;
  fitQuality: FitQuality;
  /** Slot coords when exact/tolerant; getPositionCoords result when static. */
  coords: Coords;
}

export interface FormationMappingStats {
  sidesFitted: number;
  exactPlayers: number; // rows
  tolerantPlayers: number;
  staticPlayers: number;
  unknownFormations: Record<string, number>; // normalized formation value -> count
}

export interface PositionMappingStats {
  exact: number;
  upgrade: number;
  groupFallback: number;
  subPositionFallback: number;
  default: number;
}

const FALLBACK_COORDS: Coords = { x: 50, y: 50 };

/** Null-prototype wrapper for lookup dictionaries keyed by (untrusted) input
 * strings. Plain-object bracket access resolves Object.prototype members
 * ('constructor', '__proto__', 'toString', ...), which would either throw or
 * return the Object constructor instead of a value. With a null prototype,
 * every unknown key yields undefined -> the locked fallback path. */
function asNullProto<T extends object>(obj: T): T {
  return Object.assign(Object.create(null), obj);
}

/** 13-entry static coordinate dictionary (locked; Goalkeeper y = 90). */
const POSITION_COORDS: Record<string, Coords> = asNullProto({
  goalkeeper: { x: 50, y: 90 },
  'centre-back': { x: 50, y: 72 },
  'left-back': { x: 10, y: 60 },
  'right-back': { x: 90, y: 60 },
  'defensive midfield': { x: 50, y: 58 },
  'central midfield': { x: 50, y: 45 },
  'attacking midfield': { x: 50, y: 32 },
  'left midfield': { x: 15, y: 42 },
  'right midfield': { x: 85, y: 42 },
  'left winger': { x: 15, y: 25 },
  'right winger': { x: 85, y: 25 },
  'centre-forward': { x: 50, y: 15 },
  'second striker': { x: 50, y: 25 },
});

/** Group fallback map (locked). Goalkeeper listed for completeness (resolves
 * as a precise value before reaching this map). */
const GROUP_COORDS: Record<string, Coords> = asNullProto({
  goalkeeper: { x: 50, y: 90 },
  defender: { x: 50, y: 72 },
  midfield: { x: 50, y: 45 },
  attack: { x: 50, y: 15 },
  sweeper: { x: 50, y: 72 },
});

/** Group values that trigger the subPosition upgrade rule (case-insensitive). */
const UPGRADE_GROUP_VALUES: ReadonlySet<string> = new Set([
  'attack',
  'midfield',
  'defender',
  'sweeper',
]);

type NonUnknownFamily = Exclude<FormationFamily, 'unknown'>;

interface FamilyBands {
  '3-band': FormationBand;
  'dm-4-band': FormationBand;
  'mid-4-band': FormationBand;
}

/** Position -> family band map (used for fitQuality 'exact' evaluation). */
const FAMILY_BAND: Record<string, FamilyBands> = asNullProto({
  goalkeeper: { '3-band': 'GK', 'dm-4-band': 'GK', 'mid-4-band': 'GK' },
  'centre-back': { '3-band': 'DEF', 'dm-4-band': 'DEF', 'mid-4-band': 'DEF' },
  'left-back': { '3-band': 'DEF', 'dm-4-band': 'DEF', 'mid-4-band': 'DEF' },
  'right-back': { '3-band': 'DEF', 'dm-4-band': 'DEF', 'mid-4-band': 'DEF' },
  defender: { '3-band': 'DEF', 'dm-4-band': 'DEF', 'mid-4-band': 'DEF' },
  sweeper: { '3-band': 'DEF', 'dm-4-band': 'DEF', 'mid-4-band': 'DEF' },
  'defensive midfield': { '3-band': 'MID', 'dm-4-band': 'DM', 'mid-4-band': 'MID' },
  'central midfield': { '3-band': 'MID', 'dm-4-band': 'MID', 'mid-4-band': 'MID' },
  'attacking midfield': { '3-band': 'MID', 'dm-4-band': 'MID', 'mid-4-band': 'MID' },
  'left midfield': { '3-band': 'MID', 'dm-4-band': 'MID', 'mid-4-band': 'MID' },
  'right midfield': { '3-band': 'MID', 'dm-4-band': 'MID', 'mid-4-band': 'MID' },
  midfield: { '3-band': 'MID', 'dm-4-band': 'MID', 'mid-4-band': 'MID' },
  'left winger': { '3-band': 'FWD', 'dm-4-band': 'MID', 'mid-4-band': 'FWD' },
  'right winger': { '3-band': 'FWD', 'dm-4-band': 'MID', 'mid-4-band': 'FWD' },
  'centre-forward': { '3-band': 'FWD', 'dm-4-band': 'FWD', 'mid-4-band': 'FWD' },
  'second striker': { '3-band': 'FWD', 'dm-4-band': 'FWD', 'mid-4-band': 'FWD' },
  attack: { '3-band': 'FWD', 'dm-4-band': 'FWD', 'mid-4-band': 'FWD' },
});

interface SlotDef {
  coords: Coords;
  preferred: string[];
}

const CB_PREF = ['Centre-Back', 'Sweeper', 'Defender', 'Left-Back', 'Right-Back'];
const DM_PREF = ['Defensive Midfield', 'Central Midfield', 'Midfield', 'Left Midfield', 'Right Midfield'];
const CM_PREF = ['Central Midfield', 'Defensive Midfield', 'Attacking Midfield', 'Midfield', 'Left Midfield', 'Right Midfield'];
const AM_PREF = ['Attacking Midfield', 'Second Striker', 'Central Midfield', 'Left Winger', 'Right Winger'];
const CF_PREF = ['Centre-Forward', 'Second Striker', 'Attacking Midfield', 'Left Winger', 'Right Winger', 'Attack'];

/** Slot dictionary: slot id -> coords + ranked per-slot preference orders. */
const SLOT_DICTIONARY: Record<string, SlotDef> = asNullProto({
  GK: { coords: { x: 50, y: 90 }, preferred: ['Goalkeeper'] },
  CB1: { coords: { x: 30, y: 72 }, preferred: CB_PREF },
  CB2: { coords: { x: 70, y: 72 }, preferred: CB_PREF },
  CB3: { coords: { x: 50, y: 72 }, preferred: CB_PREF },
  LB: { coords: { x: 10, y: 60 }, preferred: ['Left-Back', 'Centre-Back', 'Defender', 'Left Midfield', 'Left Winger'] },
  RB: { coords: { x: 90, y: 60 }, preferred: ['Right-Back', 'Centre-Back', 'Defender', 'Right Midfield', 'Right Winger'] },
  DM1: { coords: { x: 30, y: 58 }, preferred: DM_PREF },
  DM2: { coords: { x: 70, y: 58 }, preferred: DM_PREF },
  DM3: { coords: { x: 50, y: 58 }, preferred: DM_PREF },
  CM1: { coords: { x: 30, y: 45 }, preferred: CM_PREF },
  CM2: { coords: { x: 70, y: 45 }, preferred: CM_PREF },
  CM3: { coords: { x: 50, y: 45 }, preferred: CM_PREF },
  LM: { coords: { x: 15, y: 42 }, preferred: ['Left Midfield', 'Left Winger', 'Central Midfield', 'Attacking Midfield', 'Midfield'] },
  RM: { coords: { x: 85, y: 42 }, preferred: ['Right Midfield', 'Right Winger', 'Central Midfield', 'Attacking Midfield', 'Midfield'] },
  AM: { coords: { x: 50, y: 32 }, preferred: AM_PREF },
  AM1: { coords: { x: 30, y: 32 }, preferred: AM_PREF },
  AM2: { coords: { x: 70, y: 32 }, preferred: AM_PREF },
  LW: { coords: { x: 15, y: 25 }, preferred: ['Left Winger', 'Left Midfield', 'Attacking Midfield', 'Second Striker', 'Centre-Forward', 'Attack'] },
  RW: { coords: { x: 85, y: 25 }, preferred: ['Right Winger', 'Right Midfield', 'Attacking Midfield', 'Second Striker', 'Centre-Forward', 'Attack'] },
  SS: { coords: { x: 50, y: 28 }, preferred: ['Second Striker', 'Centre-Forward', 'Attacking Midfield', 'Left Winger', 'Right Winger'] },
  CF1: { coords: { x: 30, y: 15 }, preferred: CF_PREF },
  CF2: { coords: { x: 70, y: 15 }, preferred: CF_PREF },
  CF3: { coords: { x: 50, y: 15 }, preferred: CF_PREF },
});

// Freeze the shared preference arrays so callers holding slot references
// cannot mutate the dictionary (read-only lookup contract).
for (const def of Object.values(SLOT_DICTIONARY)) {
  Object.freeze(def.preferred);
}

interface LayoutDef {
  family: NonUnknownFamily;
  slots: string[]; // exactly 11 slot ids, GK first
}

/** Hand-mapped 11-slot layouts — all 29 seed formations (locked table). */
const FORMATION_LAYOUTS: Record<string, LayoutDef> = asNullProto({
  // 3-band family (DEF/MID/FWD; DM folds into MID; wingers -> FWD)
  '4-4-2': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'CF1', 'CF2'] },
  '4-4-2 double 6': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM1', 'DM2', 'LM', 'RM', 'CF1', 'CF2'] },
  '4-4-2 diamond': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM3', 'LM', 'RM', 'AM', 'CF1', 'CF2'] },
  '4-3-3': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'LW', 'RW', 'CF3'] },
  '4-3-3 attacking': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'LW', 'RW', 'CF3'] },
  '4-3-3 defending': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'LW', 'RW', 'CF3'] },
  '4-5-1': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM3', 'LM', 'CM1', 'CM2', 'RM', 'CF3'] },
  '4-5-1 flat': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM3', 'LM', 'CM1', 'CM2', 'RM', 'CF3'] },
  '3-5-2': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'CM1', 'CM2', 'LM', 'RM', 'CF1', 'CF2'] },
  '3-5-2 flat': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'CM1', 'CM2', 'LM', 'RM', 'CF1', 'CF2'] },
  '3-5-2 attacking': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'CM1', 'CM2', 'LM', 'RM', 'CF1', 'CF2'] },
  '5-3-2': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'CF1', 'CF2'] },
  '5-4-1': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LB', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'CF3'] },
  '5-4-1 diamond': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LB', 'RB', 'DM3', 'LM', 'RM', 'AM', 'CF3'] },
  '5-2-3': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LB', 'RB', 'DM1', 'DM2', 'LW', 'RW', 'CF3'] },
  '4-2-4': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM1', 'DM2', 'LW', 'RW', 'CF1', 'CF2'] },
  '3-6-1': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'CM1', 'CM2', 'LM', 'RM', 'AM', 'CF3'] },
  '3-4-3': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'RM', 'LW', 'RW', 'CF3'] },
  '3-4-3 diamond': { family: '3-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'LM', 'RM', 'AM', 'LW', 'RW', 'CF3'] },
  // DM-type 4-band (DEF/DM/MID/FWD; wingers/AM -> MID)
  '4-2-3-1': { family: 'dm-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM1', 'DM2', 'LW', 'AM', 'RW', 'CF3'] },
  '4-1-4-1': { family: 'dm-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM3', 'LM', 'CM1', 'CM2', 'RM', 'CF3'] },
  '4-1-3-2': { family: 'dm-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'DM3', 'LM', 'AM', 'RM', 'CF1', 'CF2'] },
  '3-1-4-2': { family: 'dm-4-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM3', 'LM', 'CM1', 'CM2', 'RM', 'CF1', 'CF2'] },
  '3-3-3-1': { family: 'dm-4-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'DM1', 'DM2', 'DM3', 'CM1', 'CM2', 'CM3', 'CF3'] },
  // MID-type 4-band (DEF/MID+AM/FWD)
  '3-4-2-1': { family: 'mid-4-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'RM', 'AM1', 'AM2', 'CF3'] },
  '4-3-1-2': { family: 'mid-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'AM', 'CF1', 'CF2'] },
  '4-4-1-1': { family: 'mid-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'SS', 'CF3'] },
  '3-4-1-2': { family: 'mid-4-band', slots: ['GK', 'CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'RM', 'AM', 'CF1', 'CF2'] },
  '4-3-2-1': { family: 'mid-4-band', slots: ['GK', 'CB1', 'CB2', 'LB', 'RB', 'CM1', 'CM2', 'CM3', 'AM1', 'AM2', 'CF3'] },
});

/** Band of a slot id for the given formation family. */
function bandOf(slotId: string, family: NonUnknownFamily): FormationBand {
  switch (slotId) {
    case 'GK':
      return 'GK';
    case 'CB1':
    case 'CB2':
    case 'CB3':
    case 'LB':
    case 'RB':
      return 'DEF';
    case 'DM1':
    case 'DM2':
    case 'DM3':
      return family === 'dm-4-band' ? 'DM' : 'MID';
    case 'CM1':
    case 'CM2':
    case 'CM3':
    case 'LM':
    case 'RM':
    case 'AM':
    case 'AM1':
    case 'AM2':
      return 'MID';
    case 'LW':
    case 'RW':
      return family === 'dm-4-band' ? 'MID' : 'FWD';
    case 'SS':
      return 'FWD';
    case 'CF1':
    case 'CF2':
    case 'CF3':
      return 'FWD';
    default:
      return 'MID'; // unreachable: every layout slot id comes from SLOT_DICTIONARY
  }
}

function buildSlot(id: string, family: NonUnknownFamily): FormationSlot {
  const def = SLOT_DICTIONARY[id];
  return {
    id,
    band: bandOf(id, family),
    coords: def.coords,
    preferredPositions: def.preferred,
  };
}

function normalizePosition(position: string | null | undefined): string {
  if (position === null || position === undefined) return '';
  return position.trim().toLowerCase();
}

function normalizeFormation(formation: string | null | undefined): string {
  if (formation === null || formation === undefined) return '';
  let s = String(formation).trim().toLowerCase();
  // Raw-data quirk: some values carry a leading "Starting Line-up:" prefix.
  s = s.replace(/^starting\s+line[- ]?up\s*:\s*/, '');
  return s.trim();
}

function defSlots(count: number): string[] | null {
  switch (count) {
    case 5:
      return ['CB1', 'CB2', 'CB3', 'LB', 'RB'];
    case 4:
      return ['CB1', 'CB2', 'LB', 'RB'];
    case 3:
      return ['CB1', 'CB2', 'CB3'];
    case 2:
      return ['CB1', 'CB2'];
    default:
      return null;
  }
}

function midSlots3(count: number): string[] | null {
  switch (count) {
    case 6:
      return ['DM3', 'CM1', 'CM2', 'LM', 'RM', 'AM'];
    case 5:
      return ['DM3', 'CM1', 'CM2', 'LM', 'RM'];
    case 4:
      return ['LM', 'CM1', 'CM2', 'RM'];
    case 3:
      return ['CM1', 'CM2', 'CM3'];
    case 2:
      return ['DM1', 'DM2'];
    default:
      return null;
  }
}

function midSlots4(count: number): string[] | null {
  switch (count) {
    case 4:
      return ['LM', 'CM1', 'CM2', 'RM'];
    case 3:
      return ['LW', 'AM', 'RW'];
    case 2:
      return ['AM1', 'AM2'];
    case 1:
      return ['AM'];
    case 0:
      return [];
    default:
      return null;
  }
}

function fwdSlots(count: number): string[] | null {
  switch (count) {
    case 5:
      return ['LW', 'RW', 'CF1', 'CF2', 'SS'];
    case 4:
      return ['LW', 'RW', 'CF1', 'CF2'];
    case 3:
      return ['LW', 'RW', 'CF1'];
    case 2:
      return ['CF1', 'CF2'];
    case 1:
      return ['CF3'];
    case 0:
      return [];
    default:
      return null;
  }
}

/** Generic band parser for unlisted formations. Returns null when the value
 * cannot be parsed into a valid 11-slot layout (including >=5 bands,
 * non-numeric residue, or band counts outside the defined ranges). */
function parseGenericFormation(norm: string): LayoutDef | null {
  const parts = norm.split('-');
  if (parts.length < 2 || parts.length > 4) return null;
  const counts = parts.map((part) => Number(part));
  if (counts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 2 || parts.length === 3) {
    // 3 bands a-b-c (2 bands -> treat as 3-band with c = 0)
    const [a, b] = counts;
    const c = parts.length === 3 ? counts[2] : 0;
    if (a + b + c !== 10) return null;
    const def = defSlots(a);
    if (def === null) return null;
    const mid = midSlots3(b);
    if (mid === null) return null;
    const fwd = fwdSlots(c);
    if (fwd === null) return null;
    return { family: '3-band', slots: ['GK', ...def, ...mid, ...fwd] };
  }

  // 4 bands a-b-c-d -> family heuristic
  const [a, b, c, d] = counts;
  if (a + b + c + d !== 10) return null;
  const def = defSlots(a);
  if (def === null) return null;
  const fwd = fwdSlots(d);
  if (fwd === null) return null;
  if (b <= 2) {
    // dm-4-band (DEF x a, DM x b, MID x c, FWD x d)
    const dm = b === 2 ? ['DM1', 'DM2'] : b === 1 ? ['DM3'] : b === 0 ? [] : null;
    if (dm === null) return null;
    const mid = midSlots4(c);
    if (mid === null) return null;
    return { family: 'dm-4-band', slots: ['GK', ...def, ...dm, ...mid, ...fwd] };
  }
  // b >= 3 -> mid-4-band (DEF x a, MID x b, AM x c, FWD x d)
  const mid = b === 4 ? ['LM', 'CM1', 'CM2', 'RM'] : b === 3 ? ['CM1', 'CM2', 'CM3'] : null;
  if (mid === null) return null;
  const am = c === 2 ? ['AM1', 'AM2'] : c === 1 ? ['AM'] : c === 0 ? [] : null;
  if (am === null) return null;
  return { family: 'mid-4-band', slots: ['GK', ...def, ...mid, ...am, ...fwd] };
}

function resolveLayout(norm: string): LayoutDef | null {
  if (norm === '') return null;
  const table = FORMATION_LAYOUTS[norm];
  if (table !== undefined) return table;
  return parseGenericFormation(norm);
}

// ---------------------------------------------------------------------------
// Static mapping counters + deduplicated warnings
// ---------------------------------------------------------------------------

const staticStats: PositionMappingStats = {
  exact: 0,
  upgrade: 0,
  groupFallback: 0,
  subPositionFallback: 0,
  default: 0,
};

const formationStats: FormationMappingStats = {
  sidesFitted: 0,
  exactPlayers: 0,
  tolerantPlayers: 0,
  staticPlayers: 0,
  // Null prototype: formation values are untrusted strings; a plain object
  // would let a key like '__proto__' corrupt the counter.
  unknownFormations: Object.create(null) as Record<string, number>,
};

const warnedUnmappedPositions = new Set<string>();
const warnedUnknownFormations = new Set<string>();
const warnedStaticPositions = new Set<string>();

function warnUnmappedPosition(position: string): void {
  if (!warnedUnmappedPositions.has(position)) {
    warnedUnmappedPositions.add(position);
    console.warn(`[positionMapping] unmapped position "${position}" -> default {50,50}`);
  }
}

function warnUnknownFormation(formation: string): void {
  if (!warnedUnknownFormations.has(formation)) {
    warnedUnknownFormations.add(formation);
    console.warn(`[positionMapping] unknown formation "${formation}" -> static mode`);
  }
}

function warnStaticAssigned(position: string): void {
  if (!warnedStaticPositions.has(position)) {
    warnedStaticPositions.add(position);
    console.warn(`[positionMapping] position "${position}" static-assigned during fitting`);
  }
}

/**
 * Static per-appearance mapping (dev-3 API contract; also the internal
 * fallback for unmatched players and static mode). Never throws.
 *
 * Locked selection chain (6 steps):
 *   1. normalize (trim + case-insensitive)
 *   2. exact match in the 13-value dictionary
 *   3. upgrade rule: group position + precise subPosition -> subPosition coords
 *   4. group fallback
 *   5. subPosition fallback (position unresolved, subPosition provided)
 *   6. final default {50,50}
 */
export function getPositionCoords(position: string, subPosition?: string): Coords {
  const p = normalizePosition(position);

  // Step 2: exact match.
  const precise = POSITION_COORDS[p];
  if (precise !== undefined) {
    staticStats.exact += 1;
    return precise;
  }

  // Steps 3-4: group position (upgrade rule, then group fallback).
  if (UPGRADE_GROUP_VALUES.has(p)) {
    const sp = normalizePosition(subPosition);
    const spPrecise = sp === '' ? undefined : POSITION_COORDS[sp];
    if (spPrecise !== undefined) {
      staticStats.upgrade += 1;
      return spPrecise;
    }
    staticStats.groupFallback += 1;
    return GROUP_COORDS[p] ?? FALLBACK_COORDS;
  }

  // Step 5: subPosition fallback (position unresolved/empty).
  const sp = normalizePosition(subPosition);
  if (sp !== '') {
    const spPrecise = POSITION_COORDS[sp];
    if (spPrecise !== undefined) {
      staticStats.subPositionFallback += 1;
      return spPrecise;
    }
    const spGroup = GROUP_COORDS[sp];
    if (spGroup !== undefined) {
      staticStats.subPositionFallback += 1;
      return spGroup;
    }
  }

  // Step 6: final default.
  staticStats.default += 1;
  warnUnmappedPosition(p);
  return FALLBACK_COORDS;
}

/** Static-mapping counters. */
export function getPositionMappingStats(): PositionMappingStats {
  return { ...staticStats };
}

// ---------------------------------------------------------------------------
// Formation-aware slot fitting
// ---------------------------------------------------------------------------

/** Formation family for a formation value ('unknown' when unparseable). */
export function getFormationFamily(formation: string | null | undefined): FormationFamily {
  const layout = resolveLayout(normalizeFormation(formation));
  return layout === null ? 'unknown' : layout.family;
}

/** 11 slot instances for recognized formations, [] otherwise (static mode). */
export function getFormationSlots(formation: string | null | undefined): FormationSlot[] {
  const layout = resolveLayout(normalizeFormation(formation));
  if (layout === null) return [];
  return layout.slots.map((id) => buildSlot(id, layout.family));
}

interface SlotAssignment {
  slotIndex: number;
}

function rankOf(position: string | null, slot: FormationSlot): number {
  const p = normalizePosition(position);
  for (let i = 0; i < slot.preferredPositions.length; i += 1) {
    if (normalizePosition(slot.preferredPositions[i]) === p) return i;
  }
  return Number.POSITIVE_INFINITY;
}

/** fitQuality classification: 'exact' (family band match), 'tolerant'
 * (in slot preferences but band differs), 'static' otherwise. */
function classify(
  position: string | null,
  slot: FormationSlot,
  family: NonUnknownFamily,
): FitQuality {
  const p = normalizePosition(position);
  const posBand = FAMILY_BAND[p];
  if (posBand !== undefined && posBand[family] === slot.band) return 'exact';
  if (rankOf(position, slot) !== Number.POSITIVE_INFINITY) return 'tolerant';
  return 'static';
}

function bestRemaining(
  players: LineupPlayer[],
  assigned: (SlotAssignment | null)[],
  slot: FormationSlot,
): number {
  let best = -1;
  let bestRank = Number.POSITIVE_INFINITY;
  for (let i = 0; i < players.length; i += 1) {
    if (assigned[i] !== null) continue;
    const rank = rankOf(players[i].position, slot);
    // First free player is always a candidate (players absent from the
    // preference list rank last, ties by input order); later players only
    // replace it on a strictly better rank.
    if (best === -1 || rank < bestRank) {
      bestRank = rank;
      best = i;
    }
  }
  return best;
}

/** Pass 3 — repair: swap slot assignments while a swap strictly reduces the
 * number of static-assigned players (bounded: <= lineup-length iterations). */
function repair(
  players: LineupPlayer[],
  slots: FormationSlot[],
  family: NonUnknownFamily,
  assigned: (SlotAssignment | null)[],
): void {
  // Invariant: the Pass-1 goalkeeper assignment is never displaced here.
  // Repair only swaps assignments that classify 'static' in their current
  // slot, and a Goalkeeper in the GK slot always classifies 'exact' (GK band
  // in every family), so it is never a swap source. (A lineup with no
  // Goalkeeper puts its first entry in the GK slot as 'static' and may swap.)
  const n = players.length;
  for (let iteration = 0; iteration < n; iteration += 1) {
    let improved = false;
    for (let a = 0; a < n && !improved; a += 1) {
      const assignmentA = assigned[a];
      if (assignmentA === null) continue;
      if (classify(players[a].position, slots[assignmentA.slotIndex], family) !== 'static') continue;
      for (let b = 0; b < n && !improved; b += 1) {
        if (a === b) continue;
        const assignmentB = assigned[b];
        if (assignmentB === null) continue;
        const before =
          1 + (classify(players[b].position, slots[assignmentB.slotIndex], family) === 'static' ? 1 : 0);
        const after =
          (classify(players[a].position, slots[assignmentB.slotIndex], family) === 'static' ? 1 : 0) +
          (classify(players[b].position, slots[assignmentA.slotIndex], family) === 'static' ? 1 : 0);
        if (after < before) {
          const slotA = assignmentA.slotIndex;
          assigned[a] = { slotIndex: assignmentB.slotIndex };
          assigned[b] = { slotIndex: slotA };
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
}

/** Passes 1-3: GK first, greedy deficit-filling in band order, repair. */
function fitPlayers(
  players: LineupPlayer[],
  slots: FormationSlot[],
  family: NonUnknownFamily,
): (SlotAssignment | null)[] {
  const n = players.length;
  const assigned: (SlotAssignment | null)[] = players.map(() => null);
  const slotTaken: boolean[] = slots.map(() => false);

  // Pass 1 — GK first: exactly one Goalkeeper -> slot GK; zero -> first entry
  // (input order) to GK (becomes 'static'); more than one -> first to GK, rest
  // flow through Pass 2.
  const gkSlotIndex = slots.findIndex((slot) => slot.id === 'GK');
  if (gkSlotIndex >= 0 && n > 0) {
    let firstGk = -1;
    for (let i = 0; i < n; i += 1) {
      if (normalizePosition(players[i].position) === 'goalkeeper') {
        firstGk = i;
        break;
      }
    }
    const gkPlayer = firstGk >= 0 ? firstGk : 0;
    assigned[gkPlayer] = { slotIndex: gkSlotIndex };
    slotTaken[gkSlotIndex] = true;
  }

  // Pass 2 — greedy deficit-filling in band order DEF -> DM -> MID -> FWD;
  // each slot picks the best remaining player by its preferredPositions rank
  // (ties by input order; assigned players never re-picked).
  const bandOrder: FormationBand[] = ['DEF', 'DM', 'MID', 'FWD'];
  let playersExhausted = false;
  for (const band of bandOrder) {
    for (let s = 0; s < slots.length && !playersExhausted; s += 1) {
      if (slotTaken[s] || slots[s].band !== band) continue;
      const pick = bestRemaining(players, assigned, slots[s]);
      if (pick < 0) {
        playersExhausted = true;
        break;
      }
      assigned[pick] = { slotIndex: s };
      slotTaken[s] = true;
    }
  }

  // Pass 3 — repair.
  repair(players, slots, family, assigned);

  return assigned;
}

/**
 * Fit a starting XI (0-11 entries) into a formation's 11-slot layout.
 * Missing/null/unknown/unparseable formation -> static coords directly,
 * never crashes. Output in input order; deterministic.
 */
export function fitStartingXI(lineup: LineupPlayer[], formation?: string | null): FittedPlayer[] {
  const players = Array.isArray(lineup) ? lineup : [];
  const norm = normalizeFormation(formation);
  const layout = resolveLayout(norm);

  if (layout === null) {
    // Pass 0 — static mode (missing/null/unknown/unparseable formation).
    if (norm !== '') {
      formationStats.unknownFormations[norm] = (formationStats.unknownFormations[norm] ?? 0) + 1;
      warnUnknownFormation(norm);
    }
    return players.map((player) => ({
      playerId: player.playerId,
      position: player.position,
      slotId: null,
      band: null,
      fitQuality: 'static' as const,
      coords: getPositionCoords(player.position ?? ''),
    }));
  }

  formationStats.sidesFitted += 1;
  const family = layout.family;
  const slots = layout.slots.map((id) => buildSlot(id, family));
  const assignments = fitPlayers(players, slots, family);

  const fitted: FittedPlayer[] = [];
  for (let i = 0; i < players.length; i += 1) {
    const assignment = assignments[i];
    const player = players[i];
    if (assignment === null) {
      // Unassigned (lineup longer than slots): static, like Pass 0.
      fitted.push({
        playerId: player.playerId,
        position: player.position,
        slotId: null,
        band: null,
        fitQuality: 'static',
        coords: getPositionCoords(player.position ?? ''),
      });
      continue;
    }
    const slot = slots[assignment.slotIndex];
    const quality = classify(player.position, slot, family);
    if (quality === 'static') warnStaticAssigned(player.position ?? '');
    fitted.push({
      playerId: player.playerId,
      position: player.position,
      slotId: slot.id,
      band: slot.band,
      fitQuality: quality,
      coords: quality === 'static' ? getPositionCoords(player.position ?? '') : slot.coords,
    });
  }

  // Post-processing: narrow paired-slot spacing when only 2 players occupy a
  // band. Paired slots use x=30/x=70 which looks right with 3 players (center
  // slot fills the gap) but is too wide for just 2. Pull them to x=40/x=60.
  const bandGroups = new Map<number, FittedPlayer[]>();
  for (const f of fitted) {
    if (f.fitQuality === 'static') continue;
    const y = f.coords.y;
    if (!bandGroups.has(y)) bandGroups.set(y, []);
    bandGroups.get(y)!.push(f);
  }
  for (const group of bandGroups.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    if (a.coords.x === 30 && b.coords.x === 70) {
      a.coords = { x: 40, y: a.coords.y };
      b.coords = { x: 60, y: b.coords.y };
    } else if (a.coords.x === 70 && b.coords.x === 30) {
      a.coords = { x: 60, y: a.coords.y };
      b.coords = { x: 40, y: b.coords.y };
    }
  }

  for (const f of fitted) {
    if (f.fitQuality === 'exact') formationStats.exactPlayers += 1;
    else if (f.fitQuality === 'tolerant') formationStats.tolerantPlayers += 1;
    else formationStats.staticPlayers += 1;
  }

  return fitted;
}

/** Formation-fitting counters. */
export function getFormationMappingStats(): FormationMappingStats {
  return {
    ...formationStats,
    unknownFormations: { ...formationStats.unknownFormations },
  };
}
