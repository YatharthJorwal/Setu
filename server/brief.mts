// Netlify function for POST /api/brief. The same handler runs in the Vite dev server (web/vite.config.ts).
// Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) in the site's environment variables, never in the repo.
import { handleBrief } from '../web/src/brief/handler';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.text();
  const result = await handleBrief(
    body,
    { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL },
    fetch,
    req.headers.get('x-nf-client-connection-ip') ?? 'anon',
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { path: '/api/brief' };
