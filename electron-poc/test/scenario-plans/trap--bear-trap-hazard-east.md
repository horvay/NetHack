# Adjacent trap hazards and recovery item

## Purpose

Verify trap terrain setup can place multiple visible adjacent hazards and a nearby healing item for HP/message/status testing.

## Scenario file

`electron-poc/test/scenarios/trap/bear-trap-hazard-east.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=trap/bear-trap-hazard-east NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "trap/bear-trap-hazard-east",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": {
    "placement": "current"
  },
  "level": {
    "safeAreaAroundHero": 4,
    "lit": true,
    "suppressAdjacentMonsters": true,
    "pet": "none",
    "terrain": [
      {
        "at": "east",
        "type": "trap-bear"
      },
      {
        "at": "south",
        "type": "trap-pit"
      },
      {
        "at": "west",
        "type": "floor"
      }
    ]
  },
  "ground": [
    {
      "at": "west",
      "object": {
        "typeId": "POT_HEALING",
        "identityKnown": true,
        "beatitude": "uncursed",
        "beatitudeKnown": true
      }
    }
  ],
  "monsters": [],
  "inventory": [],
  "expectedPublicFacts": {
    "groundRows": [
      "potion of healing"
    ],
    "mapAffordances": [
      "bear trap east",
      "pit trap south"
    ],
    "messages": [
      "trap hazard fixture"
    ],
    "status": [
      "HP"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=trap/bear-trap-hazard-east` using the manual load command above.
2. Start the shim game.
3. Inspect east and south adjacent cells for bear trap and pit trap.
4. Optionally move east onto the bear trap or south into the pit in a sacrificial run.
5. Inspect HP/status/messages after triggering, then use or pick up the healing potion west if desired.

## Expected visible facts and pass/fail criteria

- East cell exposes bear trap affordance and south cell exposes pit trap affordance.
- West ground item is an uncursed potion of healing.
- Status area exposes HP.
- During the manual run, assert the trap trigger message and HP/status transition if you intentionally step onto a trap.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. Only basic scenario-loader sanity coverage is expected; do not treat this runbook as a request for new trap automation.

