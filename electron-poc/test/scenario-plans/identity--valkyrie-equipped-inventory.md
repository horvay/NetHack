# Valkyrie identity and equipped inventory

## Purpose

Verify declared hero identity and hermetic equipped inventory are visible through public status, inventory, and paper-doll equipment UI.

## Scenario file

`electron-poc/test/scenarios/identity/valkyrie-equipped-inventory.json`

## Manual load command

From `electron-poc/`, build the fixture shim if needed and launch this scenario manually:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=identity/valkyrie-equipped-inventory NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

Then follow the post-load steps below in the visible Electron game.

## Full JSON scenario

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "identity/valkyrie-equipped-inventory",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": {
    "placement": "current",
    "role": "Valkyrie",
    "race": "human",
    "gender": "female",
    "alignment": "lawful"
  },
  "level": {
    "safeAreaAroundHero": 2,
    "lit": true,
    "suppressAdjacentMonsters": true,
    "pet": "keep"
  },
  "ground": [],
  "monsters": [],
  "inventory": [
    {
      "typeId": "LONG_SWORD",
      "identityKnown": true,
      "beatitude": "blessed",
      "beatitudeKnown": true,
      "enchantment": 1,
      "equipped": "wielded"
    },
    {
      "typeId": "SMALL_SHIELD",
      "beatitude": "uncursed",
      "beatitudeKnown": true,
      "equipped": "worn"
    },
    {
      "typeId": "LEATHER_ARMOR",
      "beatitude": "uncursed",
      "beatitudeKnown": true,
      "equipped": "worn"
    },
    {
      "typeId": "ARROW",
      "quantity": 12,
      "equipped": "quivered"
    },
    {
      "typeId": "WAN_DIGGING",
      "charges": 3,
      "identityKnown": true
    }
  ],
  "expectedPublicFacts": {
    "inventoryRows": [
      "blessed +1 long sword",
      "small shield",
      "leather armor",
      "12 arrows",
      "wand of digging"
    ],
    "equipmentRows": [
      "weapon",
      "wooden shield",
      "armor",
      "quiver"
    ],
    "status": [
      "Valkyrie",
      "female",
      "lawful"
    ],
    "messages": [
      "hermetic Valkyrie equipped inventory"
    ]
  }
}
```

## Post-load test steps

1. Launch the scenario with `NH_TEST_SCENARIO_ID=identity/valkyrie-equipped-inventory` using the manual load command above.
2. Start the shim game.
3. Confirm the visible status/hero presentation exposes Valkyrie/female/lawful where the UI supports it.
4. Press i to open the equipment/inventory screen.
5. Inspect equipped weapon, armor, shield, quiver, and charged wand rows.

## Expected visible facts and pass/fail criteria

- Status/identity channel includes Valkyrie, female, and lawful.
- Inventory shows blessed +1 long sword, small/wooden shield, leather armor, 12 arrows, and wand of digging (0:3).
- Paper doll slots show weapon/main hand, shield, body armor, and quiver.
- Starter Valkyrie gear not declared by the scenario (for example spear/oil lamp) is absent.

Fail if any expected row/cell/action is absent, if the UI shows fallback/developer labels, or if the shim emits `bridge_test_scenario_failed`, `Program in disorder`, or similar runtime errors.

## Runbook status

Primary status: **manual AI-agent runbook**. The markdown scenario and steps above are the deliverable; run them manually when this gameplay/UI coverage is needed.

Incidental existing coverage: `npm run test:scenario-loader` may sanity-load scenario JSON files that live under `electron-poc/test/scenarios/`. `real-scenario-identity-equipment-mcp-test.js` and screenshots under `electron-poc/test-output/real-scenario-identity-equipment/` also exist for incidental regression coverage.

