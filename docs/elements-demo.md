# Writer Studio elements demo

Open **Elements** after the formatting menu to search the six tagged sample assets. No user uploads, R2 access, database migrations, or external asset requests are part of this demo.

Tap an element to select it. Drag the element or its **Move** handle; use a corner to resize or the rotation handle to rotate. **Settings** opens Position, Style, Layers, and Page tabs. On phones the controls appear in a scrollable bottom panel. Closing the panel leaves handles visible; tapping ordinary writing clears selection.

Position controls include inline placement, above/below text, wrapping, behind/in front of text, alignment, text distance, wrapping duration, exact dimensions in percent/pixels/millimeters, aspect-ratio locking, paragraph/page anchoring, grid, and snapping. Arrow keys nudge one pixel; Shift + arrow nudges ten pixels. Dragging an inline or wrapped decoration changes it to an overlay in front of text.

Style includes rotation, opacity, flips, border color/width, shadows, and reset actions. Layers provides selection of hidden elements, multiple selection, grouping/ungrouping, stacking order, copying, duplication, and pasting. Locking prevents movement and editing until unlocked. Native editor commands keep changes in the editor undo/redo history.

Page controls include responsive flow or paper layout, A4/Letter/A5, orientation, margins, grid/snapping, and insertion/removal of explicit page breaks. Position, appearance, anchors, grouping, and page settings are saved in sanitized writing HTML and understood by both readers. Existing paragraph IDs are preserved for comments and bookmarks.

## Demo boundaries

- Page layout adapts paper proportions to the available width. Page breaks are explicit; this is not Word's automatic pagination engine.
- Square wrapping uses a rectangular exclusion. Tight wrapping uses a rounded exclusion. “Both” picks the available side; contour-accurate artwork exclusions and flowing text simultaneously on both sides of a centered object need a dedicated typesetting engine.
- Paragraph anchors move with their paragraph; fixed anchors refer to the selected page. Placement uses document-relative coordinates so it scales with the reader width.
- The tests simulate pointer/touch events and the native command history in jsdom. Actual device rendering and browser-native undo still require interactive testing on the deployed demo.

## Implementation

`assets/elements.js` owns the small catalog, validated element model, canonical HTML, and shared rendering. `assets/elements-editor.js` owns pointer interactions and the editor-only controls. Selection frames, drag ghosts, guides, and panels are outside editable HTML and never saved. Only known sample asset paths are accepted. Replacing the catalog with approved R2 records is a separate integration.
