import { createBottomSheet } from "@plainsheet/core";
import { NOTE_KEY_PREFIX } from "./constants.ts";

type NewNoteSheetElements = {
  form: HTMLFormElement | null;
  input: HTMLInputElement | null;
  warning: HTMLElement | null;
  closeButton: HTMLButtonElement | null;
  cancelButton: HTMLButtonElement | null;
};

const SHEET_TEMPLATE = `
  <section class="note-sheet" aria-label="Create a new note">
    <header class="note-sheet__header">
      <h2 class="note-sheet__title">Start a new note</h2>
      <button type="button" class="note-sheet__close" data-new-note="close" aria-label="Close create note"></button>
    </header>
    <p class="note-sheet__intro">Name your note to create a permanent workspace. Leave it blank and we'll generate a random key for you.</p>
    <form class="note-sheet__form" data-new-note="form">
      <label class="note-sheet__label">
        <span>Note key</span>
        <input type="text" inputmode="text" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="64" name="project-plans" placeholder="project-plans" data-new-note="input" />
        <span class="note-sheet__hint">Use lowercase letters, numbers, and dashes. Leave blank to auto-generate.</span>
      </label>
      <p class="note-sheet__warning" data-new-note="warning" hidden></p>
      <div class="note-sheet__actions">
        <button type="button" class="note-sheet__button" data-new-note="cancel">Cancel</button>
        <button type="submit" class="note-sheet__button note-sheet__button--primary">Create note</button>
      </div>
    </form>
  </section>
`;

const RESERVED_KEYS = new Set(["", "root"]);

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const generateRandomSlug = (): string => {
  const array = new Uint32Array(2);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(array);
  } else {
    array[0] = Math.floor(Math.random() * 0xffffffff);
    array[1] = Math.floor(Math.random() * 0xffffffff);
  }
  const slug = Array.from(array)
    .map((value) => value.toString(36))
    .join("")
    .replace(/[^a-z0-9]/g, "");
  return slug.slice(0, 9) || Math.random().toString(36).slice(2, 11);
};

const doesSlugExist = (slug: string): boolean => {
  try {
    const storageKey = `${NOTE_KEY_PREFIX}${slug}`;
    return localStorage.getItem(storageKey) !== null;
  } catch (error) {
    console.warn("Unable to read localStorage to verify note key", error);
    return false;
  }
};

const buildTargetUrl = (slug: string) => {
  if (slug === "root") {
    return "/";
  }
  return `/?s=${encodeURIComponent(slug)}`;
};

const collectElements = (
  contentWrapper: HTMLElement | null
): NewNoteSheetElements => {
  if (!contentWrapper) {
    return {
      form: null,
      input: null,
      warning: null,
      closeButton: null,
      cancelButton: null,
    };
  }

  return {
    form: contentWrapper.querySelector<HTMLFormElement>(
      "[data-new-note='form']"
    ),
    input: contentWrapper.querySelector<HTMLInputElement>(
      "[data-new-note='input']"
    ),
    warning: contentWrapper.querySelector<HTMLElement>(
      "[data-new-note='warning']"
    ),
    closeButton: contentWrapper.querySelector<HTMLButtonElement>(
      "[data-new-note='close']"
    ),
    cancelButton: contentWrapper.querySelector<HTMLButtonElement>(
      "[data-new-note='cancel']"
    ),
  };
};

export function setupNewNoteSheet(trigger: HTMLButtonElement): boolean {
  const bottomSheet = createBottomSheet({
    ariaLabel: "Create note",
    shouldShowBackdrop: true,
    shouldShowHandle: false,
    rootClass: "note-sheet-root",
    containerClass: "note-sheet-container",
    contentWrapperClass: "note-sheet-content",
    backdropClass: "note-sheet-backdrop",
    content: SHEET_TEMPLATE,
  });
  bottomSheet.mount();

  const contentWrapper = bottomSheet.elements.bottomSheetContentWrapper;
  if (!(contentWrapper instanceof HTMLElement)) {
    console.warn("Create note sheet content wrapper not found.");
    return false;
  }

  const { form, input, warning, closeButton, cancelButton } =
    collectElements(contentWrapper);

  if (!form || !input) {
    console.warn("Create note sheet form elements are missing.");
    return false;
  }

  const hideWarning = () => {
    if (!warning) return;
    warning.hidden = true;
    warning.textContent = "";
  };

  const showWarning = (message: string) => {
    if (!warning) return;
    warning.textContent = message;
    warning.hidden = false;
  };

  const resetForm = () => {
    input.value = "";
    hideWarning();
  };

  const focusInput = () => {
    window.setTimeout(() => {
      input.focus({ preventScroll: true });
    }, 120);
  };

  const navigateToSlug = (slug: string) => {
    const targetUrl = buildTargetUrl(slug);
    window.location.assign(targetUrl);
  };

  trigger.addEventListener("click", () => {
    resetForm();
    bottomSheet.open();
    focusInput();
  });

  closeButton?.addEventListener("click", () => {
    bottomSheet.close();
  });

  cancelButton?.addEventListener("click", () => {
    bottomSheet.close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideWarning();

    const rawValue = input.value;
    const slug =
      slugify(rawValue) ||
      (() => {
        for (let attempts = 0; attempts < 5; attempts += 1) {
          const generated = generateRandomSlug();
          if (!doesSlugExist(generated)) {
            return generated;
          }
        }
        return "";
      })();

    if (!slug) {
      showWarning("We couldn't generate a note key. Please try again.");
      return;
    }

    if (RESERVED_KEYS.has(slug)) {
      showWarning("That key is reserved. Please pick another name.");
      return;
    }

    if (doesSlugExist(slug)) {
      showWarning("A note with that key already exists.");
      return;
    }

    navigateToSlug(slug);
  });
  return true;
}
