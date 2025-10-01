import {
  createNotePlacement,
  getNoteElement,
  initializeNoteContent,
} from "./note.ts";
import { CHANNEL_NAME } from "./constants.ts";
import { setupSavedNotesSheet } from "./sheet.ts";
import { setupNavbar } from "./navbar.ts";

function bootstrap() {
  const noteElement = getNoteElement();
  const context = createNotePlacement(noteElement);
  const channel = new BroadcastChannel(CHANNEL_NAME);

  const noteSync = initializeNoteContent(context, channel);
  setupNavbar({ context, noteElement, noteSync });

  setupSavedNotesSheet();

  window.addEventListener("beforeunload", () => {
    channel.close();
  });
}

bootstrap();

export {};
