---
description: Verify a change by actually driving the browser, not by curling the API. Catches the class of bug that passes every backend check.
argument-hint: "[what to verify, e.g. 'login flow' or '/outliers']"
---

# Verify in the browser

Verify: $1

## Why this command exists

On 2026-07-30 two real bugs shipped past a complete, passing backend test
suite:

- A new tenant with no data saw **another plant's mock numbers**, because
  the screen only replaced its placeholder state when the API returned a
  non-empty list. Every API call was correct.
- The `admin` account was reported broken. It wasn't — `/login` silently
  redirected away whenever a session cookie existed, so there was **no
  reachable login form** to switch accounts with. `curl` returned 200 the
  whole time.

Both are invisible to `curl`. The API was right and the product was wrong.
Anything a user *sees* has to be verified by looking.

## How

Use the `claude-in-chrome` tools. Load every tool you need in **one**
`ToolSearch` call.

1. **Drive the real flow**, don't just load a URL — click, type, submit,
   navigate away and back.
2. **Read the DOM, don't trust the screenshot.** Screenshots frequently
   capture the frame *before* an async fetch resolves, which reads as a bug
   that isn't there (and hides one that is). Confirm with
   `javascript_tool`:
   ```js
   await new Promise(r => setTimeout(r, 2500));
   document.body.innerText.match(/\d[\d,]* of [\d,]+ outliers/)
   ```
3. **Check the console** (`read_console_messages`) and the **network**
   (`read_network_requests`) for errors and for calls that never fired.
4. **Test the empty and failing paths, not just the happy one.** Patch
   `window.fetch` to stall or reject and confirm the UI shows a loading or
   error state — never stale placeholder data:
   ```js
   const orig = window.fetch;
   window.fetch = async (...a) =>
     String(a[0]).includes('/api/') ? Promise.reject(new TypeError('Failed to fetch')) : orig(...a);
   ```
5. **Verify as more than one identity.** Sign in as `cemex` and as `admin`
   (`docs/manual.md`) — and where isolation matters, as a throwaway tenant
   with no data. A screen that looks identical for every user is a screen
   that isn't reading real data.

## Specific traps in this app

- **Mock fallbacks.** Pulse, Channels, Agent and Library still render
  `buildMock()` unconditionally. They look populated for every tenant. Do
  not mistake that for working data.
- **Async swap.** Real data arrives after first paint. Something that looks
  right for a second may be placeholder.
- **Session redirects.** `proxy.ts` redirects before a page renders. If a
  route "doesn't work", check whether you ever reached it.

## Report

Say what you clicked, what you observed, and quote real values — ids,
counts, status codes. If you only checked the API, say that explicitly and
call the UI unverified.
