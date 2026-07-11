# Unlocked large box contextual Open routing

## Purpose

Verify a large box on the hero square exposes a player-facing container contextual action and that clicking it routes to the container loot/transfer flow, not the directional door-open command.

## Scenario file

`electron-poc/test/scenarios/container/unlocked-large-box-on-hero.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=container/unlocked-large-box-on-hero NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "container/unlocked-large-box-on-hero",
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
      "beatitude": "uncursed",
      "identityKnown": true
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
    "mapAffordances": [
      "container"
    ],
    "messages": [
      "unlocked large box containing 2 items"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=container/unlocked-large-box-on-hero` using the manual load command above.
2. Dismiss startup dialogs if present.
3. Confirm the context action bar shows `Open box` for the large box on the hero square.
4. Click `Open box`.
5. Inspect the container transfer panel.

## Expected visible facts and pass/fail criteria

- `Open box` appears as a container action, while adjacent door actions remain labeled with direction such as `Open east door`.
- Clicking `Open box` opens the container transfer panel for the large box.
- Container rows show food ration and dagger, not fallback selector labels.
- Inventory side shows tin opener and scroll of identify.
- The recent message log must not show `You see no door there` after clicking the box action.

Fail if the click routes to door-open semantics, if any expected row/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `real-scenario-container-mcp-test.js` uses this fixture for automated real Electron/CDP proof of the contextual Open box route.
