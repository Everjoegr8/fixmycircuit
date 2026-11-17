export type Category = 'faults' | 'readings' | 'schematics' | 'boardview' | 'photos';

export const CATEGORIES: Category[] = ['faults', 'readings', 'schematics', 'boardview', 'photos'];

export type ToolKind = 'ai' | 'knowledge' | 'calculators' | 'ics' | 'microscope' | 'mirror';
export type Nav = { kind: 'home' } | { kind: 'unsorted' } | { kind: 'model'; modelId: number; category: Category } | { kind: 'tool'; tool: ToolKind };

export const TOOLS: { id: ToolKind; label: string; icon: string }[] = [
  { id: 'ai', label: 'AI assistant', icon: 'sparkle' },
  { id: 'knowledge', label: 'Repair knowledge', icon: 'book' },
  { id: 'calculators', label: 'Calculators', icon: 'calc' },
  { id: 'ics', label: 'IC cross-reference', icon: 'chip' },
  { id: 'microscope', label: 'USB microscope', icon: 'scope' },
  { id: 'mirror', label: 'Phone mirror & backup', icon: 'phone' },
];

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
