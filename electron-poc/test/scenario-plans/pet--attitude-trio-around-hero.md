# Tame, peaceful, and hostile monster attitudes

## Purpose

Provide a manual AI-agent runbook for all three player-relevant monster attitudes around the hero for map semantics and target-safety checks.

## Scenario file

`electron-poc/test/scenarios/pet/attitude-trio-around-hero.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=pet/attitude-trio-around-hero NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "pet/attitude-trio-around-hero",
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
        "at": "west",
        "type": "floor"
      },
      {
        "at": "north",
        "type": "floor"
      },
      {
        "at": "east",
        "type": "floor"
      }
    ]
  },
  "ground": [],
  "monsters": [
    {
      "typeId": "KITTEN",
      "at": "west",
      "attitude": "tame",
      "asleep": false
    },
    {
      "typeId": "LICHEN",
      "at": "north",
      "attitude": "peaceful",
      "asleep": true,
      "hp": 3,
      "maxHp": 3
    },
    {
      "typeId": "GOBLIN",
      "at": "east",
      "attitude": "hostile",
      "asleep": false,
      "hp": 6,
      "maxHp": 6
    }
  ],
  "inventory": [
    {
      "typeId": "DAGGER",
      "equipped": "wielded"
    }
  ],
  "expectedPublicFacts": {
    "monsterRows": [
      "kitten",
      "tame",
      "peaceful lichen",
      "hostile goblin"
    ],
    "inventoryRows": [
      "dagger"
    ],
    "mapAffordances": [
      "adjacent tame monster",
      "adjacent peaceful monster",
      "adjacent hostile monster"
    ],
    "messages": [
      "monster attitude trio fixture"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=pet/attitude-trio-around-hero` using the manual load command above.
2. Start the shim game.
3. Inspect west, north, and east adjacent monster cells.
4. Open context/monster details if available.
5. Optionally attempt movement/attack decisions to ensure tame and peaceful actors are distinguished from hostile ones.

## Expected visible facts and pass/fail criteria

- West adjacent cell is a tame kitten.
- North adjacent cell is a peaceful sleeping lichen.
- East adjacent cell is a hostile goblin.
- Inventory contains a wielded dagger for explicit combat follow-up.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. Only basic scenario-loader sanity coverage is expected; do not treat this runbook as a request for new pet/attitude automation.

