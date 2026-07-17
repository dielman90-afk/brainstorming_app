import { generateIdeas } from '../../server/ai-core.js';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const body = await req.json();
    const result = await generateIdeas(body.action, body);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 });
  }
};

export const config = { path: '/api/generate' };
