# Coordinate object placement and container contents

## Purpose

Verify non-hero coordinate placement for ground piles and container contents with object metadata such as beatitude and poisoned ammo.

## Scenario file

`electron-poc/test/scenarios/object/coordinate-container-pile.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=object/coordinate-container-pile NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "object/coordinate-container-pile",
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
        "at": {
          "dx": 2,
          "dy": 1
        },
        "type": "floor"
      },
      {
        "at": {
          "dx": -2,
          "dy": 0
        },
        "type": "floor"
      }
    ]
  },
  "ground": [
    {
      "at": {
        "dx": 2,
        "dy": 1
      },
      "object": {
        "typeId": "CHEST",
        "locked": false,
        "trap": "none",
        "contents": [
          {
            "typeId": "POT_HEALING",
            "beatitude": "blessed",
            "beatitudeKnown": true,
            "identityKnown": true
          },
          {
            "typeId": "SCR_REMOVE_CURSE",
            "identityKnown": true
          },
          {
            "typeId": "ARROW",
            "quantity": 2,
            "poisoned": true
          }
        ]
      }
    },
    {
      "at": {
        "dx": -2,
        "dy": 0
      },
      "object": {
        "typeId": "FOOD_RATION",
        "quantity": 4
      }
    }
  ],
  "monsters": [],
  "inventory": [
    {
      "typeId": "LOCK_PICK"
    }
  ],
  "expectedPublicFacts": {
    "groundRows": [
      "chest",
      "4 food rations"
    ],
    "containerRows": [
      "potion of healing",
      "scroll of remove curse",
      "poisoned arrow"
    ],
    "inventoryRows": [
      "lock pick"
    ],
    "mapAffordances": [
      "coordinate ground objects",
      "container contents"
    ],
    "messages": [
      "coordinate container pile"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=object/coordinate-container-pile` using the manual load command above.
2. Start the shim game.
3. Move or inspect two east/one south for the chest and two west for food rations.
4. Open or inspect the chest if manually exercising the full path.

## Expected visible facts and pass/fail criteria

- Ground facts include chest and 4 food rations at coordinate offsets.
- Container contents include potion of healing, scroll of remove curse, and poisoned arrow.
- Inventory contains lock pick.
- Coordinate placement does not place objects on inaccessible terrain.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. Only basic scenario-loader sanity coverage is expected; do not treat this runbook as a request for new UI automation.

