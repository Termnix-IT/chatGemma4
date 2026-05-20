# AGENTS.md

## Language
- Respond to the user in Japanese by default.
- Keep code, commands, file paths, API names, JSON keys, and other technical identifiers in their original English form.
- If the user explicitly asks for English, switch to English for that response.
- When technical terms first appear, add a short Japanese explanation only if it helps clarity.

## Project Overview
- `chatGemma` is a local React/Vite chat app for talking with an Ollama model.
- The app has two modes: normal chat mode and Agent mode with Tool Calling.
- The frontend lives in `client/src`.
- The API server lives in `server/src`.
- Shared request/response types live in `shared`.
- Static assets are served from `public`.
- Mascot assets live under `public/mascot`.
- Agent tool implementations live under `server/src/tools`.
- `DESIGN.md` is the visual/interaction design specification added during the Claude Code design pass.
- Local planning notes such as `FUTURE_IDEAS.md` may be ignored by git.

## Development Commands
- Install dependencies: `npm install`
- Run frontend and server together: `npm run dev`
- Run frontend only: `npm run dev:client`
- Run API server only: `npm run dev:server`
- Build production assets and server output: `npm run build`
- Start the built server: `npm start`
- Preview built frontend assets: `npm run preview`

## Repository Structure
- `client/src/App.tsx`: Main React app, chat state, localStorage persistence, mode switching, Tool log rendering, settings panel, help content.
- `client/src/styles.css`: App layout, design tokens, theme variables, responsive behavior, mascot animation, and UI styling. Keep fixed topbar/sidebar/composer behavior intact.
- `server/src/index.ts`: Express API server, Ollama streaming bridge, mode split, Tool loop, `/api/health`, `/api/tools`.
- `server/src/tools/registry.ts`: Central registry for Agent tools. Add new Agent tools here after implementing the tool module.
- `server/src/tools/weather.ts`: Current weather and daily forecast tools, including Japanese location normalization and weekday/date labels.
- `server/src/tools/datetime.ts`: Current date/time tool.
- `server/src/tools/units.ts`: Unit conversion tool. Keep scope narrow; do not add currency conversion or arbitrary expression evaluation here.
- `shared/types.ts`: Shared API, Tool, and stream event types used by client and server.
- `public/`: Static assets. README screenshot is `public/readme-screenshot.png`; mascot assets are in `public/mascot`.
- `DESIGN.md`: Design source of truth for visual direction, tokens, component contracts, accessibility, and phased UI work.
- `.claude/`: Local Claude Code permissions and settings. This directory is ignored by git and is not app behavior.

## Implementation Notes
- Prefer small, focused changes that match the existing React and CSS patterns.
- Keep UI text Japanese unless there is a strong reason to preserve English product labels.
- Preserve existing localStorage keys unless a migration is explicitly needed.
- The current theme preference is stored in `localStorage` as `chatgemma.theme.v1` and applied via `document.documentElement.dataset.theme`.
- Do not remove user-created chat history or settings code.
- Conversations persist `mode` and `titleEdited`; preserve those fields when changing conversation state.
- Manual conversation titles must not be overwritten by automatic title generation.
- Conversation search filters local `localStorage` conversation data by title, mode, and message content.
- Conversation list grouping is implemented in `groupConversationsByDate` with Japanese labels: `今日`, `昨日`, `過去 7 日`, `それ以前`.
- For mascot and UI assets, keep final project assets under `public`.
- When changing frontend behavior, verify with `npm run build` and, when practical, the in-app browser at `http://127.0.0.1:5173/`.
- Keep the topbar, sidebar, and composer fixed; only the message/help surface should scroll.
- Sidebar item selection should not auto-close the sidebar. Use the list button to toggle it.
- Use `lucide-react` for UI icons before adding custom inline SVGs.
- Assistant message actions currently include copy and retry/regenerate for the latest assistant message. Keep them keyboard reachable.

## Agent Mode And Tool Calling
- Normal chat mode must not send `tools` to Ollama.
- Agent mode sends `agentToolDefinitions` from `server/src/tools/registry.ts`.
- Add Tool metadata to `agentToolSummaries` so `/api/tools` and the settings panel stay accurate.
- Tool results should be JSON strings with stable keys, then formatted for display in `client/src/App.tsx`.
- Tool stream events include `startedAt`, `completedAt`, and `durationMs`; preserve these when changing Tool execution.
- Tool messages render through `ToolBlock` as collapsible `<details>` blocks. Keep the collapsed summary readable and preserve the full content when expanded.
- Keep Tool Calling bounded and safe. Avoid adding local file access, shell execution, external account access, or arbitrary code evaluation without explicit design and permission UI.
- Weather forecast dates should include Tool-generated weekday labels. Do not rely on the model to infer weekdays from dates.
- Weather geocoding should handle Japanese location names and user phrases such as `東京の天気予報` by normalizing to location candidates before calling Open-Meteo.

## Styling Guidelines
- Follow `DESIGN.md` for new UI work. If `DESIGN.md` and current implementation differ, inspect `client/src/App.tsx` and `client/src/styles.css` before deciding whether to complete the design spec or preserve the current shipped behavior.
- Claude Code's design pass introduced a quiet, focused chat UI direction: neutral surfaces, sparse accent use, tokenized colors, light/dark themes, collapsible tool blocks, suggestion pills, sidebar date groups, and a desktop collapsed icon rail.
- Keep the app UI restrained, readable, and utility-focused.
- Avoid unnecessary cards, decorative gradients, background images, or visual effects that compete with the chat workflow. The mascot is the bounded exception.
- Prefer CSS custom properties in `:root` and `:root[data-theme="dark"]` over raw colors in component rules.
- Keep `letter-spacing: 0` for Japanese readability.
- Keep motion short and respect `prefers-reduced-motion` for mascot and UI animations.
- Maintain responsive behavior for both desktop and mobile widths.
- Keep mascot animation subtle and avoid movement that interferes with text input or action buttons.
- The desktop sidebar collapses to a 56px rail; mobile sidebar behaves as a drawer at the 760px breakpoint.
- The composer uses a rounded elevated card with the mode segmented control, hint text, and round send/stop button. Do not let the idle mascot overlap the textarea or send button.
- Empty state suggestion pills should fill the textarea only; they must not auto-submit.
- Test both light and dark themes when changing UI tokens or component surfaces.

## Wrap-up Checklist
- Run `npm run build` after code changes.
- Check `git status --short --ignored` before handing off.
- Remove ignored generated `dist/` after build if the user wants the repo folder kept tidy.
- Stop local dev servers when the user asks to pause or end work.

## Safety
- Do not commit secrets, API keys, local logs with sensitive content, or private user data.
- Do not run destructive git or filesystem commands unless the user explicitly asks for them.
- `FUTURE_IDEAS.md` and `.claude/` are currently ignored by git in this repo; mention this if the user expects those local notes or tool settings to be pushed.
