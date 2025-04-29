import { randomSleep } from '../utils.ts';

export default async function scrapeWebsite(url: string) {
  // await randomSleep(100, 1000);
  // return {
  //   content: `Lorem ipsum ${url.length}`,
  // };

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  return { content: await response.text() };
}
