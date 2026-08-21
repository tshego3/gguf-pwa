---
name: gguf-pwa-design-system
description: Monolithic Clarity dark theme and UI rules for gguf-pwa. Use when creating or editing ANY component, screen, style, layout, color, font, icon, animation, or accessibility concern - covers Mantine theming, the color palette, typography, spacing, the Chat/Models/Settings screens, and the inference-specific UI patterns (backend tier badge, download progress, context meter, storage accounting).
---

# Design System and UI Rules (Monolithic Clarity)

`src/theme/` is the single source of visual truth, consumed by `MantineProvider` at app initialization. The palette, typography, shape, and spacing rules are carried over from feeds-pwa unchanged - only the screens and interaction patterns are specific to this project.

## Theming Rules

1. **No hardcoded colors, font families, or spacing values in components** - use Mantine theme tokens, component props (`color`, `variant`, `size`), or CSS variables (`var(--mantine-color-*)`) exclusively.
2. If a component needs a design token in TypeScript, import from `src/theme/` - never inline the value.
3. Never override `MantineProvider` in child components.
4. **Consult the Mantine component API first** (https://mantine.dev/core/) before building custom UI - use `Paper`, `Card`, `AppShell`, `TextInput`, `ActionIcon`, `Modal`, `Progress`, `RingProgress`, `Badge`.
5. Use Mantine hooks (`useMediaQuery`, `useDisclosure`) for responsive behavior and UI state.

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background/Canvas (Charcoal) | `#131313` | Main app background |
| Surface (Graphite) | `#1C1C1C` | Containers, sidebar, message bubbles |
| Elevated (Slate Gray) | `#2D2D2D` | Hover states, active elements, inputs, code blocks |
| Primary Text (Off-White) | `#F5F5F5` | Main content text |
| Secondary Text (Muted) | `#999999` | Metadata, token counts, model sizes |
| Accent (White) | `#FFFFFF` | Active indicators, primary buttons |

- Depth through **tonal layering only** - no shadows. Background lightness tiers convey elevation.
- Glassmorphism for overlays: 80% opacity + 20px backdrop blur + 1px Slate Gray border.
- Soft 1px dividers using Slate Gray - no heavy borders.
- **Semantic color is separate from the accent** and is the one permitted addition: a warning tone for device-capability warnings and near-quota storage, an error tone for failed loads. Use Mantine's semantic colors; do not invent a second accent.

## Typography

1. **Inter** is the sole font family (Google Fonts or self-hosted in `public/fonts/`). No secondary fonts.
2. Headlines: tight letter-spacing (`-0.02em`), semi-bold. Body: 1.6 line-height. Labels: increased tracking.
3. Use Mantine `Title` and `Text` components; scale comes exclusively from the theme.
4. **Monospace only inside code blocks in assistant output.** Token counts, byte sizes, and tokens-per-second use Inter with `font-variant-numeric: tabular-nums` so digits do not jitter while streaming.

## Shape and Spacing

1. Rounded corners: 8px standard, 16px cards, 24px outer wrappers.
2. 4px baseline grid. Container padding: 24px desktop, 16px mobile.

## Styling Rules

1. **No `.module.css` files.** Centralize style objects if needed and import them.
2. Mobile-first responsive design: base styles target phone viewport; min-width media queries scale up. Test at 360px, 768px, 1280px+.
3. No `!important` unless overriding third-party styles with no alternative.
4. Animations must respect `prefers-reduced-motion`. The streaming cursor is an animation - it must stop too.

## Screen Specifications

1. **AppShell**: bottom tab navigation (mobile), left sidebar (desktop). Three tabs: Chat, Models, Settings. The desktop sidebar lists conversations.
2. **Chat**: message transcript, composer pinned to the bottom, stop button replacing send during generation. Per-message actions: copy, regenerate. The active model name and backend tier sit in the header, always visible.
3. **Models**: two acquisition cards presented as equal peers - "Load from this device" and "Download a model". Below them, installed models with source badge, size, and delete; then the catalog with per-model size, quantization, context length, licence link, and a device-suitability note.
4. **Settings**: capability probe readout (backend tier, WebGPU, isolation, OPFS, storage quota, device memory, engine version), generation parameters, `n_ctx` with its KV cache cost in MB, backend override, persistent-storage state, clear conversations.

## Inference-Specific UI Patterns

These are the patterns unique to this project. Get them right and the app explains itself.

1. **Backend tier badge.** Always visible in the Chat header. Tier A reads as normal; Tier C carries a muted "slower on this device" note. Never hide the tier - it is the honest explanation for the speed the user is getting.
2. **Download progress.** Show bytes downloaded against total, plus a percentage. A gigabyte needs a real progress bar, not a spinner. Cancel is always available and always visible.
3. **Consent before download.** A dialog naming the exact size, the licence, and the connection type. Never start a large download from a single tap.
4. **Context meter.** Tokens used against `n_ctx`, shown in the composer area. It turns warning-toned as the window fills, and the truncation policy is stated in words, not implied.
5. **Storage accounting.** Total usage against quota on both Models and Settings. When the iOS local-file path copies into OPFS, state the cost before the copy starts.
6. **Device-capability warning.** When a model exceeds the detected RAM tier, warn in place with specific words - the device, the model size, the likely outcome. **Warn, never block.** The user decides.
7. **Streaming.** Tokens append with a cursor affordance. Batch renders to animation frames; appending on every token repaints the transcript and drops frames on a phone.
8. **Model load.** A determinate progress state, not a spinner. Loading a 1 GB model takes seconds and the user must see it working.
9. **Reload-to-isolate.** If Tier B is available after a reload, offer it as an explicit action with a plain-language reason. Never reload the page silently.
10. **Empty first run.** No model installed routes to Models with both acquisition paths offered, not to an error.

## Interaction Patterns

1. Cards: subtle scale transform on press. Smooth screen transitions.
2. Desktop hover: Slate Gray background transition; active nav: 2px left white accent border.
3. Loading skeletons while conversations and the catalog load.
4. Stop is always reachable during generation, on every viewport, without scrolling.

## Accessibility

1. Semantic HTML (`<nav>`, `<main>`, `<section>`, `<button>`, `<article>`) - no `<div>` for interactive elements.
2. All inputs have `<label>`s. Keyboard navigation works everywhere; do not disable Mantine's `focusRing`. Send, stop, and conversation switching must all be keyboard-reachable.
3. ARIA only when semantic HTML is insufficient. Single `<h1>`, logical heading order, skip-to-content link.
4. **Streaming output needs `aria-live="polite"`** on the assistant message region, so a screen reader announces the reply without interrupting on every token.
5. Touch targets minimum 44px. Text contrast minimum 4.5:1 (WCAG AA).
6. Progress bars carry `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`.
7. Long code blocks in assistant output scroll inside their own container. The page body never scrolls horizontally at 360px.

## Asset Rules

1. **All images and visual assets must be real** - supplied by the business or approved stock. Strictly no AI-generated images or assets.
2. Missing asset: themed placeholder container with `<!-- TODO: replace with real asset -->` comment.
3. `@tabler/icons-react` for all UI icons. PWA icon is `public/favicon.svg` (any + maskable).

## Performance

1. Dynamic `import()` for screens and heavy modules (Vite code splitting). Import only needed Mantine components.
2. **Never let UI work compete with inference.** The engine runs in a worker; keep the render thread free during generation, and batch token renders to animation frames.
3. Virtualize long conversations. A transcript is an unbounded list.
4. SVG for icons. Defer non-critical scripts and styles.
5. Audit the bundle with `npx vite-bundle-visualizer` before major deploys. Confirm WASM binaries are served rather than inlined.
