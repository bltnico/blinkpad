import { exportNoteAsImage } from "./imageExport.ts";
import { openPiPWindow } from "./pip.ts";
import { setupColorSchemeManagement } from "./colorScheme.ts";
import { POP_OUT_BUTTON_ID, COLOR_SCHEME_BUTTON_ID } from "./constants.ts";
import {
  getNormalizedNoteMarkup,
  restoreNote,
  type NotePlacement,
  type NoteSync,
} from "./note.ts";
import { isMobileDevice } from "./utils/device.ts";
import { setupNewNoteSheet } from "./newNoteSheet.ts";
import { createShareLink } from "./share.ts";

type NavbarOptions = {
  context: NotePlacement;
  noteElement: HTMLDivElement;
  noteSync: NoteSync;
};

type ButtonLookupMessages = {
  missing: string;
  invalid: string;
};

function getButtonById(
  id: string,
  messages: ButtonLookupMessages
): HTMLButtonElement | null {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(messages.missing);
    return null;
  }

  if (!(element instanceof HTMLButtonElement)) {
    console.warn(messages.invalid);
    return null;
  }

  return element;
}

function setupPopOutButton(context: NotePlacement) {
  const popOutTrigger = getButtonById(POP_OUT_BUTTON_ID, {
    missing: `#${POP_OUT_BUTTON_ID} button is missing; PiP will be unavailable.`,
    invalid: `#${POP_OUT_BUTTON_ID} element is not a button; PiP will be unavailable.`,
  });
  if (!popOutTrigger) return;

  if (isMobileDevice()) {
    popOutTrigger.style.display = "none";
    return;
  }

  popOutTrigger.addEventListener("click", () => {
    openPiPWindow(context).catch((error) => {
      console.error("Unable to open PiP window", error);
      restoreNote(context);
    });
  });
}

function setupPiPKeyboardShortcut(context: NotePlacement) {
  if (isMobileDevice()) {
    return;
  }

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openPiPWindow(context);
    }
  });
}

function setupNewNoteButton(noteElement: HTMLDivElement, noteSync: NoteSync) {
  const newNoteTrigger = getButtonById("new", {
    missing: "#new button is missing; reset action unavailable.",
    invalid: "#new element is not a button; reset action unavailable.",
  });
  if (!newNoteTrigger) return;

  const sheetInitialized = setupNewNoteSheet(newNoteTrigger);
  if (sheetInitialized) {
    return;
  }

  newNoteTrigger.addEventListener("click", () => {
    noteSync.clear();
    try {
      noteElement.focus({ preventScroll: true });
    } catch {
      /* focus can fail if element is in a background document */
    }
  });
}

function restoreShareLabel(button: HTMLButtonElement, label: string) {
  window.setTimeout(() => {
    button.setAttribute("aria-label", label);
  }, 1800);
}

async function copyShareUrlToClipboard(
  shareUrl: string,
  trigger: HTMLButtonElement
) {
  const originalLabel = trigger.getAttribute("aria-label") ?? "Share";
  try {
    await navigator.clipboard.writeText(shareUrl);
    trigger.setAttribute("aria-label", "Share link copied!");
    restoreShareLabel(trigger, originalLabel);
  } catch {
    window.prompt(
      "Copy this link and open it on your other device:",
      shareUrl
    );
    trigger.setAttribute("aria-label", originalLabel);
  }
}

async function tryNativeShare(
  noteElement: HTMLDivElement,
  shareUrl: string
): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }
  try {
    await navigator.share({
      title: document.title || "Note",
      text: noteElement.innerText.trim(),
      url: shareUrl,
    });
    return true;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      return true;
    }
    console.warn("Native share failed", error);
    return false;
  }
}

function setupShareButton(noteElement: HTMLDivElement) {
  const shareNoteTrigger = getButtonById("share", {
    missing: "#share button is missing; share action unavailable.",
    invalid: "#share element is not a button; share action unavailable.",
  });
  if (!shareNoteTrigger) return;

  shareNoteTrigger.addEventListener("click", () => {
    if (shareNoteTrigger.disabled) {
      return;
    }
    shareNoteTrigger.disabled = true;
    const originalLabel = shareNoteTrigger.getAttribute("aria-label") ?? "Share";
    void (async () => {
      try {
        const markup = getNormalizedNoteMarkup(noteElement);
        const { url: shareUrl } = await createShareLink(markup);
        const usedNativeShare = await tryNativeShare(noteElement, shareUrl);
        if (usedNativeShare) {
          return;
        }
        await copyShareUrlToClipboard(shareUrl, shareNoteTrigger);
      } catch (error) {
        console.error("Unable to share note", error);
        const message =
          error instanceof Error ? error.message : "Unknown error.";
        window.alert(`Unable to share note: ${message}`);
        shareNoteTrigger.setAttribute("aria-label", originalLabel);
      } finally {
        shareNoteTrigger.disabled = false;
      }
    })();
  });
}

function setupCopyButton(noteElement: HTMLDivElement) {
  const copyNoteTrigger = getButtonById("copy", {
    missing: "#copy button is missing; copy action unavailable.",
    invalid: "#copy element is not a button; copy action unavailable.",
  });
  if (!copyNoteTrigger) return;

  copyNoteTrigger.addEventListener("click", () => {
    try {
      navigator.clipboard.writeText(noteElement.innerHTML || "");
    } catch {}
  });
}

function setupImageExportButton(noteElement: HTMLDivElement) {
  const imageExportButton = getButtonById("image-export", {
    missing: "#image-export button is missing; image export unavailable.",
    invalid: "#image-export element is not a button; image export unavailable.",
  });
  if (!imageExportButton) return;

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

function setupColorSchemeToggle() {
  const colorSchemeButton = getButtonById(COLOR_SCHEME_BUTTON_ID, {
    missing: `#${COLOR_SCHEME_BUTTON_ID} button is missing; color scheme toggle unavailable.`,
    invalid: `#${COLOR_SCHEME_BUTTON_ID} element is not a button; color scheme toggle unavailable.`,
  });
  void setupColorSchemeManagement(colorSchemeButton);
}

export function setupNavbar({ context, noteElement, noteSync }: NavbarOptions) {
  setupColorSchemeToggle();
  setupPopOutButton(context);
  setupPiPKeyboardShortcut(context);
  setupNewNoteButton(noteElement, noteSync);
  setupShareButton(noteElement);
  setupCopyButton(noteElement);
  setupImageExportButton(noteElement);
}

export {};
