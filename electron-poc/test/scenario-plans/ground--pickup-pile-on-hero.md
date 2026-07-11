# Multi-item ground pickup pile

## Purpose

Verify a scenario-created pile on the hero square appears in the pickup/ground transfer UI with quantities.

## Scenario file

`electron-poc/test/scenarios/ground/pickup-pile-on-hero.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=ground/pickup-pile-on-hero NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "ground/pickup-pile-on-hero",
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
        "typeId": "ARROW",
        "quantity": 3
      }
    },
    {
      "at": "hero",
      "object": {
        "typeId": "DAGGER"
      }
    },
    {
      "at": "hero",
      "object": {
        "typeId": "FOOD_RATION",
        "quantity": 2
      }
    }
  ],
  "monsters": [],
  "inventory": [
    {
      "typeId": "SCR_IDENTIFY",
      "identityKnown": true,
      "beatitudeKnown": false
    }
  ],
  "expectedPublicFacts": {
    "contextActions": [
      "pickup"
    ],
    "groundRows": [
      "3 arrows",
      "a dagger",
      "2 food rations"
    ],
    "inventoryRows": [
      "scroll of identify"
    ],
    "messages": [
      "pile of 3 items"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=ground/pickup-pile-on-hero` using the manual load command above.
2. Start the shim game.
3. Press comma or click the pickup contextual action.
4. Inspect the ground pickup/transfer panel and optionally pick up one stack.

## Expected visible facts and pass/fail criteria

- Ground rows show 3 arrows, a dagger, and 2 food rations.
- Inventory initially shows the scenario scroll of identify.
- The pickup panel uses item names and quantities, not raw selector/fallback labels.
- After pickup, messages/inventory reflect the chosen item.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-ground-pickup-mcp-test.js` also exists for incidental regression coverage.

