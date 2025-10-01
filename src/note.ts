import DOMPurify from "dompurify";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import {
  DEBOUNCE_DELAY_MS,
  NOTE_KEY_PREFIX,
  DEFAULT_STORAGE_KEY,
} from "./constants.ts";

type DebouncedFunction<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & { cancel: () => void };

function getStorageKey(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const scope = urlParams.get("s");
  return scope ? `${NOTE_KEY_PREFIX}${scope}` : DEFAULT_STORAGE_KEY;
}

function writeStoredValue(storageKey: string, value: string): void {
  localStorage.setItem(storageKey, compressToUTF16(value));
}

function readStoredValue(storageKey: string): string {
  const storedValue = localStorage.getItem(storageKey);
  if (storedValue === null) {
    return "";
  }

  try {
    const decompressed = decompressFromUTF16(storedValue);
    if (decompressed !== null) {
      return decompressed;
    }
  } catch {
    /* ignore malformed compressed content and fall back to raw value */
  }

  return storedValue;
}

function sanitizeHtml(markup: string): string {
  return DOMPurify.sanitize(markup, { USE_PROFILES: { html: true } });
}

function normalizeNoteElement(element: HTMLDivElement): string {
  const ownerDocument = element.ownerDocument ?? document;
  const textContent = element.textContent ?? "";
  const trimmedText = textContent.replace(/\u200b/gi, "").trim();

  if (!trimmedText) {
    if (element.innerHTML !== "<div><br></div>") {
      element.innerHTML = "<div><br></div>";
    }
    element.setAttribute("data-empty", "true");
    return element.innerHTML;
  }

  element.removeAttribute("data-empty");

  const hasElementChild = Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE
  );

  if (!hasElementChild) {
    const wrapper = ownerDocument.createElement("div");
    while (element.firstChild) {
      wrapper.appendChild(element.firstChild);
    }
    element.appendChild(wrapper);
  }

  return element.innerHTML;
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
): DebouncedFunction<T> {
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

export function getNoteElement(): HTMLDivElement {
  const element = document.getElementById("note");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Expected #note to be a contenteditable <div>.");
  }
  return element;
}

export type NotePlacement = {
  element: HTMLDivElement;
  originalParent: ParentNode | null;
  anchor: ChildNode | null;
  placeholder: HTMLDivElement;
};

export function createNotePlacement(element: HTMLDivElement): NotePlacement {
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

export function showPlaceholder(context: NotePlacement) {
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

export function restoreNote(context: NotePlacement) {
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

export function moveNoteToDocument(
  context: NotePlacement,
  targetDocument: Document
) {
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

export type NoteSync = {
  apply(value: string): string;
  queue(value: string): void;
  commit(value: string, options?: { broadcast?: boolean }): string;
  clear(options?: { broadcast?: boolean }): void;
};

function createNoteSynchronizer(
  element: HTMLDivElement,
  channel: BroadcastChannel,
  storageKey = getStorageKey()
): NoteSync {
  const persistContent = debounce((value: string) => {
    writeStoredValue(storageKey, value);
    channel.postMessage(value);
  }, DEBOUNCE_DELAY_MS);

  const apply = (value: string) => {
    const sanitized = sanitizeHtml(value);
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized;
    }
    const normalized = normalizeNoteElement(element);
    updateDocumentTitles(element);
    return normalized;
  };

  const commit = (value: string, options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    const normalized = apply(value);
    writeStoredValue(storageKey, normalized);
    if (options.broadcast !== false) {
      channel.postMessage(normalized);
    }
    return normalized;
  };

  const queue = (value: string) => {
    const normalized = apply(value);
    persistContent(normalized);
  };

  const clear = (options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    apply("");
    localStorage.removeItem(storageKey);
    if (options.broadcast !== false) {
      channel.postMessage("");
    }
  };

  return { apply, queue, commit, clear };
}

export function initializeNoteContent(
  context: NotePlacement,
  channel: BroadcastChannel
): NoteSync {
  const { element } = context;
  const storageKey = getStorageKey();
  const sync = createNoteSynchronizer(element, channel, storageKey);

  const savedValue = readStoredValue(storageKey);
  const normalizedSavedValue = sync.apply(savedValue);
  if (normalizedSavedValue !== savedValue) {
    writeStoredValue(storageKey, normalizedSavedValue);
  }

  element.addEventListener("input", () => {
    const normalizedHtml = normalizeNoteElement(element);
    sync.queue(normalizedHtml);
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
