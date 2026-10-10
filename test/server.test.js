import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { RedditClient, comments } from '../src/reddit.js';

test('MCP exposes six read-only tools and handles successful calls and invalid inputs', async () => {
  const calls = [];
  const mock = { get: async (path, params) => {
    calls.push({ path, params });
    if (path.endsWith('/about')) return { data: { display_name: 'books', title: 'Books' } };
    if (path.startsWith('/comments/')) return [{}, { data: { children: [] } }];
    return { data: { children: [{ kind: 't3', data: { id: 'abc123', title: 'Example', permalink: '/r/books/comments/abc123/example/' } }] } };
  } };
  const server = createServer(mock);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
    for (const [name, args] of [
      ['search_reddit', { query: 'literature' }], ['search_subreddit', { subreddit: 'books', query: 'literature' }],
      ['get_subreddit_posts', { subreddit: 'books' }], ['get_post', { post_id: 'abc123' }],
      ['get_comments', { post_id: 'abc123' }], ['get_subreddit_info', { subreddit: 'books' }]
    ]) assert.ok(!(await client.callTool({ name, arguments: args })).isError);
    assert.equal(calls.length, 6);
    assert.equal(calls[1].params.restrict_sr, true);
    assert.equal(calls[0].params.limit, 10);
    const bad = await client.callTool({ name: 'get_subreddit_posts', arguments: { subreddit: '../private' } });
    assert.ok(bad.isError);
    assert.equal(calls.length, 6);
  } finally { await client.close(); await server.close(); }
});

test('missing credentials do not trigger network calls', async () => {
  const client = new RedditClient({ fetchImpl: () => { throw new Error('Unexpected network'); } });
  await assert.rejects(client.get('/search'), /not configured/);
});

test('OAuth token is reused and 429 prevents further calls during cooldown', async () => {
  let count = 0;
  const client = new RedditClient({ clientId: 'dummy', clientSecret: 'dummy', userAgent: 'test', fetchImpl: async url => {
    count++;
    if (String(url).includes('access_token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
    if (count === 3) return new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
    return new Response('{}');
  } });
  await client.get('/search');
  await assert.rejects(client.get('/search'), /429/);
  await assert.rejects(client.get('/search'), /rate limit/);
  assert.equal(count, 3);
});

test('comment traversal is bounded and reports hidden branches', () => {
  const comment = id => ({ kind: 't1', data: { id, body: id, permalink: `/comments/${id}` } });
  const output = comments({ data: { children: [comment('a'), { kind: 'more' }, comment('b'), comment('c')] } }, 2);
  assert.equal(output.comments.length, 2);
  assert.equal(output.omitted_branches, 1);
});
