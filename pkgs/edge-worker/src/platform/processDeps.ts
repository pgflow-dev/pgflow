export type ProcessSignal = 'SIGTERM' | 'SIGINT' | 'SIGQUIT';

export type ProcessDeps = {
  env: Record<string, string | undefined>;
  onSignal: (signal: ProcessSignal, handler: () => void | Promise<void>) => void;
  offSignal?: (signal: ProcessSignal, handler: () => void | Promise<void>) => void;
  exit: (code: number) => never;
  setExitCode: (code: number) => void;
  randomUUID: () => string;
};

type ProcessLike = {
  env?: Record<string, string | undefined>;
  on?: (signal: ProcessSignal, handler: () => void | Promise<void>) => void;
  off?: (signal: ProcessSignal, handler: () => void | Promise<void>) => void;
  exit?: (code: number) => never;
  exitCode?: number;
};

type CryptoLike = {
  randomUUID?: () => string;
};

export function getProcessDeps(): ProcessDeps {
  const processLike = (globalThis as { process?: ProcessLike }).process;
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;

  if (
    !processLike?.env ||
    !processLike.on ||
    !processLike.off ||
    !processLike.exit ||
    !cryptoLike?.randomUUID
  ) {
    throw new Error('Process runtime is not available');
  }

  return {
    env: processLike.env,
    onSignal: (signal, handler) => processLike.on?.(signal, handler),
    offSignal: (signal, handler) => processLike.off?.(signal, handler),
    exit: (code) => processLike.exit!(code),
    setExitCode: (code) => {
      processLike.exitCode = code;
    },
    randomUUID: () => cryptoLike.randomUUID!(),
  };
}
