# Your first change

You'll make the Archer Tower a bit different, play it, and send the change for review. You don't need to know how to code: your coding agent writes the code, and you decide what the game should feel like.

## Words you'll see

- **Terminal:** the text window where you type commands (Terminal on a Mac, PowerShell on Windows).
- **Repository (repo):** the project folder and its history, stored on GitHub.
- **Branch:** your own copy of the work, so nothing you try affects anyone else.
- **Commit:** a saved step with a short note.
- **Push:** send your commits from your computer up to GitHub.
- **Pull request (PR):** "here's my change, please look before it goes in."
- **`main`:** the shared version everyone builds from. Changes reach it only through a PR.
- **Coding agent:** the AI you talk to that edits the code for you.

## One-time setup

1. Make a [GitHub](https://github.com) account and send Joel your username, so he can add you to the repo. Accept the invite email.
2. Install [Git](https://git-scm.com), [Node.js](https://nodejs.org) 22.12 or newer, and the [GitHub CLI](https://cli.github.com).
3. Sign in to GitHub from the terminal. Choose "GitHub.com", "HTTPS", then "Login with a web browser":

   ```sh
   gh auth login
   ```

4. Install a coding agent that reads `AGENTS.md`, for example Claude Code, Codex or Cursor. Any of them works; we use a mix.
5. Get the game and run it:

   ```sh
   git clone https://github.com/joellithgow95/tower-defense-002
   cd tower-defense-002
   npm install
   npm run dev
   ```

   Open the address it prints. If you can play, setup is done.

## Make the change

Start your coding agent in the `tower-defense-002` folder and say something like:

> I'm new to this. Make a branch, then make the Archer Tower shoot a little farther but cost more. Explain each step.

Play it with `npm run dev`. Do you like it? Ask for adjustments until you do. Then:

> Run the checks, commit this, push my branch and open a pull request. Explain what each step does.

## What happens next

1. GitHub runs the checks on your PR automatically. A green tick means they passed; a red cross means something broke, so ask your agent to look at it.
2. Joel reads your PR, may leave comments, and merges it when it's ready. Ask your agent to make any changes he asks for on the same branch: the PR updates itself when you push again.
3. Once merged, your change is in `main` for everyone.

## Your next change

Always start from the latest `main`, so you build on everyone else's work. Tell your agent:

> Switch to main, pull the latest changes, then make a new branch for my next idea.

## Good habits

- Say what you want to *feel or see*, not how to code it.
- One idea per pull request. Small PRs get merged faster.
- If you don't understand something the agent says, ask it.
- If the agent wants to add a library, delete files or change how the game core works, ask Joel first.
- Never paste passwords or keys into chat, code or issues. This repo is public: anyone can read it.
