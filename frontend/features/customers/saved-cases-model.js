export const SAVED_CASE_PAGE_SIZE = 10;
const normalized = value => String(value || '').normalize('NFC').toLowerCase();
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

/** GET /api/cases is already own-user scoped and bounded to 100 records. This
 * local view never invents a server-side search/pagination contract. */
export function savedCasePage(records, { query = '', scope = 'all', page = 0 } = {}) {
  const needle = normalized(query.trim());
  const filtered = records.filter(record =>
    (scope !== 'unassigned' || record.clientId == null) &&
    (!needle || normalized(record.title).includes(needle) || normalized(record.id).includes(needle))
  ).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt) || a.id.localeCompare(b.id));
  const scoped = scope === 'recent' ? filtered.slice(0, SAVED_CASE_PAGE_SIZE) : filtered;
  const pages = Math.max(1, Math.ceil(scoped.length / SAVED_CASE_PAGE_SIZE));
  const current = Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, pages - 1));
  return { records: scoped.slice(current * SAVED_CASE_PAGE_SIZE, (current + 1) * SAVED_CASE_PAGE_SIZE), total: records.length, filteredTotal: scoped.length, page: current, pages };
}
