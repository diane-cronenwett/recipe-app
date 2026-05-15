import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data: items, error } = await supabase
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(items);
    }

    if (req.method === 'POST') {
      const { name, amount, unit, expiresIn } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Item name required' });
      }

      const { data: item, error } = await supabase
        .from('inventory')
        .insert([{ name, amount, unit, expires_in: expiresIn || null }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(item);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}