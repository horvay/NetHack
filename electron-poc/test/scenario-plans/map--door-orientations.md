# map/door-orientations

Manual AI-agent runbook for the door orientation fixture.

## Launch

From `electron-poc/` after building fixture shim support:

```bash
npm run build:shim:test-fixtures
NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=map/door-orientations NETHACKOPTIONS='!tutorial,!autopickup' npm start
```

## Scenario facts

- Hero remains on the current square.
- A lit floor test pattern is stamped around the hero with `safeAreaAroundHero: 10` so all six door/doorway fixtures are visible.
- Relative to the hero:
  - `dx=-8, dy=-3`: horizontal closed door, flanked by horizontal wall glyphs.
  - `dx=8, dy=-3`: vertical closed door in a vertical-wall context.
  - `dx=-4, dy=-3`: empty doorway / no-door doorway, flanked by vertical wall glyphs above and below.
  - `dx=0, dy=-2`: horizontal empty doorway / no-door doorway, flanked by horizontal wall glyphs left and right.
  - `dx=0, dy=-3`: horizontal open door, flanked by horizontal wall glyphs.
  - `dx=4, dy=-3`: vertical open door, flanked by vertical wall glyphs above and below.

## Manual validation

1. Start the scenario and close any intro/help dialogs.
2. Hover each of the six door/doorway cells.
3. Confirm the visible map door, tooltip title, tooltip thumbnail, glyph number, and `data-tile-id` agree:
   - Horizontal Closed Door, `closed-door`, glyph 3989.
   - Vertical Closed Door, `closed-door`, glyph 3988.
   - Horizontal Open Door, `open-horizontal-door`, glyph 3987.
   - Vertical Open Door, `open-vertical-door`, glyph 3986.
   - Empty Doorway, `no-door-doorway`, glyph 3985, no gold knob/wooden open-door leaf.
4. Pass only if the tooltip thumbnail uses the same CSS terrain door orientation visible on the map, not a mismatched generated PNG. Empty doorway must read as a neutral floor gap/pass-through in the wall, distinct from the brown/gold open-door cells.

## Known limitations

The fixture validates renderer/bridge orientation semantics for door terrain. It does not exercise opening, closing, locking, or unlocking commands.
