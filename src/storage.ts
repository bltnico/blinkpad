import localforage from "localforage";
import { DATABASE_NAME, TABLE_NOTE_NAME } from "./constants";

const storage = localforage.createInstance({
  name: DATABASE_NAME,
  storeName: TABLE_NOTE_NAME,
  description: "Draft Note persistent storage",
});

export default storage;
