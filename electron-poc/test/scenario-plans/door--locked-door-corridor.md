# Locked door with corridor continuation

## Purpose

Verify terrain setup can create an impassable locked door adjacent to the hero plus corridor/floor cells beyond it for door-action UI testing.

## Scenario file

`electron-poc/test/scenarios/door/locked-door-corridor.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=door/locked-door-corridor NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "door/locked-door-corridor",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": {
    "placement": "current"
  },
  "level": {
    "safeAreaAroundHero": 3,
    "lit": true,
    "suppressAdjacentMonsters": true,
    "pet": "none",
    "terrain": [
      {
        "at": "east",
        "type": "door-locked"
      },
      {
        "at": {
          "dx": 2,
          "dy": 0
        },
        "type": "corridor"
      },
      {
        "at": {
          "dx": 3,
          "dy": 0
        },
        "type": "floor"
      }
    ]
  },
  "ground": [],
  "monsters": [],
  "inventory": [
    {
      "typeId": "LOCK_PICK"
    }
  ],
  "expectedPublicFacts": {
    "contextActions": [
      "open-door",
      "kick-door",
      "unlock-door"
    ],
    "inventoryRows": [
      "lock pick"
    ],
    "mapAffordances": [
      "locked door",
      "corridor east"
    ],
    "messages": [
      "locked door corridor fixture"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=door/locked-door-corridor` using the manual load command above.
2. Start the shim game.
3. Inspect the east adjacent map cell.
4. Click/open the context action bar for the east door or use NetHack open/unlock commands with east direction.
5. Use lock pick if exercising the unlock path.

## Expected visible facts and pass/fail criteria

- East cell is a locked door and not a passable floor.
- Inventory contains lock pick.
- Context/public facts include open-door, kick-door, and unlock-door.
- During the manual run, verify actual open/unlock prompts and the resulting map transition if you exercise the door action path.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. Only basic scenario-loader sanity coverage is expected; do not treat this runbook as a request for new door automation.

