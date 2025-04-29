// this function sleeps for ms number of milliseconds
export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// this function sleeps for a random number of milliseconds between min and max
export async function randomSleep(min: number, max: number) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  await sleep(ms);
}
