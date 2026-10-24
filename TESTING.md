# NetHack testing instructions

The front end is the Godot app in `godot-poc/`. Its testing doctrine (deep-path scenarios, mock only what a test cannot control) is in [`godot-poc/BIBLE.md`](./godot-poc/BIBLE.md#testing-doctrine-deep-path).

## Running the suite

```sh
godot-poc/extension/build.sh             # release core, after engine or bridge changes
godot-poc/extension/build.sh --fixtures  # fixture core, for scenarios that stage a game
godot-poc/tests/run.sh [scenario ...]    # default: every scenario
```

Scenarios live in `godot-poc/project/tests/scenarios/`, one file each. Each run writes `godot.log` and its screenshots to `godot-poc/test-output/<scenario>/`. `run.sh` fails a scenario on any failed assertion and on any script or engine error in its log, except lines the scenario lists as `## expected-error: <text>`.

Fixture scenarios (`godot-poc/tests/fixtures/<id>.json`) set up hard-to-reach game states on the fixture core. A scenario loads one with `start_fixture(character, id)`; the id is the file's path under `tests/fixtures/` without `.json`.

## Screenshot QA

A UI test passes only after someone opens and inspects every screenshot it captured. Assertions alone never pass a UI test, and neither does a `PASS` line.

- Open every PNG in the scenario's `test-output/` folder, not a sample.
- Check what the scenario claims: the right screen, item, prompt or map state, readable text, nothing clipped, overlapping or blank.
- In the report, name the screenshots you inspected and what each showed. Old output folders are not evidence for a new change.

## Native build consistency

`build.sh` cleans the complete core object set with `make -C src clean` before rebuilding `libnh.a`, for both flavors. Keep that full clean: Make does not track changes to `WANT_LIBNH` or compiler flags, and deleting selected object files can leave a mixed archive with missing native menu context or fixture hooks. Never run two builds at the same time.
