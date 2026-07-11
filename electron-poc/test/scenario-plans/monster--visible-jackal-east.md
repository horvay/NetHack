# Visible adjacent hostile and tame monsters

## Purpose

Verify scenario monster placement produces visible monster map semantics and rows for a hostile jackal, hostile dwarf, hostile werejackal (`@` monster), and tame kitten.

## Scenario file

`electron-poc/test/scenarios/monster/visible-jackal-east.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=monster/visible-jackal-east NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "monster/visible-jackal-east",
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
        "type": "floor"
      },
      {
        "at": "west",
        "type": "floor"
      },
      {
        "at": "north",
        "type": "floor"
      },
      {
        "at": "south",
        "type": "floor"
      }
    ]
  },
  "ground": [],
  "monsters": [
    {
      "typeId": "JACKAL",
      "at": "east",
      "attitude": "hostile",
      "asleep": false,
      "hp": 4,
      "maxHp": 4
    },
    {
      "typeId": "DWARF",
      "at": "north",
      "attitude": "hostile",
      "asleep": false,
      "hp": 8,
      "maxHp": 8
    },
    {
      "typeId": "HUMAN_WEREJACKAL",
      "at": "south",
      "attitude": "hostile",
      "asleep": false,
      "hp": 4,
      "maxHp": 4
    },
    {
      "typeId": "KITTEN",
      "at": "west",
      "attitude": "tame",
      "asleep": false
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
      "jackal",
      "dwarf",
      "werejackal",
      "kitten",
      "tame"
    ],
    "mapAffordances": [
      "visible hostile monster",
      "visible tame monster"
    ],
    "inventoryRows": [
      "dagger"
    ],
    "messages": [
      "visible monster fixture"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=monster/visible-jackal-east` using the manual load command above.
2. Start the shim game.
3. Inspect adjacent east/north/south/west map cells and monster/context panel.
4. Optionally attack east with the wielded dagger to exercise combat adjacency.

## Expected visible facts and pass/fail criteria

- East cell shows a hostile jackal.
- North cell shows a hostile dwarf.
- South cell shows a hostile werejackal using monster semantics/art despite the `@` map glyph.
- West cell shows a tame kitten.
- Inventory contains a wielded dagger.
- Monster rows/facts include jackal, dwarf, werejackal, kitten, and tame.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-monster-map-mcp-test.js` also exists for incidental regression coverage.

