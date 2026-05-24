# Screenshots

The main `README.md` embeds four screenshots from this folder. The
intended shots and filenames are listed below. Capture each one at
roughly **1920 × 1080** (or any consistent landscape ratio) with the
app running at <http://localhost:3000>; PNG keeps text sharpest.

| File | What to capture | When |
|---|---|---|
| `01-overview.png` | Full window — chat panel on the left with an answered question, graph canvas on the right showing the retrieved subgraph. | After clicking one of the suggested-question pills and letting retrieval finish. |
| `02-trace-animation.png` | Mid-animation moment of *Trace on graph*: one reasoning hop is highlighted on the canvas, the matching row in the Reasoning path is amber-tinted, other rows + nodes are dimmed. | Click *Trace on graph* under Reasoning path; screenshot during the walk. |
| `03-inspector.png` | Retrieval inspector expanded, showing the flat ↔ graph comparison side-by-side with token budgets and "View context" affordances. | Open the *Retrieval inspector* `<details>` block above Sources. |
| `04-second-query.png` | A different intent than #01, ideally with a visibly different subgraph (e.g. *Vehicle input VAT* or *Alcohol & entertainment*). | Click a different suggested-question pill from the one used in `01-overview.png`. |

## Capture tips

- Use the browser's **device toolbar** or just resize the window to a clean landscape ratio before capturing — projector aspect.
- Close the Presenter FAQ drawer for the headline shots (it overlays the right half of the screen).
- The header chip row (`Taxxa` · `Team · Not Legal Advice` · retrieval badges) should be visible in every shot — it grounds the screenshots in the same product.
- On Windows: `Win + Shift + S` for region capture; on macOS: `Cmd + Shift + 4`.

## Replacing screenshots later

The README references these by filename, so you can re-capture and
overwrite without touching markdown. Stick to the same four
filenames and the embeds will keep working.
