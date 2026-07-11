# Manual scenario runbooks for AI agents

These files are **manual scenario runbooks for AI agents**. They are not a backlog of automation requirements. Each runbook embeds the JSON scenario, names the matching `electron-poc/test/scenarios/...` file, gives a manual fixture launch command, and lists the post-load UI/gameplay steps plus pass/fail criteria.

Keep the JSON files loadable by safe `NH_TEST_SCENARIO_ID` so an AI agent can launch the scenario manually when needed. Incidental loader or existing Electron proof coverage may exist for some scenarios, but the primary deliverable in this folder is markdown runbooks.

| # | Area | Runbook | Scenario ID |
|---|---|---|---|
| 1 | Containers/transfer | `container--unlocked-chest-on-hero.md` | `container/unlocked-chest-on-hero` |
| 2 | Container Open routing | `container--unlocked-large-box-on-hero.md` | `container/unlocked-large-box-on-hero` |
| 3 | Locked/trapped containers | `container--locked-trapped-chest-on-hero.md` | `container/locked-trapped-chest-on-hero` |
| 4 | Pickup/drop/ground pile | `ground--pickup-pile-on-hero.md` | `ground/pickup-pile-on-hero` |
| 5 | Identity/equipment/inventory | `identity--valkyrie-equipped-inventory.md` | `identity/valkyrie-equipped-inventory` |
| 6 | Map/terrain/traps/water/lava/stairs | `map--terrain-room-trap-water.md` | `map/terrain-room-trap-water` |
| 7 | Hostile/tame monster adjacency | `monster--visible-jackal-east.md` | `monster/visible-jackal-east` |
| 8 | Coordinate objects/container contents | `object--coordinate-container-pile.md` | `object/coordinate-container-pile` |
| 9 | Locked door/corridor actions | `door--locked-door-corridor.md` | `door/locked-door-corridor` |
| 10 | Tame/peaceful/hostile attitudes | `pet--attitude-trio-around-hero.md` | `pet/attitude-trio-around-hero` |
| 11 | Trap hazards/HP/status | `trap--bear-trap-hazard-east.md` | `trap/bear-trap-hazard-east` |
