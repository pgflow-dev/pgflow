# Phase 6: Polish + Deploy

**Branch:** `feat-demo-6-polish-deploy`

**Prerequisite:** Complete Phase 5 (Results Modals)

**Goal:** Add final polish (overlays, speed toggle, CTAs, analytics, responsive) and deploy to production. Ship Show HN-ready demo.

**Success Criteria:**
- ✅ Speed mode toggle works (slow ↔ fast)
- ✅ Welcome overlay appears for first-time visitors
- ✅ Completion overlay appears with CTAs
- ✅ "Try Another URL" button with popover
- ✅ Logo in header
- ✅ Analytics tracking all events
- ✅ Mobile responsive (functional)
- ✅ Deployed to Cloudflare Pages with custom domain
- ✅ No console errors in production

**Philosophy:** Ship fast, iterate later. Functional > perfect.

---

## Tasks

### 1. Verify Logo Assets

Check that logos were copied in Phase 2:

```bash
ls apps/demo/static/pgflow-logo-*.svg
```

**Expected:** Both `pgflow-logo-dark.svg` and `pgflow-logo-light.svg` present

**If missing:** Copy from `pkgs/website/src/assets/`

---

### 2. Create Header Component

Create `apps/demo/src/lib/components/Header.svelte`

**Features:**
- pgflow logo (left) - use static SVG files
- "Try Another URL" button (center) - appears after first completion
- Speed toggle (right) - segmented control with 🐌 Slow / ⚡ Fast
- URL popover shows 3-4 suggested article URLs

**Props:**
- `onUrlSelected`: callback when URL selected
- `onSpeedChange`: callback when speed toggled
- `showTryAnotherUrl`: whether to show the center button

**Implementation Notes:**
- Use shadcn-svelte components for buttons and popover
- Store speed preference in localStorage
- Suggested URLs should be hardcoded array

---

### 3. Create Welcome Overlay Component

Create `apps/demo/src/lib/components/WelcomeOverlay.svelte`

**Purpose:** First-time visitor onboarding

**Features:**
- Full-screen overlay with welcome message
- Lists key features (DAG viz, code execution, debug info, retry handling)
- URL input field with dropdown suggestions
- "Start Demo" button
- "Don't show again" checkbox (uses localStorage)
- Note about slow motion being default

**Behavior:**
- Check localStorage on mount for dismissed state
- Call `onStart(url)` prop when user clicks start
- Dismisses and saves preference if checkbox checked

**Styling:**
- Use overlay pattern: fixed position, backdrop, centered content
- Match pgflow dark theme colors

---

### 4. Create Completion Overlay Component

Create `apps/demo/src/lib/components/CompletionOverlay.svelte`

**Purpose:** Post-completion celebration and CTAs

**Features:**
- Success message explaining slow motion demo
- Encourages trying fast mode
- Grid of CTA buttons (2x3):
  - Get Started (docs)
  - Star on GitHub
  - Join Discord
  - Follow on X
  - Contact
  - Try Another URL

**Props:**
- `visible`: boolean to show/hide
- `onClose`: callback when closed

**Links to include:**
- Docs: `https://pgflow.dev/get-started/`
- GitHub: `https://github.com/pgflow-dev/pgflow`
- Discord: `https://pgflow.dev/discord`
- X: `https://x.com/pgflow_dev`
- Contact: `https://pgflow.dev/author`

**Styling:**
- Similar overlay pattern as welcome
- CTA buttons in grid layout
- Hover states for buttons

---

### 5. Integrate Plausible Analytics

Edit `apps/demo/src/app.html`:

Add Plausible script tags in the head section with:
- Script tag for plausible.io/js/script.js
- Data domain attribute: "demo.pgflow.dev"
- Window.plausible fallback function

Create analytics helper `apps/demo/src/lib/analytics.ts`:

Export a `trackEvent` function that:
- Checks if window.plausible exists
- Calls plausible with event name and optional props
- Handles SSR safely (typeof window check)

Add TypeScript window declaration for plausible.

---

### 6. Wire Everything Together

Edit `apps/demo/src/routes/+page.svelte` to integrate all new components:

**State additions:**
- `speedMode` - 'slow' | 'fast' (default: 'slow')
- `showCompletionOverlay` - boolean
- `hasCompletedOnce` - boolean

**Import all new components:**
- Header
- WelcomeOverlay
- CompletionOverlay

**Add delay logic:**
- In slow mode: 1000ms delay per step
- In fast mode: 0ms delay
- Apply delay using setTimeout in event handlers

**Track analytics events:**
- demo_started (with speed and url)
- demo_completed
- demo_error
- speed_toggled_slow/fast
- url_suggestion_selected

**Component structure:**
- Add Header at top with props
- Add WelcomeOverlay (conditional render for first-time)
- Add CompletionOverlay (shows after completion)
- Existing components remain

---

### 7. Add Mobile Responsiveness

Update `apps/demo/src/app.css`:

Add media queries for:
- Tablets (max-width: 1200px): Single column layout
- Mobile (max-width: 768px): Reduced padding, smaller fonts

Key adjustments:
- Container padding reduction
- Font size scaling
- Button size adjustments
- Grid to single column transition

---

### 8. Configure Cloudflare Pages Deployment

Edit `apps/demo/svelte.config.js`:

- Import and configure @sveltejs/adapter-cloudflare
- Set routes configuration
- Include all paths, exclude none

---

### 9. Build for Production

```bash
pnpm nx build demo
```

**Validate:**
- Build completes without errors
- Output in `apps/demo/build/`

---

### 10. Deploy to Cloudflare Pages

**Via Cloudflare Dashboard:**

1. Create new Pages project
2. Connect to Git or upload directly
3. Build settings:
   - Build command: `pnpm nx build demo`
   - Build output: `apps/demo/build`
   - Root directory: `/`
4. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

**Custom Domain:**
- Add domain: `demo.pgflow.dev`
- Update DNS records as instructed

---

### 11. Test Production Build Locally

```bash
pnpm nx preview demo
```

Test checklist:
- All features work
- Analytics fires (check network tab)
- No console errors
- Logos load
- Mobile responsive

---

### 12. Deploy Edge Functions to Supabase

Deploy both workers to production:

```bash
cd apps/demo
npx -y supabase@latest functions deploy test_flow_worker
npx -y supabase@latest functions deploy article_flow_worker
npx -y supabase@latest secrets set JINA_API_KEY=your_actual_key
```

**Note:** Both `test_flow_worker` and `article_flow_worker` need to be deployed for the demo to work.

---

## Validation Checklist

- [ ] Logo appears in header
- [ ] Speed toggle works (slow ↔ fast)
- [ ] Welcome overlay appears (first visit)
- [ ] Welcome overlay dismissible ("don't show again")
- [ ] Flow runs in slow mode by default
- [ ] Speed affects execution timing
- [ ] Completion overlay appears after run
- [ ] All CTA links work in completion overlay
- [ ] "Try Another URL" button appears after first run
- [ ] URL popover shows suggestions
- [ ] Analytics tracking all events (check Plausible dashboard)
- [ ] Mobile responsive (test on phone/tablet)
- [ ] Deployed to Cloudflare Pages
- [ ] Custom domain works (demo.pgflow.dev)
- [ ] Edge Functions deployed to Supabase
- [ ] Production has no console errors
- [ ] All features work in production

---

## Troubleshooting

**Problem: Build fails**
- Check TypeScript errors: `pnpm nx type-check demo`
- Clear cache and rebuild
- Check for missing dependencies

**Problem: Analytics not firing**
- Verify plausible.io requests in network tab
- Check domain matches in script tag
- Verify trackEvent calls

**Problem: Logos not loading**
- Verify files exist in `apps/demo/static/`
- Check paths don't include `static/` prefix in src
- Check network tab for 404s

**Problem: Cloudflare Pages build fails**
- Verify build command and output directory
- Check Node version compatibility
- Ensure environment variables are set

**Problem: Custom domain not working**
- Allow DNS propagation time (up to 48h)
- Verify CNAME configuration
- Test with default Pages URL first

---

## Files Created/Modified

**Created:**
- `apps/demo/src/app.html`
- `apps/demo/src/lib/analytics.ts`
- `apps/demo/src/lib/components/Header.svelte`
- `apps/demo/src/lib/components/WelcomeOverlay.svelte`
- `apps/demo/src/lib/components/CompletionOverlay.svelte`

**Modified:**
- `apps/demo/svelte.config.js` (Cloudflare adapter)
- `apps/demo/src/app.css` (responsive styles)
- `apps/demo/src/routes/+page.svelte` (integration)

---

## Post-Deployment

### Monitor in Production

1. Check Plausible dashboard for event tracking
2. Monitor Cloudflare Analytics
3. Review Supabase Edge Function logs
4. Verify no console errors on live site

### Update Documentation

Update `.notes/prds/demo-app-prd.md` with production URL and status.

### Prepare Show HN Post

Draft title, URL, and description for Show HN submission focusing on:
- Interactive demo showcasing workflow orchestration
- Real-time DAG visualization
- Full observability features
- Automatic retry handling
- PostgreSQL-native approach

---

## Success! 🎉

Demo is now:
- ✅ **Functional** - All features work end-to-end
- ✅ **Interactive** - Engaging clicks, animations, modals
- ✅ **Observable** - Full visibility into execution
- ✅ **Responsive** - Works on desktop and mobile
- ✅ **Tracked** - Analytics capturing all events
- ✅ **Deployed** - Live at custom domain
- ✅ **Show HN Ready** - Compelling and polished

**Ship it!** 🚀

---

## Optional Enhancements (Post-Launch)

If time permits or after Show HN feedback:

1. **Event Stream section** - Add to Debug Panel (from PRD)
2. **Real LLM calls** - Use actual Groq API
3. **More suggested URLs** - Expand to 10+ pre-tested URLs
4. **Keyboard shortcuts** - Space to run, Escape to close
5. **Dark/Light theme toggle** - Match user preference
6. **Better error messages** - User-friendly explanations
7. **Retry count display** - Show in DAG nodes
8. **Duration tracking** - Per-step timing breakdown
9. **Share button** - Generate shareable URL with run ID
10. **Mobile polish** - Dedicated mobile layout

**But remember:** Perfect is the enemy of shipped. Launch first, iterate based on real feedback.
