# Archon HUD ocular modes

The Archon HUD's manual vision-mode selector adapts the four-mode model used by
the private G4LO repository (G4LO):

- Repository: [`brogrizzly/4lo`](https://github.com/brogrizzly/4lo)
- Reviewed revision: [`62edfb6`](https://github.com/brogrizzly/4lo/commit/62edfb6ad70897fa15ae87cec543641ba05eec18)
- Reference files: `docs/ACCESSIBILITY.md`,
  `src/shell/components/VisionControl.tsx`,
  `src/core/theme/VisionContext.tsx`, and `src/core/store/layoutStore.ts`

## Adapted mode contract

| Mode | Intended family | Lighting surface |
| --- | --- | --- |
| `clarity_night` | Neutral clarity | Dark |
| `clarity_day` | Neutral clarity | Light |
| `red_night` | Red, low-glare visibility | Dark |
| `red_day` | Red, low-glare visibility | Light |

The names and day/night mapping follow G4LO. Clarity Night is the initial mode,
matching the G4LO layout store's default. The HUD's colors are a local
implementation of those intentions; this prototype does not import or execute
code from the private repository.

## Additional colorway

The HUD also offers a locally tuned C64-inspired colorway using deep blue,
cyan, light blue, and soft lime. It is a decorative palette, not a fifth ocular
mode or an exact hardware-color reproduction; its text and controls are tuned
for contrast.

Changing a mode only changes the palette, so it preserves the HUD's layout,
input, text scale, and scroll position. Mode changes are manual. G4LO's
strain-triggered relief behavior depends on a trusted strain signal and an
enabled auto-protection setting; Archon has no such signal, so this HUD does not
simulate automatic switching.

These modes are visual-comfort options, not a medical or retinal-safety claim.
The HUD cannot control the physical display's brightness.
