import { EdgeWorker } from '../../dist/index.js';
import { getPortableExample, startPortableExample } from '../../supabase/functions/_shared/portable_examples.js';
import process from 'node:process';

const exampleName = process.env.PORTABLE_EXAMPLE_NAME;

if (!exampleName) {
  throw new Error('PORTABLE_EXAMPLE_NAME is required');
}

const example = getPortableExample(exampleName);

if (!process.env.WORKER_NAME) {
  process.env.WORKER_NAME = example.queueName;
}

const expectedConnectionString = process.env.PORTABLE_EXPECTED_CONNECTION_STRING;

const workerOptions = process.env.PORTABLE_QUEUE_NAME
  ? { queueName: process.env.PORTABLE_QUEUE_NAME }
  : {};

await startPortableExample(EdgeWorker, exampleName, {
  expectedConnectionString,
  workerOptions,
});

console.log(`portable worker started: ${exampleName}`);
