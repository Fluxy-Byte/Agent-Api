import { randomUUID } from "crypto";

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${base}-${randomUUID().slice(0, 6)}`;
}
