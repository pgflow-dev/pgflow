export default function createInterruptibleSleep() {
  let resolver: (() => void) | undefined;

  const sleep = (ms: number) => {
    return Promise.race([
      new Promise((resolve) => setTimeout(resolve, ms)),
      new Promise((resolve) => {
        resolver = () => resolve(undefined);
      }),
    ]);
  };

  const interrupt = () => resolver?.();

  return { sleep, interrupt };
}
