import {
  type NotePlacement,
  moveNoteToDocument,
  restoreNote,
  showPlaceholder,
} from "./note.ts";

type DocumentPictureInPictureOptions = {
  width?: number;
  height?: number;
};

interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

function copyStyles(targetDocument: Document) {
  [...document.styleSheets].forEach((styleSheet) => {
    try {
      const style = targetDocument.createElement("style");
      style.textContent = [...styleSheet.cssRules]
        .map((rule) => rule.cssText)
        .join("");
      targetDocument.head.appendChild(style);
    } catch {
      if (styleSheet.href) {
        const link = targetDocument.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        targetDocument.head.appendChild(link);
      }
    }
  });
}

function ensureDocumentChrome(doc: Document) {
  if (!doc.documentElement) return;

  if (!doc.head) {
    const head = doc.createElement("head");
    doc.documentElement.prepend(head);
  }

  if (!doc.body) {
    const body = doc.createElement("body");
    doc.documentElement.appendChild(body);
  }

  doc.head.innerHTML = "";
  doc.body.innerHTML = "";
}

function injectPiPBaselineStyles(doc: Document) {
  const style = doc.createElement("style");
  style.textContent = `
    :root, body { height: 100%; margin: 0; }
    body { display: flex; align-items: stretch; }
    #note { flex: 1 1 auto; box-sizing: border-box; }
  `;
  doc.head.appendChild(style);
}

function setupPiPWindow(pipWindow: Window, context: NotePlacement) {
  const doc = pipWindow.document;
  if (!doc) return;

  ensureDocumentChrome(doc);
  doc.title = document.title || "Note";

  copyStyles(doc);
  injectPiPBaselineStyles(doc);

  showPlaceholder(context);
  moveNoteToDocument(context, doc);

  pipWindow.requestAnimationFrame(() => {
    context.element.focus({ preventScroll: true });
  });
}

function getDocumentPictureInPicture(): DocumentPictureInPicture | null {
  return window.documentPictureInPicture ?? null;
}

async function requestPiPWindow(): Promise<Window | null> {
  const documentPictureInPicture = getDocumentPictureInPicture();
  if (documentPictureInPicture) {
    return documentPictureInPicture.requestWindow({ width: 300, height: 300 });
  }

  return window.open("", "note", "width=340,height=260");
}

function guardNonNullWindow(win: Window | null): win is Window {
  return win !== null;
}

function attachPiPLifecycle(windowRef: Window, onClose: () => void) {
  const teardown = () => {
    onClose();
    windowRef.removeEventListener("pagehide", teardown);
    windowRef.removeEventListener("unload", teardown);
  };

  windowRef.addEventListener("pagehide", teardown, { once: true });
  windowRef.addEventListener("unload", teardown, { once: true });
}

let pipWindow: Window | null = null;

export async function openPiPWindow(context: NotePlacement): Promise<void> {
  if (pipWindow && !pipWindow.closed) {
    try {
      pipWindow.focus();
    } catch {
      /* focus errors can be safely ignored */
    }
    return;
  }

  pipWindow = await requestPiPWindow();
  if (!guardNonNullWindow(pipWindow)) return;

  const targetWindow = pipWindow;

  const initialise = () => setupPiPWindow(targetWindow, context);

  if (
    targetWindow.document?.readyState === "complete" ||
    targetWindow.document?.readyState === "interactive"
  ) {
    initialise();
  } else {
    targetWindow.addEventListener("load", initialise, { once: true });
  }

  attachPiPLifecycle(targetWindow, () => {
    restoreNote(context);
    pipWindow = null;
  });
}

export {};
