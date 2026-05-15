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
      const { data: meals, error } = await supabase
        .from('meal_plan')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(meals);
    }

    if (req.method === 'POST') {
      const { recipeId, recipeName, day } = req.body;

      const { data: meal, error } = await supabase
        .from('meal_plan')
        .insert([{ recipe_id: recipeId, recipe_name: recipeName, day }])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(meal);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}