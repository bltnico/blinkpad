# Draft Note

Draft Note is a zero-friction, browser-native scratchpad for ideas that refuse to wait.
Keep it docked in the main window or float it on a second screen—every word stays in sync.

## Feature Highlights ✨

- ⚡ **Instant autosave** – local storage and HTML sanitising keep every keystroke safe between refreshes.
- 🪄 **Cross-tab magic** – BroadcastChannel mirrors edits across windows and snaps the note back when PiP closes.
- 🔍 **Library quick switch** – press Cmd/Ctrl + K to summon a searchable bottom sheet and jump to any workspace.
- 🆕 **Slug maker** – name a fresh note or auto-generate a collision-free key without leaving the editor.
- 📤 **Share-ready tools** – use the Share API, copy HTML, or export a high-res PNG in one click.
- 🪟 **Picture-in-Picture** – pop the editor into a floating mini-window with Cmd/Ctrl + P for side-by-side browsing.

## Tech Stack Cheatsheet

- **TypeScript + Vite** power the build, keeping the runtime lean and the DX smooth.
- **@plainsheet/core** provides the animated bottom sheet foundations for libraries and new-note flows.
- **BroadcastChannel** synchronises content between windows, while **lz-string** compresses storage payloads.
- **DOMPurify** sanitises user input for safety; **html2canvas** handles high-fidelity PNG exports.
- **Microtip** sprinkles accessible tooltips across the navbar controls.

## Contributing

Have an idea, edge case, or design tweak for Draft Note?
Open an issue, start a discussion, or ship a pull request—everything from copy polish to PiP enhancements is welcome.
