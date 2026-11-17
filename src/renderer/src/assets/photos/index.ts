// Real photographs bundled with the app (works offline). Each file is under a
// free licence; credits are shown in About and listed in THIRD_PARTY_LICENSES.md.
import hero from './hero-microscope-board.jpg';

export interface PhotoCredit { file: string; title: string; author: string; license: string; source: string; changes?: string }

export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    file: 'hero-microscope-board.jpg',
    title: 'Microscope close-up of blown step-down regulator on laptop PCB',
    author: 'Profpcde',
    license: 'CC0 1.0 (public domain dedication)',
    source: 'https://commons.wikimedia.org/wiki/File:Microscope_close-up_of_blown_step-down_regulator_on_laptop_PCB.jpg',
    changes: 'resized',
  },
];

/** Photo URLs by slot: hero, and optionally one per workbench tool id. */
export const PHOTOS: Record<string, string> = { hero };
