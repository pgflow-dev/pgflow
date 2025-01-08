import { Supaworker } from '../_supaworker/index.ts';

Supaworker.start((message) => console.log('onMessage', message));
