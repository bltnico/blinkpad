import DOMPurify from "dompurify";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import {
  DEBOUNCE_DELAY_MS,
  NOTE_KEY_PREFIX,
  DEFAULT_STORAGE_KEY,
} from "./constants.ts";
import storage from "./storage.ts";
import { deleteNoteMetadata, saveNoteMetadata } from "./utils/noteMetadata.ts";

type DebouncedFunction<T extends (...args: any[]) => void> = ((
  ...args: Parameters<T>
) => void) & { cancel: () => void };

function getStorageKey(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const scope = urlParams.get("s");
  return scope ? `${NOTE_KEY_PREFIX}${scope}` : DEFAULT_STORAGE_KEY;
}

async function writeStoredValue(
  storageKey: string,
  value: string
): Promise<void> {
  try {
    await storage.setItem(storageKey, compressToUTF16(value));
  } catch (error) {
    console.error("Unable to persist note content", error);
  }
}

async function readStoredValue(storageKey: string): Promise<string> {
  try {
    const storedValue = await storage.getItem<string>(storageKey);
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
  } catch (error) {
    console.error("Unable to read stored note content", error);
    return "";
  }
}

async function removeStoredValue(storageKey: string): Promise<void> {
  try {
    await storage.removeItem(storageKey);
  } catch (error) {
    console.error("Unable to remove stored note content", error);
  }
}

function sanitizeHtml(markup: string): string {
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["contenteditable", "target"],
  });
}

function looksLikeHtml(markup: string): boolean {
  const trimmed = markup.trim();
  if (!trimmed) {
    return false;
  }

  if (/^<!DOCTYPE[\s\S]*>/i.test(trimmed)) {
    return true;
  }

  if (/^<(html|body)\b/i.test(trimmed)) {
    return true;
  }

  return /<([a-z][\w-]*)([^>]*)>/i.test(trimmed);
}

function tryHandleHtmlPaste(
  element: HTMLDivElement,
  event: ClipboardEvent
): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return false;
  }

  const clipboardHtml = clipboardData.getData("text/html");
  const clipboardText = clipboardData.getData("text/plain");

  let candidateMarkup: string | null = null;

  if (clipboardHtml && looksLikeHtml(clipboardHtml)) {
    candidateMarkup = clipboardHtml;
  } else if (clipboardText && looksLikeHtml(clipboardText)) {
    candidateMarkup = clipboardText;
  }

  if (!candidateMarkup) {
    return false;
  }

  const sanitizedMarkup = sanitizeHtml(candidateMarkup);

  const ownerDocument = element.ownerDocument ?? document;
  const template = ownerDocument.createElement("template");
  template.innerHTML = sanitizedMarkup;

  const sourceRoot = template.content.querySelector("body") ?? template.content;

  if (!sourceRoot.childNodes.length) {
    return false;
  }

  event.preventDefault();

  const selection = ownerDocument.getSelection();
  let range: Range | null = null;
  if (selection && selection.rangeCount > 0) {
    const candidateRange = selection.getRangeAt(0);
    const commonAncestor = candidateRange.commonAncestorContainer;
    if (element === commonAncestor || element.contains(commonAncestor)) {
      range = candidateRange;
    }
  }

  if (!range) {
    range = ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }

  const fragment = ownerDocument.createDocumentFragment();
  const insertedNodes: ChildNode[] = [];
  while (sourceRoot.firstChild) {
    const node = sourceRoot.firstChild;
    insertedNodes.push(node);
    fragment.appendChild(node);
  }

  range.deleteContents();
  range.insertNode(fragment);

  const caretTarget = [...insertedNodes]
    .reverse()
    .find((node) =>
      node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE
    );
  if (caretTarget) {
    range.setStartAfter(caretTarget);
    range.collapse(true);
    const activeSelection = ownerDocument.getSelection();
    activeSelection?.removeAllRanges();
    activeSelection?.addRange(range);
  }

  return true;
}

function tryHandleUrlPaste(
  element: HTMLDivElement,
  event: ClipboardEvent
): boolean {
  const pastedText = event.clipboardData?.getData("text/plain")?.trim();
  if (!pastedText || !/^https?:\/\/\S+$/i.test(pastedText)) {
    return false;
  }

  event.preventDefault();

  const doc = element.ownerDocument ?? document;
  const pastedUrl = new URL(pastedText);
  const isInternalLink = window.location.origin === pastedUrl.origin;

  const link = doc.createElement("a");
  link.href = pastedText;
  link.target = isInternalLink ? "_self" : "_blank";
  link.textContent = isInternalLink
    ? `Note @${pastedUrl.pathname.slice(1)}`
    : pastedText;
  link.setAttribute("contenteditable", "false");

  const linkBlock = doc.createElement("div");
  linkBlock.appendChild(link);

  const emptyBlock = doc.createElement("div");
  emptyBlock.appendChild(doc.createElement("br"));

  const fragment = doc.createDocumentFragment();
  fragment.append(linkBlock, emptyBlock);

  const selection = doc.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(fragment);

    const parentBlock = linkBlock.parentElement;
    if (parentBlock && parentBlock !== element) {
      parentBlock.after(linkBlock, emptyBlock);
    }
  } else {
    element.appendChild(fragment);
  }

  const caretRange = doc.createRange();
  caretRange.setStart(emptyBlock, 0);
  caretRange.collapse(true);

  const activeSelection = doc.getSelection();
  activeSelection?.removeAllRanges();
  activeSelection?.addRange(caretRange);

  return true;
}

const NON_TEXT_CONTENT_SELECTOR =
  "img, svg, canvas, video, audio, object, embed, iframe, picture, figure, hr";

function normalizeNoteElement(element: HTMLDivElement): string {
  const ownerDocument = element.ownerDocument ?? document;
  const textContent = element.textContent ?? "";
  const trimmedText = textContent.replace(/\u200b/gi, "").trim();

  const hasNonTextContent =
    trimmedText === "" &&
    element.querySelector(NON_TEXT_CONTENT_SELECTOR) !== null;

  if (!trimmedText && !hasNonTextContent) {
    if (element.innerHTML !== "<div><br></div>") {
      element.innerHTML = "<div><br></div>";
    }
    element.setAttribute("data-empty", "true");
    return element.innerHTML;
  }

  element.removeAttribute("data-empty");

  const hasElementChild = Array.from(element.childNodes).some((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const elementNode = node as HTMLElement;
    if (elementNode.matches(NON_TEXT_CONTENT_SELECTOR)) {
      return true;
    }
    const text = elementNode.textContent?.replace(/\u200b/gi, "").trim();
    return Boolean(text);
  });

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

type IdleCallbackHandle = number;

type IdleCallback = (deadline: {
  didTimeout: boolean;
  timeRemaining(): number;
}) => void;

type IdleRequestOptions = {
  timeout?: number;
};

type ScheduleTitleUpdate = ((immediate?: boolean) => void) & {
  cancel: () => void;
  flush: () => void;
};

function requestIdleCallbackCompat(
  callback: IdleCallback,
  options?: IdleRequestOptions
): IdleCallbackHandle {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, options);
  }
  return window.setTimeout(() => {
    callback({ didTimeout: true, timeRemaining: () => 0 });
  }, options?.timeout ?? 1);
}

function cancelIdleCallbackCompat(handle: IdleCallbackHandle) {
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

function deriveTitleFromMarkup(markup: string): string {
  if (!markup) {
    return "Note";
  }
  const scratch = document.createElement("div");
  scratch.innerHTML = markup;
  const textContent = scratch.textContent ?? "";
  const firstLine = textContent.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine || "Note";
}

function getSlugFromStorageKey(storageKey: string): string {
  if (storageKey.startsWith(NOTE_KEY_PREFIX)) {
    const slug = storageKey.slice(NOTE_KEY_PREFIX.length);
    return slug || "root";
  }
  return "root";
}

function normalizeMarkup(markup: string, ownerDocument: Document): string {
  const container = ownerDocument.createElement("div");
  container.innerHTML = markup;
  return normalizeNoteElement(container as HTMLDivElement);
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
  const ownerDocument = element.ownerDocument ?? document;
  const slug = getSlugFromStorageKey(storageKey);

  let lastKnownDomValue = normalizeNoteElement(element);
  let lastPersistedValue: string | null = null;

  const scheduleDocumentTitleUpdate: ScheduleTitleUpdate = (() => {
    const run = () => {
      updateDocumentTitles(element);
    };

    let timeoutId: number | undefined;
    let idleHandle: IdleCallbackHandle | null = null;

    const enqueue = () => {
      if (idleHandle !== null) {
        cancelIdleCallbackCompat(idleHandle);
      }
      idleHandle = requestIdleCallbackCompat(
        () => {
          idleHandle = null;
          run();
        },
        { timeout: 500 }
      );
    };

    const schedule = ((immediate?: boolean) => {
      if (immediate) {
        schedule.cancel();
        run();
        return;
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        enqueue();
      }, 250);
    }) as ScheduleTitleUpdate;

    schedule.cancel = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (idleHandle !== null) {
        cancelIdleCallbackCompat(idleHandle);
        idleHandle = null;
      }
    };

    schedule.flush = () => {
      schedule.cancel();
      run();
    };

    return schedule;
  })();

  const persistImmediately = (
    value: string,
    options: { broadcast?: boolean } = {}
  ): string => {
    const sanitized = sanitizeHtml(value);
    const normalized = normalizeMarkup(sanitized, ownerDocument);
    const summaryElement = ownerDocument.createElement("div");
    summaryElement.innerHTML = normalized;
    const summaryText = summaryElement.textContent
      ?.replace(/\u200b/gi, "")
      .trim();
    const hasContent = Boolean(summaryText);
    const hasNonTextContent =
      summaryElement.querySelector(NON_TEXT_CONTENT_SELECTOR) !== null;
    const isEffectivelyEmpty = !hasContent && !hasNonTextContent;
    if (isEffectivelyEmpty) {
      lastPersistedValue = "";
      void removeStoredValue(storageKey);
      void deleteNoteMetadata(slug);
      if (options.broadcast !== false) {
        channel.postMessage("");
      }
      return "";
    }
    if (normalized === lastPersistedValue) {
      return normalized;
    }
    lastPersistedValue = normalized;
    const title = deriveTitleFromMarkup(normalized);
    void saveNoteMetadata({ slug, title, updatedAt: Date.now() });
    void writeStoredValue(storageKey, normalized);
    if (options.broadcast !== false) {
      channel.postMessage(normalized);
    }
    return normalized;
  };

  const persistContent = debounce((value: string) => {
    persistImmediately(value);
  }, DEBOUNCE_DELAY_MS);

  const apply = (value: string) => {
    const sanitized = sanitizeHtml(value);
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized;
    }
    const normalized = normalizeNoteElement(element);
    lastKnownDomValue = normalized;
    persistImmediately(normalized, { broadcast: false });
    scheduleDocumentTitleUpdate.flush();
    return normalized;
  };

  const commit = (value: string, options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    const sanitized = sanitizeHtml(value);
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized;
    }
    const normalized = normalizeNoteElement(element);
    lastKnownDomValue = normalized;
    const persisted = persistImmediately(normalized, options);
    scheduleDocumentTitleUpdate.flush();
    return persisted;
  };

  const queue = (value: string) => {
    if (value === lastKnownDomValue) {
      return;
    }
    lastKnownDomValue = value;
    scheduleDocumentTitleUpdate();
    persistContent(value);
  };

  const clear = (options: { broadcast?: boolean } = {}) => {
    persistContent.cancel();
    element.innerHTML = "";
    const normalizedEmpty = normalizeNoteElement(element);
    lastKnownDomValue = normalizedEmpty;
    lastPersistedValue = "";
    void deleteNoteMetadata(slug);
    void removeStoredValue(storageKey);
    if (options.broadcast !== false) {
      channel.postMessage("");
    }
    scheduleDocumentTitleUpdate.flush();
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

  void readStoredValue(storageKey).then((savedValue) => {
    sync.apply(savedValue);
  });

  element.addEventListener("paste", (event: ClipboardEvent) => {
    if (tryHandleHtmlPaste(element, event)) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (tryHandleUrlPaste(element, event)) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

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
