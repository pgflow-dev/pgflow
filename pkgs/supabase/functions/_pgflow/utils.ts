export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export const randomSleep = () => sleep(Math.floor(Math.random() * 500 + 200)); // Random 1-5 seconds
