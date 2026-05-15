import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const upload = multer({ dest: '/tmp/' });
const client = new Anthropic();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(cors());
app.use(express.json());

// Initialize database
async function initializeDB() {
  try {
    // Tables are created in Supabase dashboard, but we can verify connection
    const { data, error } = await supabase.from('recipes').select('count');
    if (!error) {
      console.log('Database connected');
    }
  } catch (error) {
    console.error('Database connection error:', error);
  }
}

initializeDB();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all recipes
app.get('/api/recipes', async (req, res) => {
  try {
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const recipesWithIngredients = await Promise.all(
      recipes.map(async (recipe) => {
        const { data: ingredients } = await supabase
          .from('recipe_ingredients')
          .select('name, amount, unit')
          .eq('recipe_id', recipe.id);
        return { ...recipe, ingredients };
      })
    );

    res.json(recipesWithIngredients);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Create recipe
app.post('/api/recipes', async (req, res) => {
  const { name, ingredients } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Recipe name required' });
  }

  try {
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert([{ name }])
      .select()
      .single();

    if (recipeError) throw recipeError;

    if (ingredients && ingredients.length > 0) {
      const ingsToInsert = ingredients
        .filter(ing => ing.name)
        .map(ing => ({
          recipe_id: recipe.id,
          name: ing.name,
          amount: ing.amount || null,
          unit: ing.unit || null
        }));

      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(ingsToInsert);

      if (ingError) throw ingError;
    }

    res.json(recipe);
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
});

// Delete recipe
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

// Get all inventory
app.get('/api/inventory', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Create inventory item
app.post('/api/inventory', async (req, res) => {
  const { name, amount, unit, expiresIn } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Item name required' });
  }

  try {
    const { data: item, error } = await supabase
      .from('inventory')
      .insert([{ name, amount, unit, expires_in: expiresIn || null }])
      .select()
      .single();

    if (error) throw error;
    res.json(item);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Get meal plan
app.get('/api/meal-plan', async (req, res) => {
  try {
    const { data: meals, error } = await supabase
      .from('meal_plan')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(meals);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({ error: 'Failed to fetch meal plan' });
  }
});

// Add to meal plan
app.post('/api/meal-plan', async (req, res) => {
  const { recipeId, recipeName, day } = req.body;

  try {
    const { data: meal, error } = await supabase
      .from('meal_plan')
      .insert([{ recipe_id: recipeId, recipe_name: recipeName, day }])
      .select()
      .single();

    if (error) throw error;
    res.json(meal);
  } catch (error) {
    console.error('Error adding to meal plan:', error);
    res.status(500).json({ error: 'Failed to add to meal plan' });
  }
});

// Delete from meal plan
app.delete('/api/meal-plan/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('meal_plan')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from meal plan:', error);
    res.status(500).json({ error: 'Failed to remove from meal plan' });
  }
});

// Extract recipe from image
app.post('/api/extract-recipe', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = 'image/jpeg';

    const message = await client.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Extract the recipe from this image. Return ONLY a JSON object with this exact structure:
{
  "recipe": {
    "name": "recipe name",
    "ingredients": [
      {"name": "ingredient", "amount": "number", "unit": "unit"},
      ...
    ]
  }
}
If no recipe is found, return {"recipe": null}`
            }
          ]
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { recipe: null };

    fs.unlinkSync(req.file.path);
    res.json(data);
  } catch (error) {
    console.error('Error extracting recipe:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to extract recipe' });
  }
});

// Extract items from receipt
app.post('/api/extract-receipt', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = 'image/jpeg';

    const message = await client.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Extract grocery items from this receipt or image. Return ONLY a JSON object with this exact structure:
{
  "items": [
    {"name": "item name", "amount": "quantity", "unit": "unit", "expiresIn": "days or empty string"},
    ...
  ]
}
For perishables, estimate shelf life. If no items found, return {"items": []}`
            }
          ]
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] };

    fs.unlinkSync(req.file.path);
    res.json(data);
  } catch (error) {
    console.error('Error extracting receipt:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to extract receipt' });
  }
});

export default app;