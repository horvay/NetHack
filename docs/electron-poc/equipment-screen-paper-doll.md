# Electron equipment screen paper-doll notes

The RPG equipment screen currently presents NetHack body armor as one visible `Armor / body` paper-doll card. That visual grouping can display either an armor suit/robe/mail item or a shirt if the shirt is the only known worn body garment.

The shared inventory action service still treats NetHack armor layers separately for command routing:

1. `shirt`
2. `armor-suit`
3. `cloak`

Double-click replacement routing uses those separate layers to remove blocking outer garments in NetHack order before wearing the selected item. The visible paper doll does not yet expose a dedicated shirt card, so the shirt distinction is an implementation/routing distinction rather than a separate visible slot.

Non-body armor slots (`helmet`, `gloves`, `boots`, `shield`) are not blocked by worn shirt/suit/cloak layers. Replacing one of those slots should only take off the current same-slot item, if any, then wear the replacement.
