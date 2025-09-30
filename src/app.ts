import DOMPurify from "dompurify";
import html2canvas from "html2canvas";

const STORAGE_KEY = "note";
const CHANNEL_NAME = "note-sync";
const POP_OUT_BUTTON_ID = "popout";
const DEBOUNCE_DELAY_MS = 200;
const COLOR_SCHEME_BUTTON_ID = "color-scheme";
const COLOR_SCHEME_STORAGE_KEY = "color-scheme-preference";

type ColorScheme = "light" | "dark";
type ColorSchemePreference = ColorScheme | "auto";

type DocumentPictureInPictureOptions = {
  width?: number;
  height?: number;
};

interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
}

function getStorageKey(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const scope = urlParams.get("scope");
  return scope ?? STORAGE_KEY;
}

function getSystemColorScheme(query?: MediaQueryList): ColorScheme {
  const mediaQuery = query ?? window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery.matches ? "dark" : "light";
}

function loadStoredColorSchemePreference(): ColorSchemePreference {
  const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "auto";
}

function persistColorSchemePreference(preference: ColorSchemePreference) {
  if (preference === "auto") {
    localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
  } else {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, preference);
  }
}

function applyColorSchemePreference(preference: ColorSchemePreference) {
  const root = document.documentElement;
  if (preference === "auto") {
    root.removeAttribute("data-theme");
    return;
  }

  root.setAttribute("data-theme", preference);
}

function getNextColorSchemePreference(
  current: ColorSchemePreference,
  system: ColorScheme
): ColorSchemePreference {
  if (current === "auto") {
    return system === "dark" ? "light" : "dark";
  }

  if (current === "light") {
    return "dark";
  }

  return "auto";
}

function describeColorSchemePreference(
  preference: ColorSchemePreference,
  effective: ColorScheme
): string {
  const capitalise = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);
  if (preference === "auto") {
    return `System (${capitalise(effective)})`;
  }
  return capitalise(preference);
}

function resolveNoteBackgroundColor(element: HTMLElement): string {
  const ownerDocument = element.ownerDocument ?? document;
  const defaultView = ownerDocument.defaultView ?? window;

  const elementBackground =
    defaultView.getComputedStyle(element).backgroundColor;
  if (
    elementBackground &&
    elementBackground !== "transparent" &&
    elementBackground !== "rgba(0, 0, 0, 0)"
  ) {
    return elementBackground;
  }

  const rootBackground = ownerDocument.documentElement
    ? defaultView
        .getComputedStyle(ownerDocument.documentElement)
        .getPropertyValue("--background-color")
        .trim()
    : "";
  if (rootBackground) {
    return rootBackground;
  }

  const body = ownerDocument.body ?? document.body;
  return defaultView.getComputedStyle(body).backgroundColor;
}

function createImageFileName(): string {
  const baseTitle = (document.title || "note").trim().toLowerCase();
  const normalisedBase =
    baseTitle.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "note";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${normalisedBase}-${timestamp}.png`;
}

function addMatchMediaChangeListener(
  query: MediaQueryList,
  handler: (event: MediaQueryListEvent) => void
): () => void {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }

  if (typeof query.addListener === "function") {
    query.addListener(handler);
    return () => query.removeListener(handler);
  }

  return () => {};
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

type NotePlacement = {
  element: HTMLDivElement;
  originalParent: ParentNode | null;
  anchor: ChildNode | null;
  placeholder: HTMLDivElement;
};

type NoteSync = {
  apply(value: string): string;
  queue(value: string): void;
  commit(value: string, options?: { broadcast?: boolean }): string;
  clear(options?: { broadcast?: boolean }): void;
};

function sanitizeHtml(markup: string): string {
  return DOMPurify.sanitize(markup, { USE_PROFILES: { html: true } });
}

function updateDocumentTitles(sourceElement: HTMLDivElement) {
  const textContent = sourceElement.innerText || "";
  const firstLine = textContent.split(/\r?\n/)[0]?.trim() ?? "";
  const title = firstLine || "Note";

  document.title = title;

  const ownerDocument = sourceElement.ownerDocument;
  if (ownerDocument && ownerDocument !== document) {
    ownerDocument.title = title;
  }
}

function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: number | undefined;
  const debounced = (...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
  return debounced;
}

function getNoteElement(): HTMLDivElement {
  const element = document.getElementById("note");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Expected #note to be a contenteditable <div>.");
  }
  return element;
}

function createNotePlacement(element: HTMLDivElement): NotePlacement {
  const placeholder = document.createElement("div");
  placeholder.id = "note-placeholder";
  placeholder.className = "note-placeholder";
  placeholder.textContent = "Note is open in the pop-out window.";
  placeholder.setAttribute("role", "status");
  placeholder.setAttribute("aria-live", "polite");

  return {
    element,
    originalParent: element.parentNode,
    anchor: element.nextSibling,
    placeholder,
  };
}

function showPlaceholder(context: NotePlacement) {
  const { element, placeholder } = context;
  if (placeholder.isConnected) return;

  if (element.isConnected && element.ownerDocument === document) {
    context.anchor = element.nextSibling;
    element.replaceWith(placeholder);
    return;
  }

  const targetParent = context.originalParent;
  if (targetParent) {
    targetParent.insertBefore(placeholder, context.anchor);
    return;
  }

  document.body.appendChild(placeholder);
}

function restoreNote(context: NotePlacement) {
  const { element, placeholder } = context;

  if (element.ownerDocument !== document) {
    document.adoptNode(element);
  }

  if (placeholder.isConnected) {
    placeholder.replaceWith(element);
  } else if (context.originalParent) {
    context.originalParent.insertBefore(element, context.anchor);
  } else {
    document.body.appendChild(element);
  }

  context.anchor = element.nextSibling;
}

function moveNoteToDocument(context: NotePlacement, targetDocument: Document) {
  const { element } = context;
  const adoptedElement =
    element.ownerDocument === targetDocument
      ? element
      : (targetDocument.adoptNode(element) as HTMLDivElement);

  const targetBody =
    targetDocument.body ?? targetDocument.createElement("body");
  if (!targetBody.isConnected) {
    targetDocument.documentElement.appendChild(targetBody);
  }

  targetBody.appendChild(adoptedElement);
}

function createNoteSynchronizer(
  element: HTMLDivElement,
  channel: BroadcastChannel
): NoteSync {
  const persistContent = debounce((value: string) => {
    localStorage.setItem(getStorageKey(), value);
    channel.postMessage(value);
  }, DEBOUNCE_DELAY_MS);

  const apply = (value: string) => {
    const sanitized = sanitizeHtml(value);
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized;
    }
    updateDocumentTitles(element);
    return sanitized;
  };

  const commit = (value: string, options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    const sanitized = apply(value);
    localStorage.setItem(getStorageKey(), sanitized);
    if (options.broadcast !== false) {
      channel.postMessage(sanitized);
    }
    return sanitized;
  };

  const queue = (value: string) => {
    const sanitized = apply(value);
    persistContent(sanitized);
  };

  const clear = (options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    apply("");
    localStorage.removeItem(getStorageKey());
    if (options.broadcast !== false) {
      channel.postMessage("");
    }
  };

  return { apply, queue, commit, clear };
}

function initializeNoteContent(
  context: NotePlacement,
  channel: BroadcastChannel
): NoteSync {
  const { element } = context;
  const sync = createNoteSynchronizer(element, channel);

  const savedValue = localStorage.getItem(getStorageKey()) || "";
  const sanitizedSavedValue = sync.apply(savedValue);
  if (sanitizedSavedValue !== savedValue) {
    localStorage.setItem(getStorageKey(), sanitizedSavedValue);
  }

  element.addEventListener("input", () => {
    sync.queue(element.innerHTML);
  });

  channel.addEventListener("message", (event) => {
    const value =
      typeof event.data === "string" ? event.data : event.data?.value;
    if (typeof value !== "string") return;

    const activeElement = element.ownerDocument?.activeElement;
    if (activeElement !== element) {
      sync.apply(value);
    }
  });

  return sync;
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

function setupColorSchemeManagement(button: HTMLButtonElement | null) {
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = loadStoredColorSchemePreference();

  const updateToggleDescription = () => {
    if (!button) return;

    const systemScheme = getSystemColorScheme(systemQuery);
    const effectiveScheme = preference === "auto" ? systemScheme : preference;
    const description = describeColorSchemePreference(
      preference,
      effectiveScheme
    );
    const nextPreference = getNextColorSchemePreference(
      preference,
      systemScheme
    );
    const nextEffectiveScheme =
      nextPreference === "auto"
        ? getSystemColorScheme(systemQuery)
        : nextPreference;
    const nextDescription = describeColorSchemePreference(
      nextPreference,
      nextEffectiveScheme
    );
    const label = `Color scheme: ${description}. Click to switch to ${nextDescription}.`;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(preference !== "auto"));
  };

  const applyPreference = () => {
    applyColorSchemePreference(preference);
    updateToggleDescription();
  };

  applyPreference();

  addMatchMediaChangeListener(systemQuery, () => {
    applyPreference();
  });

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    const systemScheme = getSystemColorScheme(systemQuery);
    preference = getNextColorSchemePreference(preference, systemScheme);
    applyColorSchemePreference(preference);
    persistColorSchemePreference(preference);
    updateToggleDescription();
  });
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

async function openPiPWindow(context: NotePlacement) {
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
        navigator.share?.({
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
        const backgroundColor = resolveNoteBackgroundColor(noteElement);
        const canvas = await html2canvas(noteElement, {
          backgroundColor,
          scale: window.devicePixelRatio || 1,
          useCORS: true,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = dataUrl;
        downloadLink.download = createImageFileName();
        downloadLink.rel = "noopener";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
      } catch (error) {
        console.error("Unable to export note as image", error);
      } finally {
        imageExportButton.disabled = false;
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    channel.close();
  });
}

bootstrap();

export {};
