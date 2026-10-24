import { categoryById, DEFAULT_QUOTE_CATEGORY, QUOTES } from '../data/quotes';

/** 1 on 1 January, up to 365 (366 in a leap year), in local time. */
export function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  // Whole local days, so a clock change (an hour short or long) never
  // shifts the count.
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86400000) + 1;
}

/**
 * Today's quote for a category: day of the year modulo the number of
 * quotes, so it changes at midnight and the same day always gives the same
 * line. An unknown or missing category falls back to Good Energy.
 * Returns { text, category } (category is the QUOTE_CATEGORIES entry).
 */
export function dailyQuote(categoryId, date = new Date()) {
  const category = categoryById(categoryId) ?? categoryById(DEFAULT_QUOTE_CATEGORY);
  const list = QUOTES[category.id];
  return { text: list[dayOfYear(date) % list.length], category };
}
