import { timingSafeEqual } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RedditClient } from './reddit.js';
import { createServer } from './server.js';

const reddit = new RedditClient({ clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET, userAgent: process.env.REDDIT_USER_AGENT });

if (process.argv.includes('--stdio')) {
  await createServer(reddit).connect(new StdioServerTransport());
} else {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8787);
  const secret = process.env.MCP_AUTH_TOKEN;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && (!secret || secret.length < 32)) {
    throw new Error('Remote binding requires MCP_AUTH_TOKEN of at least 32 characters.');
  }
  const origins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean));
  const app = createMcpExpressApp({ host });
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }));
  app.use('/mcp', (req, res, next) => {
    if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin is not allowed' });
    if (secret) {
      const supplied = Buffer.from(req.headers.authorization || '');
      const expected = Buffer.from(`Bearer ${secret}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ error: 'Bearer token required' });
      }
    }
    next();
  });
  app.post('/mcp', async (req, res) => {
    const server = createServer(reddit);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
  app.listen(port, host, () => console.error(`Reddit MCP listening on http://${host}:${port}/mcp`));
}
