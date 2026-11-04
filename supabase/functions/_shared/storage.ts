// Storage helpers shared by the account deletion functions.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

/** Every file under a folder, however deep (Storage lists one level at a time). */
export async function filesUnder(db: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...(await filesUnder(db, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Removes a folder and everything in it. Returns how many files went and how many could not. */
export async function removeFolder(db: SupabaseClient, bucket: string, folder: string): Promise<{ removed: number; failed: number }> {
  const paths = await filesUnder(db, bucket, folder);
  let failed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) {
      failed += Math.min(100, paths.length - i);
      console.error('[storage] could not remove', bucket, folder, error.message);
    }
  }
  return { removed: paths.length - failed, failed };
}
