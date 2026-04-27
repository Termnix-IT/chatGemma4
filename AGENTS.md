# AGENT.md

## Language
- Respond to the user in Japanese by default.
- Keep code, commands, file paths, API names, JSON keys, and other technical identifiers in their original English form.
- If the user explicitly asks for English, switch to English for that response.
- When technical terms first appear, add a short Japanese explanation only if it helps clarity.

## Project Overview
- `chatGemma` is a local React/Vite chat app for talking with an Ollama model.
- The frontend lives in `client/src`.
- The API server lives in `server/src`.
- Shared request/response types live in `shared`.
- Static assets are served from `public`.

## Development Commands
- Install dependencies: `npm install`
- Run frontend and server together: `npm run dev`
- Build production assets and server output: `npm run build`
- Start the built server: `npm start`

## Implementation Notes
- Prefer small, focused changes that match the existing React and CSS patterns.
- Keep UI text Japanese unless there is a strong reason to preserve English product labels.
- Preserve existing localStorage keys unless a migration is explicitly needed.
- Do not remove user-created chat history or settings code.
- For mascot and UI assets, keep final project assets under `public`.
- When changing frontend behavior, verify with `npm run build` and, when practical, the in-app browser at `http://127.0.0.1:5173/`.

## Styling Guidelines
- Keep the app UI restrained, readable, and utility-focused.
- Avoid unnecessary cards, decorative gradients, or visual effects that compete with the chat workflow.
- Maintain responsive behavior for both desktop and mobile widths.
- Respect `prefers-reduced-motion` when adding or changing animations.

## Safety
- Do not commit secrets, API keys, local logs with sensitive content, or private user data.
- Do not run destructive git or filesystem commands unless the user explicitly asks for them.
