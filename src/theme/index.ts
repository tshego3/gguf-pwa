import { createTheme, Modal, type MantineColorsTuple } from '@mantine/core';

const dark: MantineColorsTuple = [
  '#F5F5F5', // 0 - primary text
  '#999999', // 1 - secondary text
  '#2D2D2D', // 2 - elevated/slate
  '#1C1C1C', // 3 - surface/graphite
  '#131313', // 4 - background/canvas
  '#0D0D0D', // 5
  '#080808', // 6
  '#131313', // 7 - dark variant
  '#1C1C1C', // 8
  '#2D2D2D', // 9
];

// Mirrors native Theme.swift Dark (Monolithic Clarity) palette
export const tokens = {
  background: '#131313',
  surface: '#131313',
  surfaceContainerLow: '#1C1B1B',
  surfaceContainerHigh: '#2A2A2A',
  surfaceVariant: '#353534',
  elevated: '#2D2D2D',
  primary: '#FFFFFF',
  onPrimary: '#131313',
  onSurface: '#E5E2E1',
  onSurfaceVariant: '#C4C7C8',
  secondaryContainer: '#303030',
  outline: '#8E9192',
  outlineVariant: '#444748',
  error: '#FFAB0B',
  textPrimary: '#FFFFFF',
  textSecondary: '#C4C7C8',
  accent: '#FFFFFF',
  border: '#444748',
} as const;

export const theme = createTheme({
  primaryColor: 'dark',
  colors: { dark },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '600',
  },
  radius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  defaultRadius: 'sm',
  other: {
    tokens,
  },
  components: {
    // Not a visual change - this Mantine version ships its Modal close
    // button with no accessible name by default, caught by a real axe
    // "button-name" violation (P7 accessibility audit). Every Modal in the
    // app inherits this fix rather than needing closeButtonProps repeated
    // at each call site.
    Modal: Modal.extend({
      defaultProps: {
        closeButtonProps: { 'aria-label': 'Close dialog' },
      },
    }),
  },
});
