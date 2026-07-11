# NetHack testing instructions

## Screenshot QA is mandatory

Always capture screenshots as part of testing for player-facing Electron/gameplay UI changes. Automated assertions are not enough by themselves.

Before passing or accepting a test run, personally open and inspect every screenshot the test captured. Look at the screenshots with a skeptical player mindset and explicitly call out anything that looks wrong, confusing, placeholder-like, developer-facing, stale, or out of the ordinary. Never pass a test without looking at its screenshots and checking them for problems.

Examples of unacceptable user-facing UI include raw fallback labels such as “Inventory selector j”, unexplained selector letters where item names should appear, intro/startup dialogue reappearing during gameplay, stale filters hiding rows, loading states that never resolve, controls that do not match the current prompt, wrong art/assets, half-rendered panels, or stale menus/prompts. If a screenshot contains anything a normal player should not see, treat it as a blocker and fix or report it; do not accept it because automated assertions passed.

For prompt/menu work, screenshots must prove the visible UI shows the actual player-meaningful choices: item names, action labels, contextual no-item choices, and clear confirm/cancel paths. Tests should assert against these user-facing labels where possible.

## Real-game MCP validation rule

For any player-facing Electron/gameplay UI change, including every Pyra GUI change, use MCP/real Electron gameplay automation to control the game and try the new feature end-to-end before claiming it works. Renderer-only injections, mocked `shim_add_menu` events, synthetic fixtures, unit tests, or DOM-only tests are useful but are not sufficient by themselves.

Required evidence for these changes:

1. Launch the real Electron app/game path.
2. Use MCP/CDP/visible app automation to perform the actual player action, such as pressing `i`, clicking a visible button, picking up items, quaffing, equipping, or opening a prompt.
3. Capture real gameplay screenshots of the result.
4. Open and inspect those screenshots manually before passing the test.
5. Assert on the visible player-facing UI in the real path, not just internal state.
6. If the real path differs from the synthetic test path, treat that as a blocker and fix the real path.

Do not mark a player-facing feature complete until this real-game MCP validation is documented in `employee-result.md` with screenshot paths, screenshot inspection notes, and the exact manual steps a player can use.

## Scenario runbook rule

The scenario files under `electron-poc/test/scenario-plans/` are manual AI-agent runbooks. They are not automation targets and should not be treated as a backlog of tests to automate. Use the referenced JSON scenarios by manually launching them with `NH_TEST_SCENARIO_ID` and following the markdown runbook steps when an agent needs to test that gameplay/UI behavior.

Do not add automation just because a scenario runbook exists. Keep the markdown runbooks focused on the JSON scenario, the manual launch command, post-load actions, expected visible facts, and pass/fail criteria for an AI agent to run manually as needed.
