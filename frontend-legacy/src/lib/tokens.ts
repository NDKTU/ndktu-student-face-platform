/**
 * Design Tokens — NDKTU Admin Dashboard
 *
 * Direction: Clean, professional, restrained (shadcn/ui-aligned).
 * All values mirror the CSS custom properties defined in index.css.
 * Use these for any non-Tailwind contexts (e.g., inline styles, canvas drawings).
 */

export const tokens = {
  /** Core palette — maps to CSS vars */
  colors: {
    primary: 'hsl(221.2 83.2% 53.3%)',
    primaryForeground: 'hsl(210 40% 98%)',
    secondary: 'hsl(210 40% 96.1%)',
    secondaryForeground: 'hsl(222.2 47.4% 11.2%)',
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222.2 47.4% 11.2%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(222.2 47.4% 11.2%)',
    muted: 'hsl(210 40% 96.1%)',
    mutedForeground: 'hsl(215.4 16.3% 46.9%)',
    accent: 'hsl(210 40% 96.1%)',
    accentForeground: 'hsl(222.2 47.4% 11.2%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    border: 'hsl(214.3 31.8% 91.4%)',
    input: 'hsl(214.3 31.8% 91.4%)',
    ring: 'hsl(221.2 83.2% 53.3%)',
    // State colors
    success: 'hsl(142 71% 45%)',
    successForeground: 'hsl(0 0% 100%)',
    warning: 'hsl(38 92% 50%)',
    warningForeground: 'hsl(0 0% 100%)',
    info: 'hsl(199 89% 48%)',
    infoForeground: 'hsl(0 0% 100%)',
  },

  /** Typography scale */
  typography: {
    fontFamily: {
      sans: '"Inter", system-ui, -apple-system, sans-serif',
    },
    fontSize: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      base: '1rem',    // 16px
      lg: '1.125rem',  // 18px
      xl: '1.25rem',   // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '1.875rem', // 30px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.625',
    },
  },

  /** Spacing (multiples of 4px base unit) */
  spacing: {
    px: '1px',
    0.5: '0.125rem',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
  },

  /** Border radius */
  radius: {
    sm: '0.25rem',  // 4px
    md: '0.375rem', // 6px
    DEFAULT: '0.5rem', // 8px
    lg: '0.625rem', // 10px
    xl: '0.75rem',  // 12px
    full: '9999px',
  },

  /** Shadows */
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },

  /** Animation durations */
  duration: {
    fast: '150ms',
    DEFAULT: '200ms',
    slow: '300ms',
  },

  /** Component-specific sizing */
  component: {
    navbarHeight: '3.5rem', // 56px
    sidebarCollapsed: '3.5rem', // 56px
    sidebarExpanded: '15rem', // 240px
    inputHeight: {
      sm: '2rem',   // 32px
      md: '2.25rem', // 36px
      lg: '2.5rem', // 40px
    },
    buttonHeight: {
      sm: '2.25rem', // 36px
      md: '2.5rem',  // 40px
      lg: '2.75rem', // 44px
    },
  },
} as const;

export type ColorKey = keyof typeof tokens.colors;
export type SpacingKey = keyof typeof tokens.spacing;
