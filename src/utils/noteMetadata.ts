import { NOTE_INDEX_STORAGE_KEY } from "../constants.ts";

export type NoteMetadata = {
  slug: string;
  title: string;
  updatedAt: number;
};

type NoteMetadataIndex = Record<string, NoteMetadata>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

function readIndex(): NoteMetadataIndex {
  try {
    const rawValue = localStorage.getItem(NOTE_INDEX_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }
    const parsed = JSON.parse(rawValue);
    if (!isPlainObject(parsed)) {
      return {};
    }
    const index: NoteMetadataIndex = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isPlainObject(value)) continue;
      const { slug, title, updatedAt } = value as Partial<NoteMetadata>;
      if (typeof slug !== "string" || typeof title !== "string") continue;
      if (typeof updatedAt !== "number") continue;
      index[key] = { slug, title, updatedAt };
    }
    return index;
  } catch (error) {
    console.error("Unable to read note metadata index", error);
    return {};
  }
}

function writeIndex(index: NoteMetadataIndex) {
  try {
    localStorage.setItem(NOTE_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch (error) {
    console.error("Unable to persist note metadata index", error);
  }
}

export function loadNoteMetadataMap(): NoteMetadataIndex {
  return readIndex();
}

export function saveNoteMetadata(metadata: NoteMetadata): void {
  const index = readIndex();
  const existing = index[metadata.slug];
  if (
    existing &&
    existing.title === metadata.title &&
    existing.updatedAt === metadata.updatedAt
  ) {
    return;
  }
  index[metadata.slug] = metadata;
  writeIndex(index);
}

export function deleteNoteMetadata(slug: string): void {
  const index = readIndex();
  if (!index[slug]) {
    return;
  }
  delete index[slug];
  writeIndex(index);
}
