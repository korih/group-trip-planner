import { Hono } from 'hono';
import type { Env, AISuggestionRequest, AISuggestionResponse } from '../types';

const ai = new Hono<{ Bindings: Env }>();

// POST /ai/suggestions
// Generate AI-powered itinerary suggestions for a trip destination
ai.post('/suggestions', async (c) => {
  const body = await c.req.json<AISuggestionRequest>();

  if (!body.destination || !body.start_date || !body.end_date || !body.group_size) {
    return c.json(
      { success: false, error: 'destination, start_date, end_date, and group_size are required' },
      400
    );
  }

  const durationDays =
    Math.ceil(
      (new Date(body.end_date).getTime() - new Date(body.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const interestsText =
    body.interests && body.interests.length > 0
      ? `The group is interested in: ${body.interests.join(', ')}.`
      : '';

  const budgetText = body.budget ? `Budget level: ${body.budget}.` : '';

  const prompt = `You are a travel planning assistant helping a group plan a trip.

Destination: ${body.destination}
Trip duration: ${durationDays} days (${body.start_date} to ${body.end_date})
Group size: ${body.group_size} people
${interestsText}
${budgetText}

Please provide a detailed day-by-day itinerary with:
1. Must-see attractions and activities
2. Recommended restaurants for meals
3. Transportation tips between locations
4. Estimated costs per person (in USD)
5. Practical tips for group travel at this destination

Format your response as a structured itinerary with clear day headings.`;

  const model = '@cf/meta/llama-3.1-8b-instruct-fp8' as const;

  const response = await c.env.AI.run(model, {
    messages: [
      {
        role: 'system',
        content:
          'You are an expert travel planner specializing in group trips. Provide practical, detailed, and engaging travel itineraries.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const result = response as { response?: string };
  const suggestions = result.response ?? 'Unable to generate suggestions at this time.';

  const data: AISuggestionResponse = {
    suggestions,
    model,
  };

  return c.json({ success: true, data });
});

// POST /ai/optimize-itinerary
// Suggest optimizations for an existing itinerary
ai.post('/optimize-itinerary', async (c) => {
  const body = await c.req.json<{
    destination: string;
    items: Array<{ date: string; title: string; location?: string; category: string }>;
  }>();

  if (!body.destination || !body.items || body.items.length === 0) {
    return c.json(
      { success: false, error: 'destination and items are required' },
      400
    );
  }

  const itemsList = body.items
    .map((item) => `- ${item.date}: ${item.title}${item.location ? ` at ${item.location}` : ''} (${item.category})`)
    .join('\n');

  const prompt = `You are a travel optimization expert.

Destination: ${body.destination}

Current itinerary:
${itemsList}

Please analyze this itinerary and provide:
1. Suggestions to optimize the order of activities to minimize travel time
2. Any scheduling conflicts or issues
3. Activities or restaurants that might be missing
4. Tips to make the group experience better

Be specific and practical in your recommendations.`;

  const model = '@cf/meta/llama-3.1-8b-instruct-fp8' as const;

  const response = await c.env.AI.run(model, {
    messages: [
      {
        role: 'system',
        content: 'You are an expert travel planner helping optimize group trip itineraries.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const result = response as { response?: string };
  const suggestions = result.response ?? 'Unable to optimize itinerary at this time.';

  return c.json({ success: true, data: { suggestions, model } });});

export default ai;
