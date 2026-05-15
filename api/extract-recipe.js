import Anthropic from '@anthropic-ai/sdk';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

const client = new Anthropic();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = new IncomingForm();
    const [fields, files] = await form.parse(req);
    const file = files.image?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const imageData = await fs.readFile(file.filepath);
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

    await fs.unlink(file.filepath);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to extract recipe' });
  }
}