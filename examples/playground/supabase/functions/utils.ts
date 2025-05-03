// this function sleeps for ms number of milliseconds
export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// this function sleeps for a random number of milliseconds between min and max
export async function randomSleep(min: number, max: number) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  await sleep(ms);
}

const FAILURE_URL = 'https://firebase.google.com/';

/**
 * Simulates a random failure with a 50% probability
 * Optionally checks for a specific value that always fails
 */
export async function simulateFailure(url: string): Promise<void> {
  // Only fail if random is greater than 0.5 (50% chance)
  if (url === FAILURE_URL) {
    throw new Error('Simulated random failure to demonstrate error handling');
  }
}
