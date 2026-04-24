# Opencode-roblox workspace

Templated working directory for the `opencode-roblox` scenario. The agent
connects to Roblox Studio through the **Roblox Studio MCP** server that
Studio itself installs locally at `%LOCALAPPDATA%\Roblox\mcp.bat`.

Before starting a run:

1. Open Roblox Studio.
2. Load a blank baseplate place.
3. Confirm the Studio MCP integration is installed (Studio → "Install MCP for …"
   action has been run at least once on this machine).

At run start the harness writes an `opencode.json` into this run's `artifact/`
folder with the MCP block pre-configured — you don't edit it by hand. The
server name `Roblox_Studio` is what the agent will see in its tool namespace.

When the run is stopped, save the place file as `place.rbxl` in this run's
`artifact/` directory so it can be replayed for grading.
