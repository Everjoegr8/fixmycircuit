export type Category = 'faults' | 'readings' | 'schematics' | 'boardview' | 'photos';

export const CATEGORIES: Category[] = ['faults', 'readings', 'schematics', 'boardview', 'photos'];

export type Nav = { kind: 'home' } | { kind: 'unsorted' } | { kind: 'model'; modelId: number; category: Category };

export interface Doc {
  key: string;
  type: 'pdf' | 'board' | 'photo';
  id: string | number;
  title: string;
  modelId: number | null;
}

/** What the technician is looking at right now (selected part / net), shared across panes. */
export interface Focus {
  part?: string;
  pin?: string;
  net?: string;
}

export function categoryLabel(c: Category) {
  return { faults: 'Fault Solutions', readings: 'Diode Readings', schematics: 'Schematics/PDF', boardview: 'BoardView', photos: 'Board Photos' }[c];
}
