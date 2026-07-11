# NetHack asset generation instructions

The Electron tile assets must be generated as one coherent fantasy-game tileset, not as a mix of unrelated icon styles.

## Consistent style prompt

Use this style basis for generated tile assets, adapting only the subject/content per asset:

> A concept pixel art image in the style of a fantasy game asset of [SUBJECT]

For NetHack tiles, expand this with requirements such as: readable at 32px and 16px, cohesive fantasy roguelike game art, bold silhouette, no text, no UI badge, no square card, no baked checkerboard, no fake transparency, no flat SVG/vector placeholder look.

Prompts must specify the positive colors to use for each asset. Do not rely on negative wording about colors; instead say the exact visible palette, such as "brown and cream dog with tan highlights," "gray wolf with silver-blue rim light," "purple and gold magic marker," "green slime with lime highlights," or "bone-white skeleton with warm gray shadows." Choose mid-tone and bright accent colors that remain readable on dark dungeon stone at 32px and 16px. For dark-themed creatures, still specify visible colors and highlights, for example charcoal-gray body with violet rim light, red-orange eyes, and silver edge highlights. Reject any result that reads as a flat dark token/blob on the dungeon tiles, and regenerate with a clearer positive palette.

For production transparent sprites, include the phrase "on a solid green background" in the generation prompt so RMBG has a clean, removable matte. The final installed PNG must still have real alpha after RMBG/background removal; the green background must not remain visible or be baked into RGB pixels. If any green edge/matte/background remains, regenerate or clean it before accepting the asset.

## Choose the correct ComfyUI workflow

There are two workflows:

- Transparent / cutout assets: `asset-generation/workflows/krea2_basic_rem-background.json`
  - Canonical compatibility copy: `asset-generation/workflows/krea2_basic_rem_back.json`
  - Use for monsters, pets, player/role sprites, objects, traps, effects, overlays, and anything that should sit on top of the dungeon floor.
  - This must produce real alpha transparency through RMBG/background removal. Do not accept fake checkerboard baked into RGB pixels.
  - API conversion must include the RMBG node inputs, especially `model: RMBG-2.0` and `background: Alpha`.

- Non-transparent / background assets: `asset-generation/workflows/krea2_basic.json`
  - Use for terrain/base tiles that are supposed to include their own floor/wall/background, such as floors, walls, water/lava, stairs/floor features when intentionally opaque.

## Transparency QA

For every transparent-required asset:

1. Verify the PNG has real alpha, not a checkerboard or flat background baked into RGB.
2. Verify the solid green generation matte is fully removed. Reject green pixels/green fringe/green card remnants.
3. Composite it over the actual dungeon floor and a contrasting checker/light background.
4. Reject any visible card, square, checkerboard, green matte, halo, fake matte, or background residue unless it is intentional glow/effect and looks good in-game.

## Full asset coverage tracking

When regenerating the tileset, maintain a markdown tracker listing every manifest asset. The tracker must include asset id, category, intended workflow (transparent or non-transparent), generation status, QA status, and notes.

Do not claim the asset generation is complete unless the tracker includes every asset and every asset is marked generated plus QA-reviewed or explicitly listed as remaining backlog with a reason.

When reviewing completion, the Secretary will inspect this tracker and send the work back if any asset is missing.
