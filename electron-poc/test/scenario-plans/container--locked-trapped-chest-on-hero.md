# Locked trapped box affordances

## Purpose

Verify locked/trapped container state produces visible contextual choices and does not masquerade as a normal open chest.

## Scenario file

`electron-poc/test/scenarios/container/locked-trapped-chest-on-hero.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=container/locked-trapped-chest-on-hero NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "container/locked-trapped-chest-on-hero",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": {
    "placement": "current"
  },
  "level": {
    "safeAreaAroundHero": 2,
    "lit": true,
    "suppressAdjacentMonsters": true,
    "pet": "none"
  },
  "ground": [
    {
      "at": "hero",
      "object": {
        "typeId": "LARGE_BOX",
        "locked": true,
        "trap": "armed",
        "contents": [
          {
            "typeId": "DAGGER"
          }
        ]
      }
    }
  ],
  "monsters": [],
  "inventory": [
    {
      "typeId": "TIN_OPENER"
    }
  ],
  "expectedPublicFacts": {
    "contextActions": [
      "open-container",
      "force-container",
      "untrap-container"
    ],
    "containerRows": [
      "dagger"
    ],
    "inventoryRows": [
      "tin opener"
    ],
    "mapAffordances": [
      "container",
      "container.locked",
      "container.trapped"
    ],
    "messages": [
      "locked trapped large box"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=container/locked-trapped-chest-on-hero` using the manual load command above.
2. Start the shim game and focus the map.
3. Select the large box on the hero square or open the context action bar.
4. Try the visible untrap or force action path; cancel before destructive side effects if only auditing UI.

## Expected visible facts and pass/fail criteria

- Context actions include open-container, force-container, and untrap-container.
- Visible text identifies a locked trapped large box.
- Inventory contains tin opener.
- No fallback/debug labels appear in the prompt.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-locked-container-mcp-test.js` also exists for incidental regression coverage.

