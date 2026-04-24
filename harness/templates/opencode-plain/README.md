# Opencode-plain workspace

This is the templated working directory for the `opencode-plain` scenario. The
harness copies this folder into each run's `runs/<id>/artifact/` before
starting opencode.

The agent should write the game entirely in `game.js`. `index.html` loads
Babylon.js 8 from CDN and includes `game.js` at the bottom — the agent should
not need to edit `index.html`.
