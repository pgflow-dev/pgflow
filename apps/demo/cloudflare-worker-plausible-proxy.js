/**
 * Cloudflare Worker for Plausible Analytics Proxy
 *
 * This worker proxies Plausible Analytics scripts and events to avoid ad-blocker detection
 */

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
    // Fetch the standard Plausible script with any extensions
    // Default to 'plausible.js' if no extensions are provided
    const scriptPath = extensions.length > 0
      ? 'plausible.' + extensions.join('.')
      : 'plausible.js';
    response = await fetch('https://plausible.io/js/' + scriptPath);
    event.waitUntil(caches.default.put(event.request, response.clone()));
  }
  return response;
}

async function postData(event) {
  const request = new Request(event.request);
  request.headers.delete('cookie');
  return await fetch('https://plausible.io/api/event', request);
}