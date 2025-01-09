import { Supaworker } from '../_supaworker/index.ts';
import { delay } from 'jsr:@std/async';

const sleep1s = () => delay(1000);

Supaworker.start(sleep1s, { maxConcurrency: 1 });
