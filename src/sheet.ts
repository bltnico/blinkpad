import { createBottomSheet } from "@plainsheet/core";
import { decompressFromUTF16 } from "lz-string";
import { NOTE_KEY_PREFIX } from "./constants.ts";
import { isMobileDevice } from "./utils/device.ts";

type NoteEntry = {
  slug: string;
  title: string;
  url: string;
  isActive: boolean;
};

const SHEET_TEMPLATE = `
  <section class="note-sheet" aria-label="Saved notes overview">
    <header class="note-sheet__header">
      <p class="note-sheet__title">Press Cmd+K or Ctrl+K to quickly open your library</p>
      <button type="button" class="note-sheet__close" data-note-sheet="close" aria-label="Close saved notes"></button>
    </header>
    <div class="note-sheet__search">
      <label class="note-sheet__search-label">
        <input type="search" data-note-sheet="search" placeholder="Filter by title or keyword" autocomplete="off" spellcheck="false" />
      </label>
    </div>
    <div class="note-sheet__body">
      <div data-note-sheet="list" class="note-sheet-list" role="list"></div>
    </div>
  </section>
`;

const decodeStoredValue = (rawValue: string | null) => {
  if (typeof rawValue !== "string") {
    return "";
  }
  try {
    const decompressed = decompressFromUTF16(rawValue);
    if (typeof decompressed === "string") {
      return decompressed;
    }
  } catch {
    /* ignore malformed compressed content */
  }
  return rawValue;
};

const toPlainText = (html: string) => {
  if (!html) {
    return "";
  }

  const fragment = document.createElement("div");
  fragment.innerHTML = html;
  const firstChild = fragment.firstChild;

  if (firstChild) {
    return firstChild.textContent ?? "";
  }

  const text = fragment.textContent ?? "";
  return text.replace(/\r?\n/g, "\n").trim();
};

const getActiveSlug = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("s") ?? "root";
};

export function setupSavedNotesSheet(): void {
  const trigger = document.getElementById("my-notes");
  if (!(trigger instanceof HTMLButtonElement)) {
    if (trigger) {
      console.warn(
        "#my-notes element is not a button; saved notes list unavailable."
      );
    } else {
      console.warn(
        "#my-notes button is missing; saved notes list unavailable."
      );
    }
    return;
  }

  const bottomSheet = createBottomSheet({
    ariaLabel: "Saved notes",
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
    console.warn("Bottom sheet content wrapper not found.");
    return;
  }

  const listContainer = contentWrapper.querySelector(
    "[data-note-sheet='list']"
  );
  if (!(listContainer instanceof HTMLElement)) {
    console.warn("Bottom sheet list container is missing.");
    return;
  }

  const searchInput = contentWrapper.querySelector<HTMLInputElement>(
    "[data-note-sheet='search']"
  );
  const closeTrigger = contentWrapper.querySelector<HTMLElement>(
    "[data-note-sheet='close']"
  );

  let storageReadFailed = false;

  const collectSlugs = () => {
    storageReadFailed = false;
    const slugs = new Set<string>();
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(NOTE_KEY_PREFIX)) {
          const slug = key.slice(NOTE_KEY_PREFIX.length);
          if (slug) {
            slugs.add(slug);
          }
        }
      }
    } catch (error) {
      console.error("Unable to read saved notes from localStorage", error);
      storageReadFailed = true;
    }
    return Array.from(slugs).sort((a, b) => {
      if (a === "root") return -1;
      if (b === "root") return 1;
      return a.localeCompare(b);
    });
  };

  const buildEntries = (): NoteEntry[] => {
    const activeSlug = getActiveSlug();
    const slugs = collectSlugs();
    if (storageReadFailed) {
      return [];
    }
    return slugs.map((slug) => {
      const storageKey = `${NOTE_KEY_PREFIX}${slug}`;
      const storedValue = decodeStoredValue(localStorage.getItem(storageKey));
      const plainText = toPlainText(storedValue);
      const [firstLine] = plainText.split(/\n+/).map((line) => line.trim());
      const title =
        firstLine ||
        (slug === "root" ? "Root note" : slug.replace(/[_-]/g, " "));
      const pathSegment = slug === "root" ? "" : slug;
      const encodedSegment = pathSegment ? encodeURIComponent(pathSegment) : "";
      const url = encodedSegment
        ? `${window.location.origin}/${encodedSegment}`
        : `${window.location.origin}/`;
      return {
        slug,
        title,
        url,
        isActive: slug === activeSlug,
      };
    });
  };

  const renderSavedNotes = () => {
    listContainer.innerHTML = "";

    const entries = buildEntries();
    if (storageReadFailed) {
      const errorState = document.createElement("div");
      errorState.className = "note-sheet-empty";
      errorState.innerHTML =
        "<p>Unable to access saved notes.</p><p>Check your browser privacy settings and try again.</p>";
      listContainer.appendChild(errorState);
      return;
    }

    const filterTerm = searchInput?.value.trim().toLowerCase() ?? "";
    const filteredEntries = entries.filter((entry) => {
      if (!filterTerm) return true;
      const haystack = `${entry.title} ${entry.slug}`.toLowerCase();
      return haystack.includes(filterTerm);
    });

    if (!entries.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "note-sheet-empty";
      emptyState.innerHTML =
        "<p>No saved notes yet.</p><p>Write something in the editor and it will appear here automatically.</p>";
      listContainer.appendChild(emptyState);
      return;
    }

    if (!filteredEntries.length) {
      const noResults = document.createElement("div");
      noResults.className = "note-sheet-empty";
      noResults.innerHTML =
        "<p>Nothing matches that search.</p><p>Try another keyword or clear the filter.</p>";
      listContainer.appendChild(noResults);
      return;
    }

    const listElement = document.createElement("ul");
    listElement.className = "note-sheet-grid";

    filteredEntries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "note-sheet-grid__item";

      const anchor = document.createElement("a");
      anchor.className = "note-card";
      anchor.href = entry.url;

      const title = document.createElement("span");
      title.className = "note-card__title";
      title.textContent = entry.title;

      const meta = document.createElement("span");
      meta.className = "note-card__meta";
      meta.textContent =
        entry.slug === "root" ? "default workspace" : `/${entry.slug}`;

      anchor.appendChild(title);
      anchor.appendChild(meta);
      item.appendChild(anchor);

      if (entry.isActive) {
        item.classList.add("is-active");
        anchor.setAttribute("aria-current", "page");
      }

      listElement.appendChild(item);
    });

    listContainer.appendChild(listElement);
  };

  if (closeTrigger instanceof HTMLButtonElement) {
    closeTrigger.addEventListener("click", () => {
      bottomSheet.close();
    });
  }

  searchInput?.addEventListener("input", () => {
    renderSavedNotes();
  });

  trigger.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
    }
    renderSavedNotes();
    bottomSheet.open();
    if (isMobileDevice()) {
      return;
    }

    window.setTimeout(() => {
      searchInput?.focus({ preventScroll: true });
    }, 120);
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const isOpen = bottomSheet.getIsOpen();
      if (isOpen) {
        bottomSheet.close();
        return;
      }
      if (searchInput) {
        searchInput.value = "";
      }
      renderSavedNotes();
      bottomSheet.open();
      window.setTimeout(() => {
        searchInput?.focus({ preventScroll: true });
      }, 120);
    }
  });
}
