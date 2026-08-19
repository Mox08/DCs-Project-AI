# DC's Project — AI Edition

This version adds a real DC AI chatbox powered through a small Node.js backend.

## Why a backend?

The OpenAI API key must stay on the server. Do not paste it into `index.html` or any browser JavaScript.

## Run it

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env`.
5. Put your OpenAI API key in `.env`:

```text
OPENAI_API_KEY=your_real_key_here
```

6. Start the website:

```bash
npm start
```

7. Open `http://localhost:3000` in your browser.

## Important

Do not open `index.html` directly with `file://` if you want DC AI to work. The website should be opened through the Node server so `/api/chat` is available.

The chatbox automatically sends the current Boolean analysis context (expression, simplified form, variables, row counts, gate counts, and verification state) to DC AI.
