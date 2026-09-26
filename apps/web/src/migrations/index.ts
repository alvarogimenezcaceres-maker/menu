import * as migration_20260926_165334_initial from './20260926_165334_initial';

export const migrations = [
  {
    up: migration_20260926_165334_initial.up,
    down: migration_20260926_165334_initial.down,
    name: '20260926_165334_initial'
  },
];
