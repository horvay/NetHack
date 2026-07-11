# Player combo avatar style guidance — polished full-body fantasy characters

This player-avatar set intentionally replaces the cancelled procedural/Pillow and pixel-art direction. It also supersedes the earlier cropped/half-body portrait direction: the Boss reference shows that close portrait/cropped examples are wrong for this set.

## Output target

- AI-generated polished fantasy full-body character avatars, not pixel art and not cropped portraits.
- True `1024x1024` PNG output for every valid race/role/gender combo in `asset-generation/manifests/player-avatar-combo-inventory.json`.
- The complete character must be visible head-to-toe inside the square frame: head, torso, hands/weapons, legs, boots/feet all visible with comfortable margins; no half-body, bust, waist-up, knee-up, off-frame weapons, or cut-off hats/boots.
- Transparent cutout final assets produced through `asset-generation/workflows/krea2_basic_rem-background.json` with RMBG `background: Alpha`.
- Source generation prompt includes `on a solid green background` only to give RMBG a removable matte; installed PNGs must have real alpha and no visible green background.

## Prompt style basis

Use this style basis per combo:

> A polished high-resolution full-body fantasy character image of a [RACE] [ROLE] [GENDER] NetHack player character, refined painterly concept art, dramatic studio character lighting, detailed costume materials, clear race/class/gender identity, tasteful heroic fantasy design, complete head-to-toe character centered in frame with boots/feet visible and generous margins, standing character cutout on a solid green background.

Do **not** use the project pixel-art tile prompt for this avatar set. These avatars are reviewed as 1024px full-body character images first, not as 16/32px dungeon tiles.

## Costume and gender guidance

- Class/race/gender identity must be immediately readable.
- Female characters should read clearly as female, including Valkyries, but outfits must vary by class and role.
- Attractive/sexy fantasy styling is acceptable where tasteful and character-appropriate: cleavage cutouts, thigh cutouts, side cutouts, slits, fitted bodices, exposed shoulders/midriffs, decorative straps, corsetry, ornate belts, or asymmetric armor can be used when they support the role design.
- Do not make every woman a chainmail bikini. Vary designs by class: robes for wizards/priests/healers/monks, explorer gear for archeologists/tourists, leather for rogues/rangers, armor for knights/samurai/valkyries/barbarians, each with selective attractive details rather than one repeated template.
- Valkyries are unmistakably female Norse shield-maidens in bright steel armor and blue cloak, with feminine face and silhouette; not masculine generic warriors.

## Negative constraints

No pixel art, no low-resolution sprite style, no chibi icon, no flat vector art, no UI badge/card/frame, no text/letters/numbers, no fake checkerboard transparency, no baked background, no modern streetwear, no cropped-off head, no cropped boots or feet, no half-body, no bust portrait, no waist-up portrait, no knee-up portrait, no cut-off weapon, no extra limbs.
