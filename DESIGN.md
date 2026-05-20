# DESIGN.md

Design specification for `chatGemma` UI/UX. This document is the source of truth
for visual and interaction design. When adding or modifying UI, follow the
tokens and component contracts here so new features stay consistent with
existing ones.

- Scope: visual design, layout, interaction patterns, design tokens.
- Out of scope: feature logic, API contracts, data model (see `AGENTS.md`).
- Language: spec is in English; user-facing UI strings remain Japanese.

---

## 1. Direction

"Quiet, focused, modern AI chat." Neutral surfaces, minimal chrome, content
(the conversation) is the hero. Reference peers: Claude.ai, Linear, ChatGPT.

Principles:
- Speak with whitespace, not borders or shadows.
- One accent color, used sparingly for primary action and active state only.
- Hierarchy comes from type and spacing, not from cards and dividers.
- Light and dark are first-class peers; nothing is hard-coded to one mode.
- Motion is short (≤180ms), purposeful, and disabled under
  `prefers-reduced-motion`.

---

## 2. Design Tokens

All tokens MUST be defined as CSS custom properties on `:root` (light) and
`:root[data-theme="dark"]` (dark). Components reference tokens, never raw hex.

### 2.1 Color — Light

| Token                  | Value     | Use                                  |
| ---------------------- | --------- | ------------------------------------ |
| `--bg`                 | `#FAFAF9` | App background                       |
| `--bg-elevated`        | `#FFFFFF` | Input row, settings panel, popovers  |
| `--bg-sunken`          | `#F2F1EE` | Sidebar, subtle panels               |
| `--bg-hover`           | `#ECEAE4` | Hover fill on neutral surfaces       |
| `--bg-active`          | `#E4E1D9` | Active/pressed state                 |
| `--border`             | `#E8E6E1` | Hairline dividers, input borders     |
| `--border-strong`      | `#D8D4C9` | Emphasized borders (rare)            |
| `--text`               | `#1A1A1A` | Primary text                         |
| `--text-muted`         | `#6B6B6B` | Secondary text, metadata             |
| `--text-faint`         | `#9A9A95` | Placeholders, timestamps             |
| `--accent`             | `#C96442` | Primary action, active indicator     |
| `--accent-hover`       | `#B5573A` | Hover on accent surfaces             |
| `--accent-contrast`    | `#FFFFFF` | Text on accent fill                  |
| `--success`            | `#3F8F5E` | OK status dot, success affordances   |
| `--warn`               | `#B07B1A` | Warn status dot                      |
| `--error`              | `#B0473D` | Error status dot, destructive text   |
| `--tool-accent`        | `#5A8A7F` | Tool blocks, agent affordances       |

State colors are intentionally desaturated; they signal, they do not shout.

### 2.2 Color — Dark

| Token                  | Value     |
| ---------------------- | --------- |
| `--bg`                 | `#0E0E0F` |
| `--bg-elevated`        | `#1A1A1C` |
| `--bg-sunken`          | `#161617` |
| `--bg-hover`           | `#222225` |
| `--bg-active`          | `#2A2A2E` |
| `--border`             | `#2A2A2E` |
| `--border-strong`      | `#3A3A3F` |
| `--text`               | `#ECECEA` |
| `--text-muted`         | `#9A9A95` |
| `--text-faint`         | `#6B6B68` |
| `--accent`             | `#D87559` |
| `--accent-hover`       | `#E58A70` |
| `--accent-contrast`    | `#16100D` |
| `--success`            | `#4FA577` |
| `--warn`               | `#C99540` |
| `--error`              | `#C96458` |
| `--tool-accent`        | `#6FA89B` |

### 2.3 Typography

- Family: `Inter, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`.
- Mono: `"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace`.
- Sizes (use these only, no ad-hoc rem values):
  - `--fs-xs`: 12px — timestamps, captions
  - `--fs-sm`: 13px — secondary text, metadata
  - `--fs-base`: 15px — body, message text, inputs
  - `--fs-md`: 17px — section titles
  - `--fs-lg`: 20px — page titles
  - `--fs-xl`: 28px — empty-state hero
- Line height: 1.55 for UI, 1.75 for message body and long-form text.
- Weight: 400 body, 600 emphasis, 700 reserved for primary buttons/headings.
- `letter-spacing: 0` everywhere (Japanese reads worse when tracked).

### 2.4 Spacing

8px base scale. Use only these steps:
`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`,
`--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`.

### 2.5 Radius

- `--radius-sm`: 6px — chips, inline tags
- `--radius-md`: 10px — buttons, list items
- `--radius-lg`: 14px — message bubbles, tool blocks
- `--radius-xl`: 18px — composer card
- `--radius-full`: 999px — pills, status dots, avatars when round

### 2.6 Shadow

Used sparingly. Prefer borders + sunken backgrounds for separation.

- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.04)` — input row resting
- `--shadow-md`: `0 4px 16px rgba(0,0,0,0.06)` — composer card, dropdowns
- `--shadow-lg`: `0 12px 32px rgba(0,0,0,0.10)` — settings drawer, modals

Dark mode: replace `rgba(0,0,0,...)` with `rgba(0,0,0,0.4)` equivalents and
add an inner highlight `inset 0 1px 0 rgba(255,255,255,0.04)` on elevated
surfaces.

### 2.7 Motion

- Duration: `--dur-fast: 120ms`, `--dur-base: 160ms`, `--dur-slow: 220ms`.
- Easing: `--ease-standard: cubic-bezier(0.2, 0, 0, 1)` (iOS-like).
- All animations MUST be wrapped so `prefers-reduced-motion: reduce` disables
  non-essential motion (mascot, message enter, drawer slide).

### 2.8 Z-index scale

`--z-base: 0`, `--z-sticky: 10`, `--z-drawer: 40`, `--z-modal: 60`,
`--z-toast: 80`. No raw z-index in components.

---

## 3. Layout

- App shell: `grid-template-columns: 272px minmax(0, 1fr)` (down from 284).
- Collapsed sidebar (desktop): `56px` icon rail, NOT `0`. New chat / search /
  help / settings remain reachable.
- Topbar height: 56px desktop, 52px mobile (down from 64/58).
- Message column max-width: 760px (down from 860) for better line length at
  15px body.
- Composer max-width matches message column.
- Mobile breakpoint stays at 760px. Sidebar becomes a drawer.

---

## 4. Components

### 4.1 Topbar

- Background: `var(--bg)` with `backdrop-filter: blur(12px)` and 92% opacity.
- Bottom hairline: `1px solid var(--border)`.
- Left cluster: sidebar toggle (icon, 36px hit area) + current model name
  (text-muted, `--fs-sm`) + status dot.
- Right cluster: theme toggle, settings icon. Icons are 18px in a 36px square.
- No title text in topbar; the conversation title lives only in the sidebar.

### 4.2 Sidebar

- Background: `var(--bg-sunken)`. No black fill.
- Sections (top to bottom): new chat button, search, conversation list,
  footer (help + settings).
- New chat: full width, `--radius-md`, accent fill, `--fs-sm`, weight 600.
- Search: ghost input on `var(--bg-hover)`, 36px tall, leading search icon.
- Conversation item:
  - 40px min-height, `--radius-md`, padding `0 12px`.
  - Title: `--fs-sm`, single line, ellipsis.
  - Meta line (date + message count): `--fs-xs`, `--text-faint`.
  - Hover: `var(--bg-hover)`. Active: `var(--bg-active)` + 2px left bar in
    `var(--accent)`.
  - Edit/delete actions appear on hover only (right side, icon buttons).
- Conversation list groups by date: `Today / Yesterday / Previous 7 days /
  Older`. Group headers `--fs-xs`, `--text-faint`, uppercase off, weight 600.
- Footer separated by `1px solid var(--border)`, no heavy contrast.

### 4.3 Message Row

Goal: text-first. Remove the bordered/shadowed card feel.

- Row gap: 28px desktop, 24px mobile.
- Avatar: 28px square, `--radius-md`. Show on the FIRST message of a
  consecutive run from the same role; subsequent rows indent without avatar.
- User message:
  - Right-aligned, max-width 75% of column.
  - Background: `var(--bg-sunken)` (light) / `var(--bg-elevated)` (dark).
  - Padding: 10px 14px. Radius: `--radius-lg`. NO shadow.
- Assistant message:
  - No background, no border. Plain text on app background.
  - Markdown styles per existing rules (code blocks keep dark theme regardless
    of mode — they are syntax surfaces, not chat surfaces).
- Tool message:
  - Collapsible block. Default state: single-line summary
    `[tool name] · [duration] · [short result]` with a chevron.
  - Expanded: full JSON / formatted result, monospace, `var(--bg-sunken)`
    background, 3px left border in `var(--tool-accent)`, `--radius-lg`.
  - Preserve `startedAt`, `completedAt`, `durationMs` in the rendered meta.
- Row hover (assistant only): a small action cluster appears at the bottom of
  the message — Copy / Regenerate / (future: edit). 28px icon buttons, ghost
  style. Hidden on touch devices.

### 4.4 Composer

- Card style: `var(--bg-elevated)`, `--radius-xl`, `1px solid var(--border)`,
  `var(--shadow-md)`.
- Padding: 12px 12px 10px.
- Stack:
  - Textarea (no border, no outline, `--fs-base`, line-height 1.55,
    min-height 44px, max-height 200px, auto-grow).
  - Bottom bar (flex row, space-between):
    - Left: mode toggle (Normal / Agent) as a 2-button segmented control,
      ghost style inside the composer.
    - Right: send button — 36px round, `var(--accent)` fill,
      `var(--accent-contrast)` icon. Disabled state at 0.4 opacity.
- Placeholder hint includes `Enter で送信 / Shift+Enter で改行` in
  `--text-faint`, `--fs-xs`.
- Mascot: positioned OUTSIDE the composer card, anchored bottom-right of the
  workspace with `pointer-events: none`. Does not overlap the textarea or the
  send button at any width.
- Safe area: composer padding adds `env(safe-area-inset-bottom)` on mobile.

### 4.5 Empty State

- Centered vertically in the message surface.
- Mascot at top (existing asset, keep subtle bob animation).
- H1: `--fs-xl`, weight 700.
- Sub: one short line, `--text-muted`, `--fs-base`.
- Suggestion pills: 3–4 sample prompts as horizontal pills below the sub.
  - Pill: `var(--bg-elevated)`, `1px solid var(--border)`, `--radius-full`,
    `--fs-sm`, padding 8px 14px. Hover: `var(--bg-hover)`.
  - Click fills the textarea but does NOT auto-submit.
- Agent mode: append a compact "Available tools" row (chips, tool-accent
  border) below the pills.

### 4.6 Settings Drawer

- Right-aligned drawer, width 400px (380px mobile = full width minus 16px).
- Background: `var(--bg-elevated)`.
- Field: label (`--fs-sm`, weight 600) + input (`--radius-md`, `--fs-base`) +
  optional help text (`--fs-xs`, `--text-faint`).
- Tool list: cards with `--radius-md`, `1px solid var(--border)`, no shadow.
- Close affordance: X button top-right + click-outside + Esc.

### 4.7 Status Dot

12px round, no border. Color via `--success / --warn / --error / --text-faint`.
Paired with `--fs-sm` text label, never used alone.

### 4.8 Buttons

- Primary: accent fill, `--accent-contrast` text, `--radius-md`, 36px tall,
  weight 600. Hover: `--accent-hover`.
- Secondary: `var(--bg-sunken)` fill, `--text` text. Hover: `var(--bg-hover)`.
- Ghost (icon button): transparent, `--text-muted` icon. Hover:
  `var(--bg-hover)`, `--text` icon.
- Destructive: text in `--error`, ghost background. Confirm before firing.
- Focus ring (all buttons and inputs): `0 0 0 2px var(--bg)`,
  `0 0 0 4px var(--accent)` outer — visible on keyboard focus only
  (`:focus-visible`).

---

## 5. Theming

- Default to `prefers-color-scheme`.
- Manual override: `data-theme="light"` or `data-theme="dark"` on `<html>`,
  persisted in `localStorage` under `theme` (new key, additive — does not
  touch existing keys).
- Theme toggle lives in the topbar.

---

## 6. Accessibility

- All interactive elements have a visible `:focus-visible` ring.
- Color contrast: body text ≥ 4.5:1 against its background in both themes.
- Hit areas: 36px minimum for touch targets.
- Motion respects `prefers-reduced-motion`.
- Markdown headings inside messages stay semantic (`h3`+), never `h1/h2`.

---

## 7. Do / Don't (for future additions)

Do:
- Reuse tokens. If a new component needs a color, add a token first.
- Match existing radius scale. New 11px radii are not allowed.
- Use spacing scale steps; no `padding: 13px`.
- Test both themes before considering UI work done.
- Keep new affordances reachable from keyboard.

Don't:
- Add new shadows beyond the three defined.
- Introduce a second accent color. If you need to differentiate, use
  `--tool-accent` for agent/tool surfaces; otherwise rely on type and spacing.
- Add background images, gradients, or decorative illustrations to chat
  surfaces (mascot is the exception and stays bounded).
- Hard-code hex values in component CSS.
- Auto-submit on user actions other than Enter / send button.

---

## 8. Implementation Phases

The redesign is split so each phase ships a coherent improvement and does
not leave the UI in a half-styled state.

Phase 1 — Token foundation (no visual regression expected)
- Introduce CSS variables for color, type, space, radius, shadow, motion.
- Refactor `styles.css` to consume tokens; keep current light-mode values
  mapped 1:1 first, then swap to the new palette.

Phase 2 — Surfaces and color
- Apply new neutral palette (Direction A).
- Replace black sidebar with `--bg-sunken`.
- Adjust topbar, composer borders/shadows to spec.

Phase 3 — Messages
- New user/assistant/tool message styling.
- Collapsible tool blocks.
- Hover action cluster on assistant messages.

Phase 4 — Composer and empty state
- New composer card, segmented mode toggle inside, round send button.
- Empty-state suggestion pills + (agent mode) tool chips.

Phase 5 — Dark mode
- Add `data-theme` attribute, theme toggle in topbar, persisted preference.
- Verify every component in dark.

Phase 6 — Polish
- Sidebar date grouping, collapsed icon rail.
- Focus rings, motion easing pass, reduced-motion audit.

Each phase ends with `npm run build` and a manual pass at desktop + mobile
widths in both themes (from Phase 5 onward).
