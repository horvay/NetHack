# Room terrain cells, traps, water, lava, and stairs

## Purpose

Verify declarative map/terrain setup exposes exact public map semantics for high-value dungeon terrain.

## Scenario file

`electron-poc/test/scenarios/map/terrain-room-trap-water.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=map/terrain-room-trap-water NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "map/terrain-room-trap-water",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": {
    "placement": "current"
  },
  "level": {
    "safeAreaAroundHero": 5,
    "lit": true,
    "suppressAdjacentMonsters": true,
    "pet": "keep",
    "map": {
      "topLeft": {
        "dx": -3,
        "dy": -2
      },
      "rows": [
        "-------",
        "|....^|",
        "|..@~.|",
        "|..L<.|",
        "---/---"
      ]
    },
    "terrain": [
      {
        "at": {
          "dx": -1,
          "dy": 0
        },
        "type": "door-open"
      }
    ]
  },
  "ground": [
    {
      "at": {
        "dx": -2,
        "dy": 0
      },
      "object": {
        "typeId": "APPLE"
      }
    }
  ],
  "monsters": [],
  "inventory": [],
  "expectedPublicFacts": {
    "mapAffordances": [
      "wall",
      "open door",
      "trap",
      "water",
      "lava",
      "stairs"
    ],
    "groundRows": [
      "apple"
    ],
    "messages": [
      "terrain grid fixture"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=map/terrain-room-trap-water` using the manual load command above.
2. Start the shim game.
3. Inspect the visible map cells around the hero.
4. Hover/click cells if manually checking aria/tooltips.
5. Try pickup/context on the apple west of the hero if desired.

## Expected visible facts and pass/fail criteria

- Map contains wall, open door, trap, water, lava, and up-stair cells at the scenario-relative positions.
- Ground row/context exposes apple.
- Hero cell remains hero/player semantics, not monster semantics.
- No claim is made here about stair traversal or swimming/lava movement; this fixture currently proves the public stair cell/semantics, not travel.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-terrain-map-mcp-test.js` and screenshots under `electron-poc/test-output/real-scenario-terrain-map/` also exist for incidental regression coverage.

