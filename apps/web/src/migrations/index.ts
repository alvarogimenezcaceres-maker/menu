import * as migration_20260926_165334_initial from './20260926_165334_initial';
import * as migration_20260926_170647_uploadthing_fields from './20260926_170647_uploadthing_fields';

export const migrations = [
  {
    up: migration_20260926_165334_initial.up,
    down: migration_20260926_165334_initial.down,
    name: '20260926_165334_initial',
  },
  {
    up: migration_20260926_170647_uploadthing_fields.up,
    down: migration_20260926_170647_uploadthing_fields.down,
    name: '20260926_170647_uploadthing_fields'
  },
];
