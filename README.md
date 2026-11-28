# tower-defense-002

A low-poly fantasy **maze tower defense**, built with TypeScript and Three.js. The working name is temporary.

Two to four players share a board, one against one, free-for-all or in teams. Your towers are also walls: enemy troops walk around them. Shooting towers stop troops; barracks train troops into your castle, and you launch them at the enemy castle of your choice. You can bend the routes, but never seal them.

## Play it on your computer

You need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
npm install
npm run dev      # then open the address it prints
```

You are a spirit of the Lyth, the Wisp or the Mire (pick one at the bottom). Walk with **WASD**, the arrows, or by holding the mouse button (right button, or left away from you). Click a cell next to you to build there, or press **Q** to fly as a wisp and build anywhere on your land (tinted blue); each building spreads your land a few cells further. **1-2** pick a building, **X** sells the one under the mouse, **Space** launches your troops, **T** (or clicking an enemy castle) picks who to attack, **P** pauses, **R** restarts.

## Play online with friends

Go to **https://play.joellithgow.com**, press **Play online** and send your friends the invite link. Everyone picks a seat; empty seats are bots. The host picks the mode and starts. If you drop out, open the link again: you get your seat back.

To try online play on your own computer: `npm run online`, then open the address it prints in two tabs.

## Found a bug or have an idea?

[Open an issue](../../issues/new/choose). For a bug, press **Copy bug report** in the game *before restarting*, and paste it into the form. It lets us replay your match.

## Want to change something?

Start with [your first change](docs/first-change.md). You don't need to know how to code.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Play while editing; the page updates as you save |
| `npm run check` | All tests, type check and a production build |
| `npm run sim -- 20` | 20 bot-against-bot matches with no graphics (`npm run sim -- 20 ffa` for another mode in `src/core/config.ts`) |
| `npm run replay -- report.json` | Re-run a bug report |
| `npm run online` | Build, then run the online server (Cloudflare's `wrangler dev`) on your computer |

## Where things are

- [`docs/plan.md`](docs/plan.md): what we're building, in order
- [`docs/design.md`](docs/design.md): the game's rules and ideas
- [`docs/vision.md`](docs/vision.md): the creative direction we're exploring
- [`docs/README.md`](docs/README.md): every doc, including worldbuilding and decisions
- [`AGENTS.md`](AGENTS.md): rules for coding agents (and people)

## License

The code is [MIT](LICENSE): reuse it freely with credit. The game's world, story and creative writing in [`docs/`](docs/README.md) are not open-licensed; all rights reserved.
