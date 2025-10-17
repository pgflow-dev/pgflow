# Starlight CSS Variables Reference

Complete reference of all Starlight CSS variables used in the pgflow website.

## Color Variables (Dark Mode - Default)

### Grayscale
```css
--sl-color-white: hsl(0, 0%, 100%)           /* #ffffff - Pure white */
--sl-color-gray-1: hsl(224, 20%, 94%)        /* #eef1f6 - Lightest gray */
--sl-color-gray-2: hsl(224, 6%, 77%)         /* #c0c2c7 - Light gray */
--sl-color-gray-3: hsl(224, 6%, 56%)         /* #888b96 - Medium gray */
--sl-color-gray-4: hsl(224, 7%, 36%)         /* #565960 - Dark gray */
--sl-color-gray-5: hsl(224, 10%, 23%)        /* #353841 - Darker gray */
--sl-color-gray-6: hsl(224, 14%, 16%)        /* #232530 - Very dark gray */
--sl-color-black: hsl(224, 10%, 10%)         /* #171923 - Almost black */
```

### Semantic Colors (Dark Mode)
```css
/* Orange - Used for caution/warning */
--sl-hue-orange: 41
--sl-color-orange-low: hsl(41, 39%, 22%)     /* #463a26 - Dark orange bg */
--sl-color-orange: hsl(41, 82%, 63%)         /* #eca336 - Orange */
--sl-color-orange-high: hsl(41, 82%, 87%)    /* #f8dbb0 - Light orange */

/* Green - Used for success/tip */
--sl-hue-green: 101
--sl-color-green-low: hsl(101, 39%, 22%)     /* #2a4126 - Dark green bg */
--sl-color-green: hsl(101, 82%, 63%)         /* #6fdb36 - Green */
--sl-color-green-high: hsl(101, 82%, 80%)    /* #b3ef99 - Light green */

/* Blue - Used for info/note */
--sl-hue-blue: 234
--sl-color-blue-low: hsl(234, 54%, 20%)      /* #172866 - Dark blue bg */
--sl-color-blue: hsl(234, 100%, 60%)         /* #3366ff - Blue */
--sl-color-blue-high: hsl(234, 100%, 87%)    /* #c2d6ff - Light blue */

/* Purple - Used for tip */
--sl-hue-purple: 281
--sl-color-purple-low: hsl(281, 39%, 22%)    /* #412646 - Dark purple bg */
--sl-color-purple: hsl(281, 82%, 63%)        /* #db36ec - Purple */
--sl-color-purple-high: hsl(281, 82%, 89%)   /* #f2bef8 - Light purple */

/* Red - Used for danger/error */
--sl-hue-red: 339
--sl-color-red-low: hsl(339, 39%, 22%)       /* #462629 - Dark red bg */
--sl-color-red: hsl(339, 82%, 63%)           /* #ec365a - Red */
--sl-color-red-high: hsl(339, 82%, 87%)      /* #f8b0bf - Light red */
```

### Accent Color (Dark Mode - Starlight Default)
```css
--sl-color-accent-low: hsl(224, 54%, 20%)    /* #172866 - Dark accent */
--sl-color-accent: hsl(224, 100%, 60%)       /* #3366ff - Primary accent */
--sl-color-accent-high: hsl(224, 100%, 85%)  /* #b3ccff - Light accent */
```

### pgflow Custom Overrides (Dark Mode)
```css
/* Teal/Green theme - overrides the default blue */
--sl-color-accent-low: #002b26              /* Dark teal */
--sl-color-accent: #007b6e                  /* Teal */
--sl-color-accent-high: #a3d4cb             /* Light teal */

/* Custom grays with greenish tint */
--sl-color-gray-1: #e7f0ee
--sl-color-gray-2: #c2cdca
--sl-color-gray-3: #92a8a3
--sl-color-gray-4: #495d59
--sl-color-gray-5: #2a3d39
--sl-color-gray-6: #182b28
--sl-color-black: #121a19
```

## Color Variables (Light Mode)

### Grayscale (Light Mode)
```css
--sl-color-white: hsl(224, 10%, 10%)         /* #171923 - Dark text */
--sl-color-gray-1: hsl(224, 14%, 16%)        /* #232530 */
--sl-color-gray-2: hsl(224, 10%, 23%)        /* #353841 */
--sl-color-gray-3: hsl(224, 7%, 36%)         /* #565960 */
--sl-color-gray-4: hsl(224, 6%, 56%)         /* #888b96 */
--sl-color-gray-5: hsl(224, 6%, 77%)         /* #c0c2c7 */
--sl-color-gray-6: hsl(224, 20%, 94%)        /* #eef1f6 */
--sl-color-gray-7: hsl(224, 19%, 97%)        /* #f6f7f9 */
--sl-color-black: hsl(0, 0%, 100%)           /* #ffffff - White bg */
```

### Semantic Colors (Light Mode)
```css
/* Colors are inverted for light mode */
--sl-color-orange-high: hsl(41, 80%, 25%)    /* Dark orange text */
--sl-color-orange: hsl(41, 90%, 60%)         /* Orange */
--sl-color-orange-low: hsl(41, 90%, 88%)     /* Light orange bg */

--sl-color-green-high: hsl(101, 80%, 22%)    /* Dark green text */
--sl-color-green: hsl(101, 90%, 46%)         /* Green */
--sl-color-green-low: hsl(101, 85%, 90%)     /* Light green bg */

--sl-color-blue-high: hsl(234, 80%, 30%)     /* Dark blue text */
--sl-color-blue: hsl(234, 90%, 60%)          /* Blue */
--sl-color-blue-low: hsl(234, 88%, 90%)      /* Light blue bg */

--sl-color-purple-high: hsl(281, 90%, 30%)   /* Dark purple text */
--sl-color-purple: hsl(281, 90%, 60%)        /* Purple */
--sl-color-purple-low: hsl(281, 80%, 90%)    /* Light purple bg */

--sl-color-red-high: hsl(339, 80%, 30%)      /* Dark red text */
--sl-color-red: hsl(339, 90%, 60%)           /* Red */
--sl-color-red-low: hsl(339, 80%, 90%)       /* Light red bg */
```

### pgflow Custom Overrides (Light Mode)
```css
--sl-color-accent-low: #bce0d9              /* Light teal bg */
--sl-color-accent: #00574d                  /* Dark teal */
--sl-color-accent-high: #003b34             /* Darker teal text */
--sl-color-white: #121a19                   /* Dark text */
--sl-color-gray-1: #182b28
--sl-color-gray-2: #2a3d39
--sl-color-gray-3: #495d59
--sl-color-gray-4: #7c918d
--sl-color-gray-5: #bac5c2
--sl-color-gray-6: #e7f0ee
--sl-color-gray-7: #f3f7f6
--sl-color-black: #ffffff                   /* White bg */
```

## Semantic Usage Variables

### Text Colors
```css
--sl-color-text: var(--sl-color-gray-2)              /* Body text */
--sl-color-text-accent: var(--sl-color-accent-high)  /* Accent text */
--sl-color-text-invert: var(--sl-color-accent-low)   /* Inverted text */
```

### Background Colors
```css
--sl-color-bg: var(--sl-color-black)                 /* Main background */
--sl-color-bg-nav: var(--sl-color-gray-6)            /* Navigation bg */
--sl-color-bg-sidebar: var(--sl-color-gray-6)        /* Sidebar bg */
--sl-color-bg-inline-code: var(--sl-color-gray-5)    /* Inline code bg */
--sl-color-bg-accent: var(--sl-color-accent-high)    /* Accent bg */
```

### Border/Divider Colors
```css
--sl-color-hairline-light: var(--sl-color-gray-5)    /* Light divider */
--sl-color-hairline: var(--sl-color-gray-6)          /* Default divider */
--sl-color-hairline-shade: var(--sl-color-black)     /* Dark divider */
```

### Overlay Colors
```css
--sl-color-backdrop-overlay: hsla(223, 13%, 10%, 0.66)  /* Modal overlay */
```

## Aside Component Colors

### Note (Blue)
```css
.starlight-aside--note {
  --sl-color-asides-text-accent: var(--sl-color-blue-high);
  --sl-color-asides-border: var(--sl-color-blue);
  background-color: var(--sl-color-blue-low);
}
```

### Tip (Purple)
```css
.starlight-aside--tip {
  --sl-color-asides-text-accent: var(--sl-color-purple-high);
  --sl-color-asides-border: var(--sl-color-purple);
  background-color: var(--sl-color-purple-low);
}
```

### Caution (Orange)
```css
.starlight-aside--caution {
  --sl-color-asides-text-accent: var(--sl-color-orange-high);
  --sl-color-asides-border: var(--sl-color-orange);
  background-color: var(--sl-color-orange-low);
}
```

### Danger (Red)
```css
.starlight-aside--danger {
  --sl-color-asides-text-accent: var(--sl-color-red-high);
  --sl-color-asides-border: var(--sl-color-red);
  background-color: var(--sl-color-red-low);
}
```

## Typography Variables

### Font Sizes
```css
--sl-text-2xs: 0.75rem      /* 12px */
--sl-text-xs: 0.8125rem     /* 13px */
--sl-text-sm: 0.875rem      /* 14px */
--sl-text-base: 1rem        /* 16px */
--sl-text-lg: 1.125rem      /* 18px */
--sl-text-xl: 1.25rem       /* 20px */
--sl-text-2xl: 1.5rem       /* 24px */
--sl-text-3xl: 1.8125rem    /* 29px */
--sl-text-4xl: 2.1875rem    /* 35px */
--sl-text-5xl: 2.625rem     /* 42px */
--sl-text-6xl: 4rem         /* 64px */
```

### Semantic Font Sizes
```css
--sl-text-body: var(--sl-text-base)
--sl-text-body-sm: var(--sl-text-xs)
--sl-text-code: var(--sl-text-sm)
--sl-text-code-sm: var(--sl-text-xs)
--sl-text-h1: var(--sl-text-4xl)     /* Larger on desktop */
--sl-text-h2: var(--sl-text-3xl)     /* Larger on desktop */
--sl-text-h3: var(--sl-text-2xl)     /* Larger on desktop */
--sl-text-h4: var(--sl-text-xl)      /* Larger on desktop */
--sl-text-h5: var(--sl-text-lg)
```

### Line Heights
```css
--sl-line-height: 1.75
--sl-line-height-headings: 1.2
```

### Font Families
```css
--sl-font-system: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;

--sl-font-system-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  'Liberation Mono', 'Courier New', monospace;

--__sl-font: var(--sl-font, var(--sl-font-system)), var(--sl-font-system);
--__sl-font-mono: var(--sl-font-mono, var(--sl-font-system-mono)), var(--sl-font-system-mono);
```

## Shadow Variables

### Dark Mode Shadows
```css
--sl-shadow-sm: 0px 1px 1px hsla(0, 0%, 0%, 0.12),
                0px 2px 1px hsla(0, 0%, 0%, 0.24);

--sl-shadow-md: 0px 8px 4px hsla(0, 0%, 0%, 0.08),
                0px 5px 2px hsla(0, 0%, 0%, 0.08),
                0px 3px 2px hsla(0, 0%, 0%, 0.12),
                0px 1px 1px hsla(0, 0%, 0%, 0.15);

--sl-shadow-lg: 0px 25px 7px hsla(0, 0%, 0%, 0.03),
                0px 16px 6px hsla(0, 0%, 0%, 0.1),
                0px 9px 5px hsla(223, 13%, 10%, 0.33),
                0px 4px 4px hsla(0, 0%, 0%, 0.75),
                0px 4px 2px hsla(0, 0%, 0%, 0.25);
```

### Light Mode Shadows
```css
--sl-shadow-sm: 0px 1px 1px hsla(0, 0%, 0%, 0.06),
                0px 2px 1px hsla(0, 0%, 0%, 0.06);

--sl-shadow-md: 0px 8px 4px hsla(0, 0%, 0%, 0.03),
                0px 5px 2px hsla(0, 0%, 0%, 0.03),
                0px 3px 2px hsla(0, 0%, 0%, 0.06),
                0px 1px 1px hsla(0, 0%, 0%, 0.06);

--sl-shadow-lg: 0px 25px 7px rgba(0, 0, 0, 0.01),
                0px 16px 6px hsla(0, 0%, 0%, 0.03),
                0px 9px 5px hsla(223, 13%, 10%, 0.08),
                0px 4px 4px hsla(0, 0%, 0%, 0.16),
                0px 4px 2px hsla(0, 0%, 0%, 0.04);
```

## Layout Variables

```css
--sl-nav-height: 3.5rem                 /* 4rem on desktop */
--sl-nav-pad-x: 1rem                    /* 1.5rem on desktop */
--sl-nav-pad-y: 0.75rem
--sl-mobile-toc-height: 3rem            /* 0 on desktop */
--sl-sidebar-width: 18.75rem
--sl-sidebar-pad-x: 1rem
--sl-content-width: 45rem
--sl-content-pad-x: 1rem                /* 1.5rem on desktop */
--sl-main-pad: 0 0 3vh 0
--sl-menu-button-size: 2rem
--sl-nav-gap: var(--sl-content-pad-x)
--sl-outline-offset-inside: -0.1875rem
```

## Z-Index Variables

```css
--sl-z-index-toc: 4
--sl-z-index-menu: 5
--sl-z-index-navbar: 10
--sl-z-index-skiplink: 20
```

## Usage Examples

### Using Accent Colors
```css
/* Teal primary color (pgflow custom) */
.element {
  background: var(--sl-color-accent);        /* #007b6e */
  color: var(--sl-color-accent-high);        /* #a3d4cb */
  border: 1px solid var(--sl-color-accent-low); /* #002b26 */
}
```

### Using Semantic Colors
```css
/* Info/Note styling (blue) */
.info {
  background: var(--sl-color-blue-low);      /* Dark blue bg */
  color: var(--sl-color-blue-high);          /* Light blue text */
  border-left: 4px solid var(--sl-color-blue); /* Blue border */
}

/* Warning/Caution styling (orange) */
.warning {
  background: var(--sl-color-orange-low);
  color: var(--sl-color-orange-high);
  border-left: 4px solid var(--sl-color-orange);
}
```

### Using Typography
```css
.heading {
  font-size: var(--sl-text-h2);
  line-height: var(--sl-line-height-headings);
  font-family: var(--__sl-font);
}

.code {
  font-size: var(--sl-text-code);
  font-family: var(--__sl-font-mono);
  background: var(--sl-color-bg-inline-code);
}
```
