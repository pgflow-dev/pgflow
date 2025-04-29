import { randomSleep } from '../utils.ts';

export default async (_content: string) => {
  await randomSleep(300, 2000);
  return {
    score: Math.random(),
  };
};
