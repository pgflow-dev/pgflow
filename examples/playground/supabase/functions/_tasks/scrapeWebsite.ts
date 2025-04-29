export default async function scrapeWebsite(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  const rawContent = await response.text();

  return { content: rawContent };
}
