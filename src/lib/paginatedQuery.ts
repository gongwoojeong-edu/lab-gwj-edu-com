/** Read every page; never return a partial success after a failed request. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Bound IN filters to avoid oversized URLs as queues grow. */
export async function fetchInChunks<T>(
  values: string[],
  fetchChunk: (values: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(values)];
  const rows: T[] = [];
  for (let from = 0; from < unique.length; from += 100) {
    rows.push(...await fetchChunk(unique.slice(from, from + 100)));
  }
  return rows;
}