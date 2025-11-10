/**
 * Cloudflare Worker for Plausible Analytics Proxy
 *
 * IMPORTANT: You MUST update the ProxyScript variable below with your
 * actual Plausible script URL from your dashboard before deploying!
 */

// CONFIGURATION - UPDATE THIS VALUE!
// Get this from your Plausible dashboard (Site Settings > Site Installation)
// It will look like: https://plausible.io/js/script.js (or pa-XXXXX.js for custom domains)
const ProxyScript = 'https://plausible.io/js/script.js';  // ← UPDATE THIS!

// Customize these paths to avoid ad-blocker detection
const ScriptName = '/stats/script.js';
const Endpoint = '/stats/event';

// Internal logic - do not edit below
const ScriptWithoutExtension = ScriptName.replace('.js', '');

addEventListener('fetch', (event) => {
  event.passThroughOnException();
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const pathname = new URL(event.request.url).pathname;
  const [baseUri, ...extensions] = pathname.split('.');

  if (baseUri.endsWith(ScriptWithoutExtension)) {
    return getScript(event, extensions);
  } else if (pathname.endsWith(Endpoint)) {
    return postData(event);
  }

  return new Response(null, { status: 404 });
}

async function getScript(event, extensions) {
  let response = await caches.default.match(event.request);
  if (!response) {
    response = await fetch(ProxyScript);
    event.waitUntil(caches.default.put(event.request, response.clone()));
  }
  return response;
}

async function postData(event) {
  const request = new Request(event.request);
  request.headers.delete('cookie');
  return await fetch('https://plausible.io/api/event', request);
}
