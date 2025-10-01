import { exportNoteAsImage } from "./imageExport.ts";
import { openPiPWindow } from "./pip.ts";
import { setupColorSchemeManagement } from "./colorScheme.ts";
import {
  createNotePlacement,
  getNoteElement,
  initializeNoteContent,
  restoreNote,
} from "./note.ts";
import {
  CHANNEL_NAME,
  COLOR_SCHEME_BUTTON_ID,
  POP_OUT_BUTTON_ID,
} from "./constants.ts";
import { setupSavedNotesSheet } from "./sheet.ts";

function bootstrap() {
  const noteElement = getNoteElement();
  const context = createNotePlacement(noteElement);
  const channel = new BroadcastChannel(CHANNEL_NAME);

  const noteSync = initializeNoteContent(context, channel);

  const colorSchemeElement = document.getElementById(COLOR_SCHEME_BUTTON_ID);
  const colorSchemeToggle =
    colorSchemeElement instanceof HTMLButtonElement ? colorSchemeElement : null;
  if (!colorSchemeElement) {
    console.warn(
      `#${COLOR_SCHEME_BUTTON_ID} button is missing; color scheme toggle unavailable.`
    );
  } else if (!colorSchemeToggle) {
    console.warn(
      `#${COLOR_SCHEME_BUTTON_ID} element is not a button; color scheme toggle unavailable.`
    );
  }

  setupColorSchemeManagement(colorSchemeToggle);

  const popOutTrigger = document.getElementById(POP_OUT_BUTTON_ID);
  if (!popOutTrigger) {
    console.warn(
      `#${POP_OUT_BUTTON_ID} button is missing; PiP will be unavailable.`
    );
  } else {
    popOutTrigger.addEventListener("click", () => {
      openPiPWindow(context).catch((error) => {
        console.error("Unable to open PiP window", error);
        restoreNote(context);
      });
    });
  }

  const newNoteTrigger = document.getElementById("new");
  if (!newNoteTrigger) {
    console.warn("#new button is missing; reset action unavailable.");
  } else {
    newNoteTrigger.addEventListener("click", () => {
      noteSync.clear();
      try {
        noteElement.focus({ preventScroll: true });
      } catch {
        /* focus can fail if element is in a background document */
      }
    });
  }

  const shareNoteTrigger = document.getElementById("share");
  if (!shareNoteTrigger) {
    console.warn("#share button is missing; share action unavailable.");
  } else {
    shareNoteTrigger.addEventListener("click", () => {
      try {
        // @todo share as html file
        // const blob = new Blob([noteElement.innerHTML], { type: "text/html" });
        // const file = new File([blob], "shared.html", { type: "text/html" });
        navigator.share?.({
          // files: [file],
          title: document.title || "Note",
          text: noteElement.outerText,
        });
      } catch {}
    });
  }

  const copyNoteTrigger = document.getElementById("copy");
  if (!copyNoteTrigger) {
    console.warn("#copy button is missing; copy action unavailable.");
  } else {
    copyNoteTrigger.addEventListener("click", () => {
      try {
        navigator.clipboard.writeText(noteElement.innerHTML || "");
      } catch {}
    });
  }

  const imageExportElement = document.getElementById("image-export");
  const imageExportButton =
    imageExportElement instanceof HTMLButtonElement ? imageExportElement : null;
  if (!imageExportElement) {
    console.warn("#image-export button is missing; image export unavailable.");
  } else if (!imageExportButton) {
    console.warn(
      "#image-export element is not a button; image export unavailable."
    );
  } else {
    imageExportButton.addEventListener("click", async () => {
      imageExportButton.disabled = true;
      try {
        await exportNoteAsImage(noteElement);
      } catch (error) {
        console.error("Unable to export note as image", error);
      } finally {
        imageExportButton.disabled = false;
      }
    });
  }

  setupSavedNotesSheet();

  window.addEventListener("beforeunload", () => {
    channel.close();
  });
}

bootstrap();

export {};
