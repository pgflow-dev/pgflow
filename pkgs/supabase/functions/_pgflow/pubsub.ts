import { PoolClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

/**
 * Sets up a LISTEN on a Postgres channel and handles notifications
 * @param client Postgres client connection
 * @param channelName Name of the channel to listen on
 * @param callback Function to be called when a notification is received
 * @returns Cleanup function to remove the listener and UNLISTEN
 */
export async function listenOnChannel(
  client: PoolClient,
  channelName: string,
  callback: (payload: string) => void,
): Promise<() => Promise<void>> {
  // Set up the LISTEN command
  await client.queryObject(`LISTEN ${channelName}`);

  // Set up the notification handler
  const handler = (msg: { channel: string; payload?: string }) => {
    if (msg.channel === channelName) {
      callback(msg.payload || "");
    }
  };

  client.on("notification", handler);

  client;
  // Return cleanup function
  return async () => {
    client.off("notification", handler);
    await client.queryObject(`UNLISTEN ${channelName}`);
  };
}
