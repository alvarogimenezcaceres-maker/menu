import * as migration_20260926_165334_initial from './20260926_165334_initial';
import * as migration_20260926_170647_uploadthing_fields from './20260926_170647_uploadthing_fields';
import * as migration_20260926_194704_scan_jobs from './20260926_194704_scan_jobs';
import * as migration_20260929_183507_ordering_options_prices from './20260929_183507_ordering_options_prices';
import * as migration_20260930_020833_google_review_url from './20260930_020833_google_review_url';
import * as migration_20260930_234810_restaurant_legal from './20260930_234810_restaurant_legal';

export const migrations = [
  {
    up: migration_20260926_165334_initial.up,
    down: migration_20260926_165334_initial.down,
    name: '20260926_165334_initial',
  },
  {
    up: migration_20260926_170647_uploadthing_fields.up,
    down: migration_20260926_170647_uploadthing_fields.down,
    name: '20260926_170647_uploadthing_fields',
  },
  {
    up: migration_20260926_194704_scan_jobs.up,
    down: migration_20260926_194704_scan_jobs.down,
    name: '20260926_194704_scan_jobs',
  },
  {
    up: migration_20260929_183507_ordering_options_prices.up,
    down: migration_20260929_183507_ordering_options_prices.down,
    name: '20260929_183507_ordering_options_prices',
  },
  {
    up: migration_20260930_020833_google_review_url.up,
    down: migration_20260930_020833_google_review_url.down,
    name: '20260930_020833_google_review_url',
  },
  {
    up: migration_20260930_234810_restaurant_legal.up,
    down: migration_20260930_234810_restaurant_legal.down,
    name: '20260930_234810_restaurant_legal'
  },
];
