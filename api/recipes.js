import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check environment variables exist
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Missing Supabase credentials');
    return res.status(500).json({ 
      error: 'Server configuration error: missing credentials',
      hasUrl: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_KEY
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    if (req.method === 'GET') {
      const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: error.message, details: error });
      }

      const recipesWithIngredients = await Promise.all(
        recipes.map(async (recipe) => {
          const { data: ingredients } = await supabase
            .from('recipe_ingredients')
            .select('name, amount, unit')
            .eq('recipe_id', recipe.id);
          return { ...recipe, ingredients: ingredients || [] };
        })
      );

      return res.status(200).json(recipesWithIngredients);
    }

    if (req.method === 'POST') {
      const { name, ingredients } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Recipe name required' });
      }

      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert([{ name }])
        .select()
        .single();

      if (recipeError) {
        console.error('Insert recipe error:', recipeError);
        return res.status(500).json({ error: recipeError.message, details: recipeError });
      }

      if (ingredients && ingredients.length > 0) {
        const ingsToInsert = ingredients
          .filter(ing => ing.name)
          .map(ing => ({
            recipe_id: recipe.id,
            name: ing.name,
            amount: ing.amount || null,
            unit: ing.unit || null
          }));

        if (ingsToInsert.length > 0) {
          const { error: ingError } = await supabase
            .from('recipe_ingredients')
            .insert(ingsToInsert);

          if (ingError) {
            console.error('Insert ingredients error:', ingError);
            return res.status(500).json({ error: ingError.message, details: ingError });
          }
        }
      }

      return res.status(200).json({ ...recipe, ingredients: ingredients || [] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
}