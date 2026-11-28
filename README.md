# tower-defense-002

A low-poly fantasy **maze tower defense**, built with TypeScript and Three.js. The working name is temporary.

Two sides share a board. Your towers are also walls: enemy troops walk around them. Shooting towers stop troops, and spawner buildings send your own troops at the enemy castle. You can bend the route, but never seal it.

## Play it on your computer

You need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
npm install
npm run dev      # then open the address it prints
```

Click your half (left) to build. **1-3** pick a building, **X** sells the one under the mouse, **P** pauses, **R** restarts.

## Found a bug or have an idea?

[Open an issue](../../issues/new/choose). For a bug, press **Copy bug report** in the game *before restarting*, and paste it into the form. It lets us replay your match.

## Want to change something?

Start with [your first change](docs/first-change.md). You don't need to know how to code.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Play while editing; the page updates as you save |
| `npm run check` | All tests, type check and a production build |
| `npm run sim -- 20` | 20 bot-against-bot matches with no graphics |
| `npm run replay -- report.json` | Re-run a bug report |

## Where things are

- [`docs/plan.md`](docs/plan.md): what we're building, in order
- [`docs/design.md`](docs/design.md): the game's rules and ideas
- [`AGENTS.md`](AGENTS.md): rules for coding agents (and people)

- [`docs/README.md`](docs/README.md): creative vision, worldbuilding and decision index

## License

The code is [MIT](LICENSE): reuse it freely with credit. The game's world, story and creative writing in [`docs/`](docs/README.md) are not open-licensed; all rights reserved.
