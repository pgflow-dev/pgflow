'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import type { Database } from '@/supabase/functions/database-types';

type WebsiteRow = Database['public']['Tables']['websites']['Row'];

export default function Page() {
  const [websites, setWebsites] = useState<WebsiteRow[] | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const getData = async () => {
      const { data } = await supabase.from('websites').select();
      setWebsites(data);
    };
    getData();
  }, []);

  return <pre>{JSON.stringify(websites, null, 2)}</pre>;
}
