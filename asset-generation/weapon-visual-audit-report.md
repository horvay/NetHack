# Generated Weapon Asset Visual Audit

Audit date: 2026-06-30  
Scope: generated NetHack weapon-like assets found in `electron-poc/assets/tiles/manifest.json`, including melee weapons, ranged weapons, missiles/ammo, polearms, weapon-tools, and sling ammunition where present. This is an audit only; no assets or tracker QA statuses were modified.

Evidence/contact sheets:

- 32px on dungeon floor, magnified: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-xi-dancing-teacup-29/weapon-audit/weapon-audit-32px-floor-magnified.png`
- 16px on dungeon floor, magnified: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-xi-dancing-teacup-29/weapon-audit/weapon-audit-16px-floor-magnified.png`
- 32px on checker, magnified: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-xi-dancing-teacup-29/weapon-audit/weapon-audit-32px-checker-magnified.png`
- Audited asset list TSV: `/home/horvay/.config/ai-org/ai-org-dev-data/run-evidence/developer-xi-dancing-teacup-29/weapon-audit/weapon-assets-audited.tsv`
- Independent critique: `/home/horvay/work/nethack/subagent-runs/critique-1782835872724/subagent-result.md`

## Summary counts

- Total weapon-like assets audited: **76**
- Pass: **41**
- Questionable: **22**
- Fail: **13**

## Highest-risk themes

1. **Polearms are the weakest family.** `fauchard`, `lucern-hammer`, `ranseur`, `spetum`, `trident`, and `voulge` do not communicate their distinctive heads at 16px; several collapse into generic axe/spear silhouettes.
2. **Some small/special weapons have wrong identity.** `dart`, `crysknife`, `club`, `grappling-hook`, `rubber-hose`, and `silver-saber` need semantic redesign.
3. **Some families pass as a broad class but are not differentiated.** Many racial arrows/spears/swords are readable as weapons, but material/racial differences are mostly color-only.

## Detailed audit table

| Weapon id / name | Current asset path | Status | What it currently looks like | What it should look like | Regenerate later? | Priority / severity |
|---|---|---:|---|---|---:|---|
| `arrow` / Arrow | `electron-poc/assets/tiles/generated/objects-inventory/arrow.png` | Pass | Clear diagonal arrow with point and red fletching. | Arrow/missile with point and fletching. | No | Low |
| `axe` / Axe | `electron-poc/assets/tiles/generated/objects-inventory/axe.png` | Pass | Clear one-handed axe. | Axe with obvious haft and blade. | No | Low |
| `bow` / Bow | `electron-poc/assets/tiles/generated/objects-inventory/bow.png` | Pass | Curved wooden bow. | Simple bow silhouette. | No | Low |
| `crossbow` / Crossbow | `electron-poc/assets/tiles/generated/objects-inventory/crossbow.png` | Questionable | Busy crossed shape; reads as crossbow at 32px but cluttered at 16px. | Compact horizontal bow on stock. | Optional | Medium |
| `crossbow-bolt` / Crossbow bolt | `electron-poc/assets/tiles/generated/objects-inventory/crossbow-bolt.png` | Pass | Two clear bolts. | Short bolt/quarrel. | No | Low |
| `dagger` / Dagger | `electron-poc/assets/tiles/generated/objects-inventory/dagger.png` | Pass | Clear small dagger. | Short pointed blade with hilt. | No | Low |
| `dart` / Dart | `electron-poc/assets/tiles/generated/objects-inventory/dart.png` | Fail | Red tassel/flower-like bundle, not a thrown dart. | Slim throwing dart with point and tail/fletching. | Yes | High |
| `flail` / Flail | `electron-poc/assets/tiles/generated/objects-inventory/flail.png` | Pass | Spiked ball and chain. | Flail head on chain/handle. | No | Low |
| `knife` / Knife | `electron-poc/assets/tiles/generated/objects-inventory/knife.png` | Pass | Clear knife. | Single-edged knife. | No | Low |
| `long-sword` / Long sword | `electron-poc/assets/tiles/generated/objects-inventory/long-sword.png` | Pass | Pale sword blade with hilt. | Longer straight sword. | No | Low |
| `mace` / Mace | `electron-poc/assets/tiles/generated/objects-inventory/mace.png` | Pass | Spiked mace head and handle. | Mace/spiked club. | No | Low |
| `pick-axe` / Pick-axe | `electron-poc/assets/tiles/generated/objects-inventory/pick-axe.png` | Pass | Clear pick-axe/mattock tool. | Pick-axe. | No | Low |
| `sling` / Sling | `electron-poc/assets/tiles/generated/objects-inventory/sling.png` | Questionable | U-shaped pendant/necklace; sling identity is only moderate. | Leather sling pouch with two cords. | Optional | Medium |
| `spear` / Spear | `electron-poc/assets/tiles/generated/objects-inventory/spear.png` | Pass | Clear spear tip on shaft. | Spear. | No | Low |
| `aklys` / aklys | `electron-poc/assets/tiles/generated/full-source-objects/aklys.png` | Questionable | Ornate hooked club/amulet-like object. | Short hooked throwing club with strap/cord. | Optional | Medium |
| `athame` / athame | `electron-poc/assets/tiles/generated/full-source-objects/athame.png` | Pass | Ritual dagger with bright guard. | Ceremonial dagger. | No | Low |
| `bardiche` / bardiche | `electron-poc/assets/tiles/generated/full-source-objects/bardiche.png` | Pass | Large poleaxe head on shaft; distinct enough. | Long polearm with large axe-like blade. | No | Low |
| `battle-axe` / battle-axe | `electron-poc/assets/tiles/generated/full-source-objects/battle-axe.png` | Pass | Clear two-handed axe. | Battle axe. | No | Low |
| `bec-de-corbin` / bec de corbin | `electron-poc/assets/tiles/generated/full-source-objects/bec-de-corbin.png` | Questionable | Small polearm with side bits, but detail is hard at 16px. | Crow-beak hammer/pick polearm. | Optional | Medium |
| `bill-guisarme` / bill-guisarme | `electron-poc/assets/tiles/generated/full-source-objects/bill-guisarme.png` | Questionable | Hooked red polearm, visually decorative. | Billhook/guisarme hybrid with clear hook and spike. | Yes | Medium |
| `boomerang` / boomerang | `electron-poc/assets/tiles/generated/full-source-objects/boomerang.png` | Pass | Clear V-shaped boomerang. | Boomerang. | No | Low |
| `broadsword` / broadsword | `electron-poc/assets/tiles/generated/full-source-objects/broadsword.png` | Pass | Broad sword blade with crossguard. | Broad sword. | No | Low |
| `bullwhip` / bullwhip | `electron-poc/assets/tiles/generated/full-source-objects/bullwhip.png` | Questionable | Leather coil/paddle shape; reads as whip only with label. | Long coiled whip with handle and tapering lash. | Yes | Medium |
| `club` / club | `electron-poc/assets/tiles/generated/full-source-objects/club.png` | Fail | Looks like an axe/spear-headed weapon, not a blunt club. | Plain wooden club/cudgel. | Yes | High |
| `crysknife` / crysknife | `electron-poc/assets/tiles/generated/full-source-objects/crysknife.png` | Fail | Duplicates the axe-headed `club` look; not crystalline knife. | Translucent crystal knife/dagger. | Yes | High |
| `dwarvish-mattock` / dwarvish mattock | `electron-poc/assets/tiles/generated/full-source-objects/dwarvish-mattock.png` | Pass | Clear heavy pick/mattock. | Dwarvish mattock/pick weapon-tool. | No | Low |
| `dwarvish-short-sword` / dwarvish short sword | `electron-poc/assets/tiles/generated/full-source-objects/dwarvish-short-sword.png` | Questionable | Chunky blade, closer to dagger/axe at 16px. | Short sturdy dwarvish sword. | Optional | Medium |
| `dwarvish-spear` / dwarvish spear | `electron-poc/assets/tiles/generated/full-source-objects/dwarvish-spear.png` | Fail | Looks like a short knife/dagger, shaft is absent/too short. | Spear with clear shaft and dwarvish head. | Yes | High |
| `elven-arrow` / elven arrow | `electron-poc/assets/tiles/generated/full-source-objects/elven-arrow.png` | Questionable | Ornate small missile; arrow identity is partly obscured. | Slender elven arrow with leaf-like fletching. | Optional | Medium |
| `elven-bow` / elven bow | `electron-poc/assets/tiles/generated/full-source-objects/elven-bow.png` | Questionable | Bright neon-green triangular bow; reads slightly like UI marker. | Elegant curved elven bow, not a neon icon. | Yes | Medium |
| `elven-broadsword` / elven broadsword | `electron-poc/assets/tiles/generated/full-source-objects/elven-broadsword.png` | Pass | Clear sword, similar to other elven swords. | Elven broad sword. | No | Low |
| `elven-dagger` / elven dagger | `electron-poc/assets/tiles/generated/full-source-objects/elven-dagger.png` | Pass | Clear dagger/short blade. | Elven dagger. | No | Low |
| `elven-short-sword` / elven short sword | `electron-poc/assets/tiles/generated/full-source-objects/elven-short-sword.png` | Pass | Clear short sword. | Elven short sword. | No | Low |
| `elven-spear` / elven spear | `electron-poc/assets/tiles/generated/full-source-objects/elven-spear.png` | Pass | Green spear with shaft and leaf-like head. | Elven spear. | No | Low |
| `fauchard` / fauchard | `electron-poc/assets/tiles/generated/full-source-objects/fauchard.png` | Fail | Small axe/hatchet head on short handle. | Long polearm with large curved scythe-like blade. | Yes | High |
| `flint` / flint | `electron-poc/assets/tiles/generated/full-source-objects/flint.png` | Pass | Clear stone/flint chunk; acceptable as sling ammo material. | Flint stone/chunk. | No | Low |
| `glaive` / glaive | `electron-poc/assets/tiles/generated/full-source-objects/glaive.png` | Questionable | Beige hook/blade, generic polearm. | Single-edged blade on long shaft. | Yes | Medium |
| `grappling-hook` / grappling hook | `electron-poc/assets/tiles/generated/full-source-objects/grappling-hook.png` | Fail | Looks like a gray axe/flower head on a stick. | Multi-pronged grappling hook with rope/shaft. | Yes | High |
| `guisarme` / guisarme | `electron-poc/assets/tiles/generated/full-source-objects/guisarme.png` | Questionable | Beige curved blade; distinct hook identity weak. | Hooked polearm blade for pulling riders. | Yes | Medium |
| `halberd` / halberd | `electron-poc/assets/tiles/generated/full-source-objects/halberd.png` | Questionable | Generic beige blade/hook; lacks clear axe plus spike. | Halberd with axe blade, spear point, and rear hook. | Yes | Medium |
| `javelin` / javelin | `electron-poc/assets/tiles/generated/full-source-objects/javelin.png` | Questionable | Curved beige missile/pole; not straight enough. | Light straight throwing spear. | Optional | Medium |
| `katana` / katana | `electron-poc/assets/tiles/generated/full-source-objects/katana.png` | Questionable | Curved sword, but katana-specific handle/shape is weak at 16px. | Curved single-edged katana with distinct hilt. | Optional | Medium |
| `lance` / lance | `electron-poc/assets/tiles/generated/full-source-objects/lance.png` | Questionable | Short beige pointed stick. | Long cavalry lance with clear shaft and point. | Yes | Medium |
| `lucern-hammer` / lucern hammer | `electron-poc/assets/tiles/generated/full-source-objects/lucern-hammer.png` | Fail | Generic beige hooked blade, not a hammer. | Pole hammer with hammer head plus spike/beak. | Yes | High |
| `morning-star` / morning star | `electron-poc/assets/tiles/generated/full-source-objects/morning-star.png` | Questionable | Smooth diamond lollipop, not very spiked. | Spiked ball on handle. | Optional | Medium |
| `orcish-arrow` / orcish arrow | `electron-poc/assets/tiles/generated/full-source-objects/orcish-arrow.png` | Pass | Clear crude arrow. | Orcish arrow. | No | Low |
| `orcish-bow` / orcish bow | `electron-poc/assets/tiles/generated/full-source-objects/orcish-bow.png` | Pass | Clear bow shape. | Orcish bow. | No | Low |
| `orcish-dagger` / orcish dagger | `electron-poc/assets/tiles/generated/full-source-objects/orcish-dagger.png` | Pass | Clear dagger/short blade. | Orcish dagger. | No | Low |
| `orcish-short-sword` / orcish short sword | `electron-poc/assets/tiles/generated/full-source-objects/orcish-short-sword.png` | Pass | Clear short sword. | Orcish short sword. | No | Low |
| `orcish-spear` / orcish spear | `electron-poc/assets/tiles/generated/full-source-objects/orcish-spear.png` | Pass | Clear spear. | Orcish spear. | No | Low |
| `partisan` / partisan | `electron-poc/assets/tiles/generated/full-source-objects/partisan.png` | Questionable | Reads like a small axe/poleaxe, side lugs unclear. | Spear-like polearm with broad spearhead and side projections. | Yes | Medium |
| `quarterstaff` / quarterstaff | `electron-poc/assets/tiles/generated/full-source-objects/quarterstaff.png` | Pass | Wooden staff with capped end. | Quarterstaff. | No | Low |
| `ranseur` / ranseur | `electron-poc/assets/tiles/generated/full-source-objects/ranseur.png` | Fail | Looks like a hatchet/poleaxe. | Three-pronged spear/polearm with side prongs. | Yes | High |
| `rock` / rock | `electron-poc/assets/tiles/generated/full-source-objects/rock.png` | Pass | Rock/stone chunk. | Rock used as thrown/sling ammo. | No | Low |
| `rubber-hose` / rubber hose | `electron-poc/assets/tiles/generated/full-source-objects/rubber-hose.png` | Fail | Very dark black squiggle/blob; low contrast. | Flexible black rubber hose with readable curve/highlights. | Yes | High |
| `runesword` / runesword | `electron-poc/assets/tiles/generated/full-source-objects/runesword.png` | Pass | Purple magical sword. | Rune-marked magic sword. | No | Low |
| `scalpel` / scalpel | `electron-poc/assets/tiles/generated/full-source-objects/scalpel.png` | Questionable | Small white blade; can read as tiny knife. | Surgical scalpel with slim handle/blade. | Optional | Low |
| `scimitar` / scimitar | `electron-poc/assets/tiles/generated/full-source-objects/scimitar.png` | Questionable | Slightly curved short sword, too close to generic sword. | Strongly curved single-edged scimitar. | Optional | Medium |
| `short-sword` / short sword | `electron-poc/assets/tiles/generated/full-source-objects/short-sword.png` | Pass | Clear short blade. | Short sword. | No | Low |
| `shuriken` / shuriken | `electron-poc/assets/tiles/generated/full-source-objects/shuriken.png` | Pass | Clear four-point throwing star. | Shuriken. | No | Low |
| `silver-arrow` / silver arrow | `electron-poc/assets/tiles/generated/full-source-objects/silver-arrow.png` | Pass | Clear arrow with silver head. | Silver arrow. | No | Low |
| `silver-dagger` / silver dagger | `electron-poc/assets/tiles/generated/full-source-objects/silver-dagger.png` | Pass | Clear silver dagger. | Silver dagger. | No | Low |
| `silver-mace` / silver mace | `electron-poc/assets/tiles/generated/full-source-objects/silver-mace.png` | Questionable | Smooth mallet head rather than mace. | Silver mace, ideally spiked/flanged. | Optional | Medium |
| `silver-saber` / silver saber | `electron-poc/assets/tiles/generated/full-source-objects/silver-saber.png` | Fail | Hook/cane/sickle silhouette with yellow handle. | Curved cavalry saber with guard. | Yes | High |
| `silver-spear` / silver spear | `electron-poc/assets/tiles/generated/full-source-objects/silver-spear.png` | Pass | Clear spear/arrow-like shaft. | Silver spear. | No | Low |
| `spetum` / spetum | `electron-poc/assets/tiles/generated/full-source-objects/spetum.png` | Fail | Axe/hatchet-like polearm, no side prongs. | Spear polearm with two side spikes. | Yes | High |
| `stiletto` / stiletto | `electron-poc/assets/tiles/generated/full-source-objects/stiletto.png` | Pass | Thin dagger/stiletto with hilt. | Slender stabbing dagger. | No | Low |
| `trident` / trident | `electron-poc/assets/tiles/generated/full-source-objects/trident.png` | Fail | Single spear/arrow point with side pixels; not clear three-pronged fork. | Three-pronged trident readable at 16px. | Yes | High |
| `tsurugi` / tsurugi | `electron-poc/assets/tiles/generated/full-source-objects/tsurugi.png` | Pass | Large front-facing sword, distinct from most blades. | Heavy tsurugi/two-handed Japanese sword. | No | Low |
| `two-handed-sword` / two-handed sword | `electron-poc/assets/tiles/generated/full-source-objects/two-handed-sword.png` | Questionable | Reads as normal sword; size/heft not obvious. | Large long two-handed sword with big grip/crossguard. | Yes | Medium |
| `unicorn-horn` / unicorn horn | `electron-poc/assets/tiles/generated/full-source-objects/unicorn-horn.png` | Pass | Golden curved horn. | Unicorn horn weapon/tool. | No | Low |
| `voulge` / voulge | `electron-poc/assets/tiles/generated/full-source-objects/voulge.png` | Fail | Hatchet/axe-like head on short shaft. | Long polearm with cleaver-like blade fixed to shaft. | Yes | High |
| `war-hammer` / war hammer | `electron-poc/assets/tiles/generated/full-source-objects/war-hammer.png` | Pass | Clear hammer head and handle. | War hammer. | No | Low |
| `worm-tooth` / worm tooth | `electron-poc/assets/tiles/generated/full-source-objects/worm-tooth.png` | Pass | Large tooth/fang shape. | Worm tooth. | No | Low |
| `ya` / ya | `electron-poc/assets/tiles/generated/full-source-objects/ya.png` | Pass | Clear arrow/missile. | Japanese arrow/ya. | No | Low |
| `yumi` / yumi | `electron-poc/assets/tiles/generated/full-source-objects/yumi.png` | Questionable | Reads as bow, but not strongly asymmetric Japanese yumi. | Tall asymmetric yumi bow. | Optional | Medium |

## Recommended next regeneration set

### High priority / clear fails

`dart`, `club`, `crysknife`, `dwarvish-spear`, `fauchard`, `grappling-hook`, `lucern-hammer`, `ranseur`, `rubber-hose`, `silver-saber`, `spetum`, `trident`, `voulge`

### Medium priority / questionable but worth batching with weapon fixes

`bill-guisarme`, `bullwhip`, `elven-bow`, `glaive`, `guisarme`, `halberd`, `lance`, `partisan`, `two-handed-sword`, plus optional silhouette polish for `sling`, `aklys`, `bec-de-corbin`, `dwarvish-short-sword`, `elven-arrow`, `javelin`, `katana`, `morning-star`, `scimitar`, `silver-mace`, and `yumi`.
