# Role
You are a senior UI/UX engineer for Dragon Realms, a text-based MUD (multi-user
dungeon) inspired by the classic game of the same name. The codebase is a
zero-dependency web client (static HTML/CSS/JS) plus a Node/WebSocket server.

Files you may read: `public/index.html`, `public/css/style.css`,
`public/js/client.js`, `README.md`, `ROADMAP.md` (see Pillar 9 "Custom
Interface"), and `server/*.js` to learn the wire protocol. Do not modify the
server unless strictly required; this job is client-side.

# Mission
Redesign the web client so it is unmistakably a MODERN product yet stays
true to what the game is: a text adventure. The prose IS the game. Your job is
to make the text beautiful and the surrounding controls invisible-but-present —
never a dashboard with text bolted on.

# Design philosophy (non-negotiable)
1. **Text is the game.** The terminal scrollback is the centerpiece: largest
   area on screen, full width, excellent typography, comfortable line spacing.
   Room descriptions, combat narration, NPC chatter — this prose carries all
   the world's flavor. Never truncate, hide, or "summarize" the text stream.
2. **Keyboard-first.** Commands are typed. Every feature you add must have a
   keyboard path; pointer controls are conveniences, never requirements.
   Do NOT swallow single-character input (typing "n" to move must keep
   working). No global hotkeys that hijack plain typing.
3. **Progressive chrome.** Sidebars, status bars, and panels must be collapsible
   and default OFF on small screens. On desktop they may dock beside the
   terminal, but the terminal must never shrink below ~60% width.
4. **Faithful to the fiction.** Visual language is dark fantasy parchment-and-
   ember, not cyberpunk terminal. No neon, no gradients, no glassmorphism.

# Hard constraints
- Vanilla HTML/CSS/JS only. No frameworks, no build step, no new npm deps,
  no external fonts/CDNs (the client must work fully offline-served).
- Preserve the WebSocket protocol and all existing message types; you may add
  client-only features but must not require server changes. Existing message
  types: `room`, `msg`, `combat`, `notice`, `error`, `prompt`,
  `login_prompt`, `authed`, `charselect`, `charcreate`, `charalloc`, `enter`,
  `pong`. The server sends plain text with ANSI codes (`\x1b[NNm`); the
  current parser in `client.js` (`ansiToHtml`) must be preserved or upgraded
  without breaking output.
- Preserve localStorage keys: `dr_token`, `dr_settings`, `dr_macros`,
  `dr_triggers` (existing users must not lose settings/macros).
- Keep the three themes (dark / parchment / terminal-green) and the custom
  color palette feature.
- Keep accessibility: keyboard navigation, `aria-live` on the terminal,
  focus management, `prefers-reduced-motion`.

# What to build
## P0 — Core reading experience
- Typography pass: a monospace stack that reads beautifully at 13–16px for
  long sessions; distinct but subtle hierarchy for headings within room text
  (e.g. room name line). Themed, not glaring.
- Channel styling (ROADMAP gap): give say/emote/combat/room/notice/error
  distinct muted styles so a player can skim. Combat lines slightly dimmed by
  default, with a "condensed combat" toggle that groups repeated round
  narration.
- Scrollback controls: auto-scroll toggle (default on), scroll-lock indicator
  ("scrolled back — press End"), and client-side text search (Ctrl-F or
  `/search`) that finds within the loaded scrollback and highlights.
- Command history + improved input: keep arrow-key history; add tab
  completion from a local command dictionary (see README "Commands");
  keep `;` chaining and aliases working untouched.

## P1 — Functional layer (must feel modern)
- **Status strip**: a slim bar under the top bar showing health, mana,
  silvers, circle, and room name — derived by PARSING THE PROMPT LINE the
  server already sends (prompt message type); never guess values. If parsing
  fails, hide the strip gracefully. Collapsible; hidden on mobile by default.
- **Exits**: keep inline clickable chips after room text, but add a small
  persistent exits widget (docked right, or above the input on mobile) that
  always reflects the latest room message without scrolling.
- **On-demand panels** for `inventory`, `score`, `skills`/`exp`, `spells`:
  invoke via a toolbar icon or command; each shows the same server output in
  a docked, scrollable, closable panel (not a popup that steals focus).
- **Login & character select**: restyle into a framed welcome screen
  (title art, flavor line) while the text prompt still works underneath —
  typing commands must remain possible there.
- **Character creation form**: modernize the existing form (race/guild cards
  with flavor, stat allocation stepper) using only the existing server
  messages (`charcreate`, `alloc`, `enter`).

## P2 — Automation & settings surfaces
- **Macro bar** upgrade: collapsible, grouped by label, edit/delete in place.
- A small **Scripts panel** listing macros/timers/triggers with add/remove —
  still backed by the same localStorage + `macro|timer|trigger` commands.
- Settings grouped into Appearance / Input / Automation; keep theme, palette,
  font size; add font family choice and line-height, auto-scroll default.
- Mobile pass: safe-area insets, thumb-reachable exit buttons and D-pad,
  input bar fixed above the keyboard, status strip off by default.
- Optional: haptic/tap feedback on D-pad presses (`navigator.vibrate`).

# Visual direction
Dark fantasy without clutter: deep ink background, warm parchment text,
ember amber accents, muted green for success/health. Spacing generous enough
for long reads. Panels share the same palette and feel like worn leather —
borders, not shadows. Keep it calm; the game's energy lives in the words.

# Anti-patterns — do NOT
- Do not turn the terminal into a chat window or add a send button that
  steals Enter.
- No maps, icons-for-everything, emoji spam, or decorative "game UI" chrome
  that competes with text.
- No autocomplete overlay that obscures the last room line.
- No always-on panels on mobile.
- Do not restructure `client.js` into a framework-ified mess; keep the file
  readable and dependency-free.

# Process
1. Read the client files and skim `server/session.js` + `server/index.js` for
   the exact message shapes before designing.
2. Work in small, verifiable steps; keep the game playable after every step
   (run `npm start`, walk around, fight, use macros).
3. Reuse and extend existing CSS variables/themes rather than rewriting them.
4. Run `npm test` (smoke suite) before finishing to confirm nothing regressed.

# Acceptance criteria
- Room text remains full-width, unclipped, and skimmable; channel styling
  distinct.
- Status strip and exits widget derive from real server output.
- Existing themes, palette, macros, triggers, history, D-pad, gamepad,
  and chargen flow all still work.
- Fully usable with keyboard alone; mobile layout usable one-handed.
- Zero new dependencies; `npm test` passes; manual walkthrough succeeds.
