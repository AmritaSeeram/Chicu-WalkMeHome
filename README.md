# Walk Me Home

## Landing page preview

This checkout contains a flattened subset of the original project. The documented `src/core/`, `src/sim/`, `src/bot.ts`, and several other source paths are absent. The engine, bot, and original test commands below require those files to be restored.

The new landing page is independent of that missing source tree. It contains a clearly labeled, browser-only walkthrough, not the live rules engine. It does not read locations, send messages, or call model APIs.

```sh
npm run dev              # http://localhost:3002
npm run build:web        # creates a static landing export in dist/
```

No dependencies need to be installed for the landing. Set `PORT=3003 npm run dev` to choose another port. Serve `web/` directly or publish `dist/` to a static host. `build:web` reads the root `default.json` to synchronize the illustrated timeline. The original flattened `build-web.ts` is retained for reference.


A safety layer for a small friend group (2 to 4 people), built for the Cubbie Hackathon (Track 3 group chat assistant, with a Track 2 agent-to-agent layer).
If someone goes quiet, a group-chat bot alerts the group and each friend's **personal agent** privately works out who should check on them.
Nobody has to open an app in an emergency.

**Live demo (simulated):** deploy `web/` to GitHub Pages (see below). **Honest status** is at the bottom.

## How it works
1. Maya's check-in time passes. Her own agent DMs her "You good?" and again after 5 min.
2. No answer at T+10: the group agent posts "Maya hasn't checked in since 9:40 PM. Last seen near the library."
3. The group agent relays the alert to every personal agent. An agent holding a plan Maya shared with that friend asks its student privately ("tell the group it's expected?"). If yes, the chat shows "Priya says this is expected" (details only if Maya allowed it) and the ladder **slows but never stops**.
4. After the wait window the group agent polls each personal agent. Agents answer with **only** `{studentId, etaMinutes, available}`.
5. Plain code ranks (ETA, then car, then least recently asked; unavailable friends are never asked) and asks the closest one. No or a 2 min timeout moves to the next. Once someone says yes, a car owner can be put on standby and one friend asked to call.
6. The group sees only outcomes ("Priya is heading to the library. Sam is calling"). At T+30 it posts the ASU Police call info (it is also in every alert).

| Layer | Where | Decides |
|---|---|---|
| Rules engine | `src/core/` (pure, no LLM, no network, no clock) | ranking, timeouts, ladder, slowdown, what may be shared |
| Personal agent | `src/agents/personalAgent.ts` | holds private context, answers only the group agent, only with ETA + available |
| Group agent | `src/agents/groupAgent.ts` | trigger, alert, relay, poll, ask, outcome. Every group message passes a leak check |
| LLM (Claude) | `src/llm/` | only (1) parses "10-hour shift Saturday" into a plan that code then validates, (2) optionally rewords approved messages; falls back to the template if it drops a fact or fails the leak check |
| Telegram | `src/platform/telegram.ts`, `src/bot.ts` | thin adapter: group + DMs + buttons |

## Run it
Needs Node 22.18+ (runs TypeScript directly, no build step, no dependencies to install).
```bash
npm test                 # 28 tests: ranking, ladder, sharing, leaks, adversarial, LLM guards, bot flow
npm run sim fine 7 --plan  # replay one simulated night (fine|missing, seed, optional --plan)
npm run eval             # 300 simulated nights per condition -> eval/results.md + results.json
npm run build:web        # exports the standalone landing into dist/ (see checkout note above)
```
**Telegram bot:** create a bot with @BotFather, copy `.env.example` to `.env`, set `TELEGRAM_BOT_TOKEN` (and `ANTHROPIC_API_KEY` for `/plan`), turn off bot privacy mode for the group (BotFather `/setprivacy`), then `node --env-file=.env src/bot.ts`.
In the group each friend sends `/join`; in a private chat with the bot each sends `/start`, `/optin`, shares a location and sets `/checkin 22:30`. `/start` lists every command.

## Privacy rules and the tests that enforce them
- Raw locations, schedules and reasons never leave their own agent. `tests/adversarial.test.ts`: other agents are refused, and even the group agent gets only 3 keys. `tests/leak.test.ts`: 600 simulated nights, 0 leaks.
- A plan is visible only to the friends the owner chose; the group sees "expected" unless the owner allowed details (`sharing.test.ts`, `leak.test.ts`).
- The tracked person owns it: opt-in required, `/pause`, `/deleteplans`, `/forgetme`, no covert mode (`adversarial.test.ts`).
- The bot never claims anyone is safe and every alert includes the ASU Police number (`messages.ts`, `leak.test.ts`).

## Results (simulated, 300 nights per row, `eval/results.md`)
| night / shared plans | friend asked | median first ask | median accept | fallback | police link at | leaks |
|---|---|---|---|---|---|---|
| fine / no plans | 63% | 15.0 min | 16.5 min | 23% | T+30 | 0 |
| fine / plans | 50% | 20.0 min | 21.7 min | 0% | T+30 | 0 |
| missing / no plans | 98% | 15.0 min | 16.5 min | 40% | T+30 | 0 |
| missing / plans | 98% | 20.0 min | 21.7 min | 1% | T+30 | 0 |

What this says, honestly: shared plans cut false-alarm asks (63% to 50%), **but they also delay the first ask by 5 minutes when someone really is missing**. That is the cost of the slowdown (config `slowdownFactor`). The police link is never delayed. The accept-rate difference in the missing rows comes from the simulated reply times interacting with the longer timeout, not from a real-world claim.

## Config
All timings are in `config/default.json` (pings, alert, wait window, ask timeout, T+30, slowdown, car standby, call backup). `loadConfig` rejects values that would let the ladder stop. ASU Police dispatch (480-965-3456) and 911 come from https://cfo.asu.edu/police-contact.

## Deploy the website (GitHub Pages)
Push to a GitHub repo, then Settings > Pages > Source: GitHub Actions. `.github/workflows/pages.yml` runs the tests, builds `web/index.html` and publishes it.

## Honest status
**Live-capable, but verified only against fakes:** the Telegram bot (`/join`, opt-in, locations, check-ins, plans, asks, outcomes), Claude plan parsing and wording. They are tested with a fake Telegram API and fake LLM functions. They have **not** been run against the real Telegram or Claude services by the author.
**Simulated:** every student, position, reply time and number in the results and the web demo.
**Not built:** ElevenLabs voice; routine-break triggers other than a missed daily check-in; config-driven alternate scenarios (ride request, group project gap).
**Known limits:**
- All agents run in one process. Privacy is enforced by typed messages, the sender check and the leak guard, not by process isolation.
- Maya's last point (coordinates) goes from her agent to the group agent, which hands it to friends' agents so they can compute ETA. Friends' agents never show it. The group sees only a label.
- Locations come from Telegram location messages and can be stale. ETA is straight-line walking distance (80 m/min).
- `config/places.json` landmark coordinates are approximate examples. Verify before relying on them.
- Telegram buttons can't open phone calls, so the police number is plain text that phones make tappable. Always call 911 in a real emergency; this app is not a substitute.
