# NetHack Electron

The NetHack Electron context presents real NetHack state and interactions through a player-facing desktop interface while preserving NetHack as the authority for game behavior.

## Player state and interactions

**Game View**:
The complete player-visible and publicly remembered game state at a point in time, including the map, status, messages, prompts, menus, inventory, equipment, and active interactions.
_Avoid_: renderer state, UI state, client state

**Public Game Fact**:
A fact NetHack has exposed or the player is allowed to remember, without hidden identity or spoiler information.
_Avoid_: raw game state, internal state

**Transfer Session**:
One player interaction that moves one or more items between inventory and a ground pile or container, from opening through confirmation, rejection, interruption, or close.
_Avoid_: transfer panel, loot modal

**Command Lifecycle**:
The public progression of one player command through acceptance, queueing when applicable, and authoritative confirmation or rejection.
_Avoid_: command status, bridge response

## Verification

**Verification Run**:
One isolated execution of a deterministic player scenario, including its inputs, observable assertions, captures, logs, and run identity.
_Avoid_: test process, test session

**Evidence Approval**:
A human accept or reject decision bound to the exact player-facing capture bytes and Verification Run that produced them.
_Avoid_: screenshot note, visual pass
