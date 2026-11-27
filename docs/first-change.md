# Your first change

You'll make the Archer Tower a bit different, play it, and send the change for review.

## Words you'll see
- **Repository (repo):** the project folder and its history, stored on GitHub.
- **Branch:** your own copy of the work, so nothing you try affects everyone else.
- **Commit:** a saved step with a short note.
- **Pull request (PR):** "here's my change, please look before it goes in."

## One-time setup
Install [Git](https://git-scm.com), [Node.js](https://nodejs.org) 22.12 or newer, and your coding agent. Ask to be added to the repo, then in a terminal:

```sh
git clone https://github.com/joellithgow95/tower-defense-002
cd tower-defense-002
npm install
npm run dev
```

## Make the change
Start your coding agent in the project folder and say something like:

> I'm new to this. Make a branch, then make the Archer Tower shoot a little farther but cost more. Explain each step.

Play it with `npm run dev`. Do you like it? Ask for adjustments until you do. Then:

> Run the checks, commit this, push my branch and open a pull request. Explain what each step does.

## Good habits
- Say what you want to *feel or see*, not how to code it.
- One idea per pull request.
- If you don't understand something the agent says, ask it.
- Never paste passwords or keys into chat, code or issues. This repo is public: anyone can read it.
