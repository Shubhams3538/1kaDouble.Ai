# 1kaDouble.Ai

A terminal coding assistant being built around sponsored access, with a Rust
backend and a TypeScript terminal client.

The goal is to let developers work with an AI coding assistant while a labelled
sponsor panel remains directly above the terminal input. The project is currently
a **local interactive prototype**. Responses are simulated; there is no AI
provider integration or advertising revenue yet.

## What works today

- A local Rust HTTP server with a JSON `/health` endpoint.
- A CLI that checks the backend connection at startup.
- A multiline editor with up to three visible rows and cursor-following scrolling.
- Multiline paste, arrow-key navigation, and Unicode-aware editing.
- Conversation history that preserves line breaks and wraps long messages.
- History scrolling while the sponsor and input remain in place.
- A static sponsor panel clearly labelled as a demo placement.
- Terminal resize handling that preserves the draft and cursor position.
- A compact message when the window is smaller than 40 columns × 16 rows.

The CLI stores its draft and conversation in memory for the running process.
They are not saved when the application exits. Submitted prompts receive a local
demo reply and are not sent to an AI model.

## Stack

- **Backend:** Rust, Axum, Tokio, and Serde.
- **CLI:** TypeScript, React, Ink, and `string-width`.
- **Development tools:** Cargo, Node.js, npm, `tsx`, and the TypeScript compiler.

Bun is not required. The backend and CLI are separate applications and run in
separate terminals during development.

## Requirements

- Node.js 24 and npm.
- A current stable Rust toolchain with Cargo.
- An interactive terminal of at least **40 columns × 16 rows**. A larger window
  leaves more room for conversation history.

Development has been checked locally on macOS with Node.js 24.18.1 and Rust
1.99.0. Linux and Windows have not yet been validated.

No API key, database, model download, or paid service is needed for this prototype.

## Run locally

Start from the repository root, which contains `backend/` and `apps/`.

### 1. Start the backend

In the first terminal:

```sh
cargo run --manifest-path backend/Cargo.toml
```

The backend listens at `http://127.0.0.1:3001`, accessible from your own computer.
Cargo downloads the declared Rust dependencies and compiles them on the first run.

### 2. Install and start the CLI

In a second terminal, starting from the repository root:

```sh
cd apps/cli
npm ci
npm run dev
```

The CLI should display `Connected to 1kadouble-backend`, a demo sponsor panel, and
an editable prompt. If the backend is unavailable, it displays a connection error;
the local demo editor remains available. Restart the CLI after starting the
backend to check the connection again.

### 3. Try a multiline message

Paste this into the prompt:

```text
Please inspect the Rust backend.
Explain how the /health endpoint works.
Check how the TypeScript CLI connects to it.
Do not make any changes yet.
```

Pasting leaves the text in the draft. Press Enter to submit it. The conversation
displays the message with its line breaks, followed by a clearly labelled demo
reply. This prototype does not inspect files or make changes in response.

Press Ctrl+C in each terminal to stop its application.

## Terminal controls

- **Enter:** submit the current draft.
- **Ctrl+J:** insert a newline.
- **Left / Right:** move through characters in the draft.
- **Up / Down:** move between the draft's visible or wrapped lines.
- **Backspace / Delete:** delete the previous or next character.
- **Home / End** or **Ctrl+A / Ctrl+E:** jump to the beginning or end of the draft.
- **Tab:** insert four spaces.
- **Page Up / Page Down** or **Ctrl+P / Ctrl+N:** scroll conversation history.
- **Ctrl+C:** exit.

The editor displays at most three rows. It retains the full draft and scrolls the
visible area as the cursor moves. Conversation history uses the remaining space
above the sponsor. When the window is too small, enlarge it to restore the editor.

## Check and build

Run these commands from `apps/cli`:

```sh
npm run check
npm run build
npm run start
```

- `check` checks TypeScript types without generating JavaScript.
- `build` checks types and writes compiled JavaScript to `dist/`.
- `start` runs the previously compiled CLI with Node.js.
- `dev` runs the TypeScript source through `tsx`; it does not replace type checking.

From the repository root, check the Rust backend with:

```sh
cargo check --manifest-path backend/Cargo.toml
cargo fmt --manifest-path backend/Cargo.toml --check
```

With the backend running, verify its health response:

```sh
curl -i http://127.0.0.1:3001/health
```

Expected body, with HTTP status `200` and content type `application/json`:

```json
{"status":"ok","service":"1kadouble-backend"}
```

## Project structure

```text
1kaDouble.Ai/
├── backend/
│   ├── Cargo.toml                 Rust package and dependencies
│   ├── Cargo.lock                 Resolved Rust dependency versions
│   └── src/main.rs                HTTP server and health endpoint
├── apps/
│   └── cli/
│       ├── package.json           CLI dependencies and commands
│       ├── package-lock.json      Resolved npm dependency versions
│       ├── tsconfig.json          TypeScript compiler settings
│       └── src/
│           ├── main.tsx           Terminal UI, editor, and demo history
│           ├── api/health.ts      Backend health request and validation
│           └── hooks/
│               └── useTerminalSize.ts
└── .gitignore
```

`backend/target/`, `apps/cli/node_modules/`, and `apps/cli/dist/` are generated
locally and excluded from Git. Both dependency lockfiles are committed.

## Planned architecture and next steps

The CLI will own the agent loop, context selection, local file tools, conversation
history, and permission prompts. The Rust backend will authenticate users, enforce
session and spending limits, select sponsor content, and forward permitted model
requests to a hosted AI provider. Provider credentials will stay on the backend.

Selected repository context will pass through the backend to the model provider;
the planned AI processing is not entirely on-device.

Upcoming milestones include:

1. Simulated streamed responses from Rust to the CLI.
2. Durable sessions and usage accounting before paid model calls.
3. One hosted AI provider with an agreed spending cap.
4. Local file tools, patch previews, and explicit command/edit approvals.
5. Conversation recovery, real accounts, and a controlled sponsor pilot.

Authentication, quotas, persistent storage, real AI responses, file tools, and
commercial sponsor delivery are not implemented yet. This prototype is intended
for local development.

## Troubleshooting

- **Connection failed:** confirm the Rust backend is running on port 3001, then
  restart the CLI. The startup health request has a five-second timeout.
- **Could not bind to port 3001:** another process may already be using the port.
  Check whether you have a previous backend instance running.
- **Resize message:** enlarge the terminal to at least 40 columns × 16 rows.
- **Recent source changes do not appear with `npm run start`:** run
  `npm run build` again, or use `npm run dev` during development.
- **`npm ci` fails after intentionally changing dependencies:** use `npm install`
  to update the lockfile, then commit both `package.json` and `package-lock.json`.
