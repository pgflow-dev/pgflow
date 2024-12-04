export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export const randomSleep = (ms: number = 500) =>
  sleep(Math.floor(Math.random() * ms + 100)); // Random 1-5 seconds
