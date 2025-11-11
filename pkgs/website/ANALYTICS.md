# Website Analytics - Plausible Setup

This document describes the Plausible Analytics implementation for the pgflow website.

## Overview

The website uses [Plausible Analytics](https://plausible.io/) for privacy-friendly, lightweight analytics. Events are tracked using CSS class-based tracking (preferred) and manual JavaScript tracking (for complex interactions).

## Configuration

### Script Setup

The Plausible script is configured in `astro.config.mjs` (lines 91-102):

```javascript
{
  tag: 'script',
  attrs: {
    defer: true,
    'data-domain': DOMAIN_NAME,
    'data-api': PLAUSIBLE_PROXY.url + PLAUSIBLE_PROXY.eventPath,
    src: PLAUSIBLE_PROXY.url + PLAUSIBLE_PROXY.scriptPath,
  },
}
```

**Script extensions enabled:**
- `.tagged-events` - CSS class-based event tracking
- `.outbound-links` - Automatic external link tracking
- `.pageview-props` - Custom pageview properties

### Proxy Configuration

Analytics are proxied through Cloudflare Workers to avoid ad blockers:
- Proxy URL: Set via `PLAUSIBLE_PROXY_URL` environment variable
- Required for production deployments
- See `DEPLOYMENT.md` for setup instructions

## Event Tracking Methods

### Method 1: CSS Class-Based Tracking (Preferred)

Add the `plausible-event-name=EventName` CSS class to any clickable element:

```html
<button class="plausible-event-name=home:cta-click">
  Click Me
</button>
```

**Naming convention:**
- Format: `page:action` or `section:action`
- Use hyphens for multi-word actions
- Examples: `home:cta-get-started`, `discord:join-click`

**Parent element tracking:**
Plausible can track clicks on child elements if the parent has the tracking class:

```html
<div class="plausible-event-name=home:card-click">
  <a href="/link">This link will be tracked</a>
</div>
```

### Method 2: Manual JavaScript Tracking

For complex interactions that can't use CSS classes (like scroll events):

```javascript
// Check if plausible is available
if (typeof window.plausible !== 'undefined') {
  window.plausible('event:name');
}
```

**When to use manual tracking:**
- Scroll events
- Form submissions with validation
- Multi-step interactions
- Events triggered by timers or animations

## Tracked Events

All custom events must be configured as goals in the Plausible dashboard before they appear.

### Homepage Events

| Event Name | Type | Description | Location |
|------------|------|-------------|----------|
| `home:cta-get-started` | CSS | Hero "Get Started" button click | index.mdx hero |
| `home:cta-how-it-works` | CSS | Hero "How It Works" button click | index.mdx hero |
| `home:reveal-code` | CSS | Reveals boilerplate code overlay | CodeOverlay.astro |
| `home:code-scroll` | Manual | User manually scrolls code (once per session) | CodeOverlay.astro |
| `home:cta-install-bottom` | CSS | Bottom CTA card click | index.mdx |
| `home:supabase-guide-click` | CSS | Supabase blog guide link | index.mdx |

### Community Events

| Event Name | Type | Description | Location |
|------------|------|-------------|----------|
| `discord:join-click` | CSS | Discord join link clicks | JoinCommunity.astro |

### Test Events (Development Only)

| Event Name | Type | Description | Location |
|------------|------|-------------|----------|
| `test:css-button-click` | CSS | Test CSS tracking | plausible-test.mdx |
| `test:manual-button-click` | Manual | Test manual tracking | plausible-test.mdx |

## Plausible Dashboard Configuration

### Required Custom Event Goals

To see tracked events in your Plausible dashboard:

1. Go to **Settings** → **Goals**
2. Click **+ Add goal**
3. Select **Custom event**
4. Add each event name listed above

**Production goals:**
```
home:cta-get-started
home:cta-how-it-works
home:reveal-code
home:code-scroll
home:cta-install-bottom
home:supabase-guide-click
discord:join-click
```

**Development/testing goals:**
```
test:css-button-click
test:manual-button-click
```

### Viewing Events

After configuring goals:
- Events appear at the bottom of the dashboard
- First conversion must occur before goal shows up
- Real-time data typically appears within 1-2 minutes
- Historical data aggregates over time

## Automatic Tracking

The following are tracked automatically (no configuration needed):

### Outbound Links
All external links are automatically tracked with the event name:
- Event: `Outbound Link: Click`
- Property: `url` (destination URL)

This includes:
- Social links (GitHub, Discord, Twitter)
- External documentation links
- Supabase blog references

### Pageviews
All pageviews are automatically tracked with:
- URL
- Referrer
- Browser/OS information
- Geographic location (privacy-friendly)

## Adding New Events

### For CSS-Trackable Elements

1. Add the CSS class to the element:
   ```html
   <button class="plausible-event-name=section:action-name">
     Button Text
   </button>
   ```

2. Add the event to this documentation file

3. Configure the custom event goal in Plausible dashboard

4. Test on a preview deployment before production

### For Complex Interactions

1. Add TypeScript declaration (if not exists):
   ```typescript
   declare global {
     interface Window {
       plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
     }
   }
   ```

2. Add tracking code with safety check:
   ```typescript
   if (typeof window.plausible !== 'undefined') {
     window.plausible('section:action-name');
   }
   ```

3. Follow steps 2-4 from CSS tracking above

## Testing

### Local Development

1. Start dev server: `pnpm nx dev website`
2. Visit `/plausible-test/` page
3. Open browser console (F12)
4. Click test buttons
5. Check console for:
   - `window.plausible` is defined
   - No JavaScript errors
   - Event tracking calls logged

### Browser Console Checks

```javascript
// Check if Plausible is loaded
typeof window.plausible
// Expected: "function"

// Check script element
document.querySelector('script[data-domain]')
// Expected: <script> element

// Check domain configuration
document.querySelector('script[data-domain]')?.getAttribute('data-domain')
// Expected: "www.pgflow.dev"

// Manually trigger test event
window.plausible('test:manual-trigger')
// Expected: No errors, event sent
```

### Preview Deployments

1. Push to PR branch
2. Wait for preview deployment
3. Visit preview URL: `https://pr-{number}.pgflow.pages.dev`
4. Test event tracking
5. Check Plausible dashboard for events (may take 1-2 minutes)

## Troubleshooting

### Events Not Appearing in Dashboard

**Issue:** Clicked buttons but no events show up

**Solutions:**
1. **Configure custom event goals** - This is the most common issue
   - Go to Settings → Goals in Plausible
   - Add custom event with exact event name
   - Wait 1-2 minutes and refresh dashboard

2. **Check script loading**
   - Open browser console
   - Verify `typeof window.plausible === "function"`
   - Check for JavaScript errors

3. **Verify proxy URL**
   - Check `PLAUSIBLE_PROXY_URL` is set correctly
   - Test proxy: `curl -I https://your-proxy-url/assets/script...js`
   - Should return 200 OK

4. **Ad blocker interference**
   - Try disabling ad blockers
   - Verify proxy is working (bypasses most blockers)
   - Check browser extensions

### CSS Class Not Working

**Issue:** Added `plausible-event-name=...` class but clicks not tracked

**Solutions:**
1. **Verify class syntax**
   - Must be exactly: `plausible-event-name=EventName`
   - Use `+` for spaces: `plausible-event-name=Button+Click`
   - Some CMSs replace `=` with `-`, use `--` instead

2. **Check element is clickable**
   - Must be `<a>`, `<button>`, or element with click handler
   - Parent element with class can track child clicks

3. **Inspect HTML in browser**
   - Right-click → Inspect element
   - Verify class was actually added to HTML
   - Check for class name transformations

### Script Not Loading

**Issue:** `window.plausible` is undefined

**Solutions:**
1. **Check proxy URL**
   - Verify `PLAUSIBLE_PROXY_URL` environment variable
   - Test URL in browser: should return JavaScript file

2. **Check network tab**
   - Open DevTools → Network tab
   - Look for script load
   - Check for 404 or CORS errors

3. **Verify domain configuration**
   - Check `data-domain` matches Plausible site configuration
   - Currently: `www.pgflow.dev`

## Privacy & Performance

### Privacy
- No cookies used
- No personal data collected
- No cross-site tracking
- GDPR, CCPA, PECR compliant
- IP addresses anonymized

### Performance
- Script size: ~1KB (gzipped)
- Loads asynchronously (defer)
- No impact on page load time
- Events batched for efficiency

## References

- [Plausible Custom Events Documentation](https://plausible.io/docs/custom-event-goals)
- [Plausible Script Extensions](https://plausible.io/docs/script-extensions)
- Proxy setup: See `DEPLOYMENT.md`
- Environment variables: See `DEPLOYMENT.md`
