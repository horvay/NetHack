# Unlocked chest transfer panel

## Purpose

Provide a manual AI-agent runbook for an unlocked container on the hero square with known contents and scenario inventory, then exercise the real container/open-transfer UI.

## Scenario file

`electron-poc/test/scenarios/container/unlocked-chest-on-hero.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=container/unlocked-chest-on-hero NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "container/unlocked-chest-on-hero",
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
        "typeId": "CHEST",
        "locked": false,
        "trap": "none",
        "contents": [
          {
            "typeId": "FOOD_RATION"
          },
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
    },
    {
      "typeId": "SCR_IDENTIFY",
      "identityKnown": true,
      "beatitudeKnown": false
    }
  ],
  "expectedPublicFacts": {
    "contextActions": [
      "open-container"
    ],
    "containerRows": [
      "food ration",
      "dagger"
    ],
    "inventoryRows": [
      "tin opener",
      "scroll of identify"
    ],
    "messages": [
      "unlocked chest containing 2 items"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=container/unlocked-chest-on-hero` using the manual load command above.
2. Dismiss startup dialogs if present.
3. Click or use the contextual action for the chest on the hero square (Open / open-container).
4. Inspect the container transfer panel.
5. Move or select an item if doing the full transfer smoke.

## Expected visible facts and pass/fail criteria

- Visible map/context indicates a container on the hero square.
- Container rows show food ration and dagger, not fallback selector labels.
- Inventory side shows tin opener and scroll of identify.
- Opening the chest does not show Program in disorder or a stale startup prompt.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-container-mcp-test.js` also exists for incidental regression coverage.

