# Plausible Analytics Setup Guide

This guide walks you through setting up Plausible Analytics with a Cloudflare Worker proxy for the pgflow demo app.

## Overview

The setup consists of three parts:

1. Plausible dashboard configuration
2. Cloudflare Worker proxy deployment
3. SvelteKit app configuration

## Part 1: Plausible Dashboard Setup

1. **Sign up or log in** to [Plausible](https://plausible.io)

2. **Add your website**
   - Click "Add a website"
   - Enter your domain (e.g., `demo.pgflow.dev`)
   - Click "Add site"

3. **Get your script URL**
   - Go to Site Settings > General > Site Installation
   - Find your unique script URL - it will look like:
     ```
     https://plausible.io/js/pa-XXXXX.js
     ```
   - **Save this URL** - you'll need it for the Cloudflare Worker

## Part 2: Cloudflare Worker Setup

### Step 1: Create the Worker

1. Go to your [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to "Workers & Pages" in the sidebar
3. Click "Create" > "Create Worker"
4. Give it a name (avoid words like 'analytics', 'tracking', 'stats')
   - Good examples: `proxy-service`, `data-relay`, `metrics-hub`
5. Click "Deploy"

### Step 2: Configure the Worker

1. Click "Edit Code"
2. Delete the default code
3. Copy the code from `cloudflare-worker-plausible-proxy.js`
4. **Update the configuration** at the top of the file:

   ```javascript
   // Replace with your Plausible script URL from Part 1
   const ProxyScript = 'https://plausible.io/js/pa-XXXXX.js';

   // Customize these paths (avoid obvious names)
   const ScriptName = '/metrics/script.js'; // Change to something unique
   const Endpoint = '/metrics/event'; // Should match folder above
   ```

5. Click "Save and Deploy"

### Step 3: Test the Worker

1. Your worker will be available at:

   ```
   https://your-worker-name.your-account.workers.dev
   ```

2. Test if the script is accessible:
   ```
   https://your-worker-name.your-account.workers.dev/metrics/script.js
   ```
   You should see JavaScript code (the Plausible script)

### Step 4 (Optional): Add a Custom Route

If your site is on Cloudflare CDN, you can run the proxy as a subdirectory:

1. In the Worker settings, go to "Triggers" > "Routes"
2. Click "Add route"
3. Configure:
   - Route: `*yourdomain.com/analytics/*` (change "analytics" to something else)
   - Zone: Select your domain
4. Click "Save"

Now your proxy will be available at:

```
https://yourdomain.com/analytics/metrics/script.js
https://yourdomain.com/analytics/metrics/event
```

## Part 3: SvelteKit App Configuration

### Update the Layout File

Open `apps/demo/src/routes/+layout.svelte` and update the TODO section:

```typescript
onMount(() => {
	initPlausible({
		domain: 'demo.pgflow.dev', // Your actual domain
		apiHost: 'https://your-worker.workers.dev/metrics', // Your proxy URL
		trackLocalhost: false // Set to true for testing locally
	});
});
```

**Configuration options:**

- **Without custom route** (worker URL):

  ```typescript
  apiHost: 'https://your-worker-name.your-account.workers.dev/metrics';
  ```

- **With custom route** (subdirectory):
  ```typescript
  apiHost: '/analytics/metrics'; // Relative path works!
  ```

## Part 4: Track Custom Events

Use the `track()` function anywhere in your SvelteKit app:

```typescript
import { track } from '$lib/analytics';

// Simple event
track('button_clicked');

// Event with properties
track('signup', {
	tier: 'pro',
	plan: 'monthly',
	source: 'landing_page'
});

// Event with revenue tracking
track(
	'purchase',
	{
		product: 'pro-plan',
		quantity: 1
	},
	{
		amount: 29.99,
		currency: 'USD'
	}
);
```

### Common Event Examples

```typescript
// User signup
track('signup', { method: 'email' });

// Feature usage
track('flow_created', { flow_type: 'data_pipeline' });

// Form submission
track('contact_form', { page: 'pricing' });

// Download tracking (already automatic with fileDownloads: true)
// But you can track custom downloads:
track('documentation_download', { doc_type: 'api_reference' });
```

## Part 5: Verify Installation

1. **Start your dev server**:

   ```bash
   pnpm nx dev demo
   ```

2. **Open your browser console** and look for:

   ```
   [Plausible] Initialized successfully
   ```

3. **Check Plausible dashboard**:
   - Go to your Plausible dashboard
   - You should see pageviews appearing in real-time
   - Note: It may take a few seconds for events to appear

4. **Test custom events**:

   ```typescript
   // In browser console or your code
   track('test_event', { test: true });
   ```

   - Check Plausible dashboard > Custom Events to see it

## Troubleshooting

### Events not showing up

1. Check browser console for errors
2. Verify the proxy worker is accessible
3. Check that `domain` in config matches your Plausible site exactly
4. Make sure you're not on localhost (unless `trackLocalhost: true`)

### Worker not accessible

1. Verify the worker is deployed (check Cloudflare dashboard)
2. Check the worker logs for errors
3. Test the script URL directly in your browser

### Ad blocker blocking requests

1. Make sure you're using the proxy (not direct Plausible URLs)
2. Avoid obvious path names in your worker configuration
3. Use a custom route on your own domain

## Production Checklist

- [ ] Updated `ProxyScript` in worker with your Plausible script URL
- [ ] Customized `ScriptName` and `Endpoint` to avoid detection
- [ ] Deployed Cloudflare Worker successfully
- [ ] Tested worker script is accessible
- [ ] Updated `domain` in `+layout.svelte` with production domain
- [ ] Updated `apiHost` in `+layout.svelte` with worker URL
- [ ] Set `trackLocalhost: false` for production
- [ ] Verified events appear in Plausible dashboard
- [ ] Tested custom event tracking

## Additional Resources

- [Plausible Documentation](https://plausible.io/docs)
- [Plausible NPM Package](https://www.npmjs.com/package/@plausible-analytics/tracker)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Custom Events Guide](https://plausible.io/docs/custom-event-goals)
- [Revenue Tracking Guide](https://plausible.io/docs/ecommerce-revenue-tracking)
