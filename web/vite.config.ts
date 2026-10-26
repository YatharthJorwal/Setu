import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handleBrief } from './src/brief/handler';

function readBody(req: IncomingMessage, limit = 100_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Serves POST /api/brief during `npm run dev`, with the same handler the Netlify function uses.
 * Settings come from web/.env.local. A Claude API key, if used, never reaches the browser.
 */
function briefApi(env: Record<string, string>): Plugin {
  return {
    name: 'setu-brief-api',
    configureServer(server) {
      server.middlewares.use('/api/brief', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
        readBody(req)
          .then((body) =>
            handleBrief(
              body,
              {
                BRIEF_PROVIDER: env.BRIEF_PROVIDER,
                ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
                ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
                OLLAMA_URL: env.OLLAMA_URL,
                OLLAMA_MODEL: env.OLLAMA_MODEL,
              },
              fetch,
              req.socket.remoteAddress ?? 'local',
            ),
          )
          .then((result) => send(result.status, result.body))
          .catch(() => send(413, { error: 'too_large' }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // web/.env, web/.env.local and the shell environment
  return { plugins: [react(), briefApi(env)] };
});
