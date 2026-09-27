# Atlas AI: connecting the task robot to Claude

The search box understands requests like "where does rain go in downtown Chicago"
without any AI, using a rule-based planner. Connecting Claude makes it far more
flexible: it understands free-form requests and questions, chains several steps,
and answers in a sentence or two ("What's the tallest mountain in Africa?" flies to
Kilimanjaro, opens the Land view and tells you its height).

Claude acts only through Atlas's own abilities, as tools: fly to a place, switch on
layers, open a theme's view, show historical borders, open a tool. If Claude can't
be reached, the rule-based planner takes over.

There are two ways to connect.

## 1. Your own API key (quickest, just for you)

About (ⓘ) › Atlas AI › "My Anthropic API key". Paste a key from
<https://console.anthropic.com/>, choose a model and press Test. The key is stored
only in this browser and is sent only to `api.anthropic.com`. Don't use this on a
shared computer.

## 2. A proxy (for demos and for everyone who visits)

A tiny Cloudflare Worker holds the key, so visitors need nothing. It only accepts
requests from your site, only allows Atlas's models, caps answer length and
rate-limits each visitor (12 requests a minute).

```sh
npx wrangler deploy proxy/atlas-ai-worker.js --name atlas-ai
npx wrangler secret put ANTHROPIC_API_KEY          # paste the key
npx wrangler secret put ALLOWED_ORIGINS            # e.g. https://you.github.io,http://localhost:5173
```

Wrangler prints the Worker's URL, e.g. `https://atlas-ai.you.workers.dev`.

Then either:

- set it for everyone: in GitHub › Settings › Secrets and variables › Actions ›
  Variables, add `ATLAS_AI_PROXY` = the Worker URL. The Pages build passes it in
  as `VITE_ATLAS_AI_PROXY`, and Atlas uses it by default; or
- use it just for you: About › Atlas AI › "A proxy URL".

For local development: `VITE_ATLAS_AI_PROXY=https://atlas-ai.you.workers.dev npm run dev`.

Costs are billed to the key's Anthropic account. Each request is typically one to
three short model calls; "Fastest" (Claude Haiku 4.5) is the cheapest.
