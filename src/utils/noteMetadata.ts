import { NOTE_INDEX_STORAGE_KEY } from "../constants.ts";
import storage from "../storage.ts";

export type NoteMetadata = {
  slug: string;
  title: string;
  updatedAt: number;
};

type NoteMetadataIndex = Record<string, NoteMetadata>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

async function readIndex(): Promise<NoteMetadataIndex> {
  try {
    const rawValue = await storage.getItem<string>(NOTE_INDEX_STORAGE_KEY);
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

async function writeIndex(index: NoteMetadataIndex) {
  try {
    await storage.setItem(NOTE_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch (error) {
    console.error("Unable to persist note metadata index", error);
  }
}

export async function loadNoteMetadataMap(): Promise<NoteMetadataIndex> {
  return readIndex();
}

export async function saveNoteMetadata(metadata: NoteMetadata): Promise<void> {
  const index = await readIndex();
  const existing = index[metadata.slug];
  if (
    existing &&
    existing.title === metadata.title &&
    existing.updatedAt === metadata.updatedAt
  ) {
    return;
  }
  index[metadata.slug] = metadata;
  await writeIndex(index);
}

export async function deleteNoteMetadata(slug: string): Promise<void> {
  const index = await readIndex();
  if (!index[slug]) {
    return;
  }
  delete index[slug];
  await writeIndex(index);
}
