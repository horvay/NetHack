---
name: nethack-scenario-fixtures
description: Create and maintain NetHack Electron JSON scenario fixture tests under electron-poc/test/scenarios with the expanded v1 schema, safe resolver, fail-closed validation, and real Electron/MCP proof expectations.
---

# NetHack scenario fixtures

Use this skill when adding or changing Electron NetHack JSON scenario fixtures and tests.

## What this framework is

This is a **fixture-only v1 framework** for the Electron test suite. It is intended to become the main way to set up hermetic NetHack/Electron gameplay tests: JSON scenario -> safe load -> real UI/game actions -> public assertions. It is not a production mutator or renderer/preload API.

Scenario JSON files live under:

- `electron-poc/test/scenarios/...`

The bridge resolves by safe ID only:

- `NH_TEST_SCENARIO_ID=monster/visible-jackal-east`
- to `electron-poc/test/scenarios/monster/visible-jackal-east.json`

Do not expose or pass direct arbitrary `NH_TEST_SCENARIO` paths from renderer/preload/product code.

## Supported expanded v1 schema

Every scenario is a strict JSON object with these top-level fields:

```json
{
  "schema": "nethack-electron-test-scenario/v1",
  "id": "category/scenario-name",
  "phase": "after-level-and-hero-before-first-draw",
  "hero": { "placement": "current" },
  "level": { "safeAreaAroundHero": 2, "lit": true, "suppressAdjacentMonsters": true, "pet": "none" },
  "ground": [],
  "monsters": [],
  "inventory": [],
  "eventResults": [{ "event": "drink-fountain", "result": "monster-detection" }],
  "expectedPublicFacts": { "messages": ["..."] }
}
```

Supported top-level values:

- `schema`: only `nethack-electron-test-scenario/v1`.
- `id`: must match the safe resolver ID and file path under `electron-poc/test/scenarios/<id>.json`.
- `phase`: only `after-level-and-hero-before-first-draw`.
- `hero`, `level`, `ground`, `monsters`, `inventory`, and `expectedPublicFacts` are required; arrays may be empty unless the test needs entries.
- `eventResults` is optional. It is a fixture-only queue of deterministic named outcomes for normal NetHack events. Each entry is consumed once by a matching event/result consumer and must be an explicitly supported pair. Initial support is `{ "event": "drink-fountain", "result": "monster-detection" }`, which routes the next fountain drink through NetHack's normal monster-detection fountain case.

### Hero / identity

`hero` supports:

- `placement`: `current` or `nearest-safe-floor` (required).
- `role`, `race`, `gender`/`sex`, `alignment` (optional).

Identity values are parsed through NetHack's real role/race/gender/alignment lookup and validated with real combination checks when enough fields are declared. Invalid values or invalid declared combinations fail closed before game-state mutation. Prefer real names such as `Valkyrie`, `human`, `female`, `lawful`.

### Locations and coordinates

Any ground object, monster, terrain entry, or map `topLeft` can use:

- String shorthands: `hero`, `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`.
- Relative coordinates: `{ "dx": 2, "dy": -1 }` within the bounded range.
- Absolute coordinates: `{ "x": 10, "y": 5 }` within NetHack map bounds.

Do not mix absolute and relative fields.

### Level / map setup

`level` requires:

- `safeAreaAroundHero`: integer `0..10`.
- `lit`: boolean.
- `suppressAdjacentMonsters`: boolean.
- `pet`: `none` or `keep`.

Optional level setup:

- `terrain`: array of `{ "at": <location>, "type": <terrain>, "trap": <trap> }`; `trap` is optional.
- `map`: `{ "topLeft": <location>, "rows": ["-------", "|..@..|"] }` with bounded equal-width rows.

Supported terrain types include `floor`, `room`, `corridor`, `stone`, `wall`, `wall-horizontal`, `wall-vertical`, `door-none`, `doorway`, `door-open`, `door-closed`, `door-locked`, `stairs-up`, `stairs-down`, `fountain`, `water`, `moat`, `lava`, `ice`, `trap-pit`, `trap-bear`, and `trap-web`. Supported explicit trap values include `pit`, `spiked-pit`, `bear`, `web`, and `landmine`.

Supported map row symbols: `.`, `#`, `|`, `-`, `+`, `/`, `<`, `>`, `^`, `~`, `L`, space, and `@`.

### Objects, inventory, ground, and containers

`ground`: array entries `{ "at": <location>, "object": <object> }`.

`inventory`: array of non-container object specs. Scenario inventory replaces starter gear hermetically.

Supported `typeId` values include containers (`CHEST`, `LARGE_BOX`, `SACK`, `BAG_OF_HOLDING`), food (`FOOD_RATION`, `TRIPE_RATION`, `APPLE`), weapons/ammo (`DAGGER`, `KNIFE`, `SHORT_SWORD`, `LONG_SWORD`, `ARROW`, `BOW`, `PICK_AXE`), armor (`LEATHER_ARMOR`, `CHAIN_MAIL`, `HELMET`, `SMALL_SHIELD`, `LEATHER_CLOAK`, `CLOAK_OF_PROTECTION`, `LOW_BOOTS`, `SPEED_BOOTS`), tools (`TIN_OPENER`, `LOCK_PICK`, `SKELETON_KEY`, `OIL_LAMP`, `MAGIC_MARKER`, `STETHOSCOPE`, `TOWEL`), scrolls/spellbooks/potions/wands/rings/amulets (`SCR_IDENTIFY`, `SCR_REMOVE_CURSE`, `SCR_ENCHANT_WEAPON`, `SPE_JUMPING`, `SPE_CHAIN_LIGHTNING`, `POT_HEALING`, `POT_EXTRA_HEALING`, `WAN_DIGGING`, `WAN_MAGIC_MISSILE`, `WAN_STRIKING`, `RIN_PROTECTION`, `RIN_ADORNMENT`, `AMULET_OF_REFLECTION`), rocks/coins (`ROCK`, `BOULDER`, `GOLD_PIECE`). Extend this table deliberately with validation and negative tests when needed.

Supported non-container object fields:

- `typeId` required. Gray-stone-like fixtures may use `FLINT`, `TOUCHSTONE`, `LUCKSTONE`, and `LOADSTONE`; keep `identityKnown: false` when proving public `gray stone` behavior without true identity leakage.
- `quantity`: integer `1..99`, optional.
- `identityKnown`, `beatitudeKnown`: booleans where meaningful.
- `beatitude`: `blessed`, `uncursed`, or `cursed`.
- `charges`: `0..99` only for charged object types.
- `enchantment`: `-5..5` for weapon/armor/ring/weapon-tool types.
- `erosion`, `corrosion`: `0..3` for weapon/armor types.
- `poisoned`: boolean only where NetHack treats the object as poisonable.
- `equipped`: inventory only; `none`, `wielded`, `worn`, `quivered`, `left-ring`, or `right-ring`.
- `calledName`: optional non-empty player-assigned type name for an object type with a public appearance. Every fixture object of the same type must declare the same value so type-level naming is deterministic.
- `individualName`: optional non-empty player-assigned object name; requires quantity 1.

Supported container fields:

- `typeId`, `locked`, `trap` (`none` or `armed`), and `contents` are required.
- Containers are ground-only; nested containers and inventory containers are rejected for now.
- Container contents are non-container object specs.

### Monsters

`monsters`: array of entries with:

- `typeId`: supported values currently include `JACKAL`, `GRID_BUG`, `GOBLIN`, `KOBOLD`, `SEWER_RAT`, `LICHEN`, `NEWT`, `BAT`, `DWARF`, `GNOME`, `WEREJACKAL`, `HUMAN_WEREJACKAL`, `KITTEN`, and `LITTLE_DOG`.
- `at`: location.
- Optional `attitude`: `hostile`, `peaceful`, or `tame`.
- Optional `asleep`: boolean.
- Optional `hp` and `maxHp`: bounded positive integers; `hp` must not exceed `maxHp` when both are present.

### Public expected facts

`expectedPublicFacts` may include non-empty unique string arrays for:

- `contextActions`
- `containerRows`
- `inventoryRows`
- `equipmentRows`
- `groundRows`
- `monsterRows`
- `mapAffordances`
- `messages`
- `status`

These facts are emitted by the fixture load event and should also guide real UI assertions where relevant.

## Fail-closed behavior and caps

Unsupported schemas, phases, IDs, fields, object/monster/terrain types, locations, values, nesting, quantities, duplicate keys, malformed JSON, and missing required fields must fail before mutation.

Guardrails:

- Fixture code is gated by `NH_ELECTRON_TEST_FIXTURES` build support and explicit runtime `NH_ELECTRON_TEST_FIXTURES=1`.
- Normal builds reject fixture env vars and must not mutate state.
- The bridge rejects direct `NH_TEST_SCENARIO` paths; use `NH_TEST_SCENARIO_ID` only.
- IDs may use alphanumeric characters, `/`, `_`, and `-`; no absolute paths, `..`, backslashes, or too-long IDs.
- JSON `id` must match the requested ID and relative scenario file path.

Current caps: file size `65536` bytes; objects `80`; ground entries `32`; inventory entries `32`; monsters `24`; terrain entries `128`; map rows `15`; map columns `31`; expected fact entries `24`; expected fact strings shorter than `128` bytes.

## Adding scenarios and tests

1. Choose a safe ID such as `map/terrain-room-trap-water`.
2. Create `electron-poc/test/scenarios/<id>.json` and keep path/id identical.
3. Use only supported fields. If a test needs unsupported world state, extend parser/apply code plus negative tests; do not smuggle state through expected facts.
4. Add positive loader coverage (the positive test discovers all scenario files).
5. Add negative tests for every new field/value/range/failure mode in `electron-poc/scripts/scenario-loader-negative-test.js`. For deterministic event outcomes, add both schema-shape failures and unsupported event/result pair failures.
6. Add or extend real Electron/CDP/MCP proof scripts for player-facing behavior. Required coverage for expanded scenarios now includes:
   - identity/equipment/inventory: load `identity/valkyrie-equipped-inventory`, verify visible status/startup/player identity where exposed, open the real inventory/equipment UI, assert wielded/worn/quivered/charged items, and save artifacts under `electron-poc/test-output/real-scenario-identity-equipment/`.
   - map/terrain: load `map/terrain-room-trap-water`, assert public map cells/aria/semantic labels for wall, open door, trap, water, lava, stairs, and ground apple where practical, and save artifacts under `electron-poc/test-output/real-scenario-terrain-map/`.
   - existing object flows: containers, ground pickup, locked/trapped context actions, and visible monsters.
7. Include screenshots/artifacts under `electron-poc/test-output/...` and summarize what was proven through real Electron UI, not just loaded-event expected facts.

Relevant commands from `electron-poc/`:

```bash
npm run test:scenario-loader
npm run test:architecture
npm run test:container-transfer-panel
npm run test:ground-pickup-transfer-panel
npm run test:inventory-action-service
npm run test:equipment-screen-rpg
npm run test:real-container-transfer-panel-mcp
npm run test:real-ground-pickup-transfer-panel-mcp
npm run test:real-equipment-screen-mcp
node scripts/real-scenario-identity-equipment-mcp-test.js
node scripts/real-scenario-terrain-map-mcp-test.js
```

## Quality bar

- No substring JSON validation or hardcoded scenario special cases.
- No production/test leakage through preload, renderer, normal bridge builds, or normal NetHack state.
- Normal builds must reject fixture envs with no mutation.
- Strong positive and negative coverage for every schema extension, including planned map/terrain conflicts before mutation: monster/ground placement on planned wall, water, lava, and closed impassable door tiles must fail closed.
- Real Electron/CDP/MCP screenshots/artifacts for player-facing behavior; `npm run test:scenario-loader` must include the real proofs for containers, ground pickup, locked/trapped context actions, visible monsters, identity/equipment/inventory, and terrain/map.
- Assertions target user-facing labels/map cells/public facts, not private state alone. Terrain/map proofs should assert exact scenario-relative cells, not just “any matching wall/trap/stair somewhere.”
- Real proof scripts must fail on player-facing/runtime defects such as `Program in disorder`, “Please report these messages,” contradictory equipment labels (for example a weapon both wielded and not wielded), wrong quiver/action labels, or a hero tile exposed as monster semantics.
- Use critique before claiming substantive scenario-framework changes complete.
