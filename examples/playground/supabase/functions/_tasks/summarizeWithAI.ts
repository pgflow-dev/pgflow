import { randomSleep } from '../utils.ts';

export default async (content: string) => {
  await randomSleep(500, 3000);
  return {
    aiSummary: `Lorem ipsum ${content.length}`,
  };
};
