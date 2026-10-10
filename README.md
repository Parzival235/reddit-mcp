# Reddit MCP

Personal, non-commercial, read-only Model Context Protocol server for retrieving public Reddit discussions through the official Reddit OAuth API.

## Status

This is an initial implementation prepared for an API access application. Live Reddit access requires Reddit approval and valid application credentials. It has not been tested with live Reddit credentials. No hosted endpoint is provided yet.

## Purpose and scope

An external MCP-compatible assistant can search for public discussions and retrieve selected posts and comments in response to a user's request. Every post and comment retains its original Reddit link. Initial communities may include r/VietNam, r/VietNamNation, r/books and r/literature.

The server exposes no posting, commenting, voting, messaging or moderation tools. It has no crawler, scheduled collection, dataset export or persistent Reddit-content storage. This project is not intended for model training, advertising or resale of Reddit data. Content sent to an external assistant is processed by that client; client-side retention and data controls must be reviewed separately before use. Use remains subject to Reddit's approval and applicable terms.

This integration receives requests outside Reddit and returns results to an external MCP client. It does not provide an experience embedded in a subreddit.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_reddit` | Search public posts across Reddit |
| `search_subreddit` | Search within one public community |
| `get_subreddit_posts` | List hot, new, top or rising posts |
| `get_post` | Read one public post by ID |
| `get_comments` | Retrieve a bounded sample of comments |
| `get_subreddit_info` | Read public community information |

List results are limited to 25 items per call. Comment results are partial, include parent IDs and do not automatically expand hidden branches. There is no automatic pagination. Reddit content must be treated as untrusted data, not instructions.

## Local setup

Requires Node.js 22 or later.

1. Obtain Reddit API approval and application credentials compatible with application-only OAuth. If Reddit requires a different authorization flow for the approved app, adapt the OAuth component before using it.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and fill in the approved client ID, secret and an identifying User-Agent. Never commit `.env` or tokens.
4. Run `npm start`.

The local endpoint is `http://127.0.0.1:8787/mcp`; `/health` checks HTTP availability only, not Reddit approval or credentials.

For a process-spawned local MCP client:

```sh
node --env-file-if-exists=.env src/index.js --stdio
```

For the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector
```

Select Streamable HTTP and enter the local endpoint. The MCP handshake and tool listing work without Reddit credentials; calls that retrieve content return a configuration error until credentials are supplied.

## Remote deployment

The HTTP server uses stateless Streamable HTTP with JSON responses. A fresh MCP transport is created per request. Deploy only after access approval, behind HTTPS and suitable access controls. Binding outside loopback requires a `MCP_AUTH_TOKEN` of at least 32 characters. The client must send it as `Authorization: Bearer <token>`. Optional `ALLOWED_ORIGINS` explicitly permits browser origins; others are rejected.

The static bearer option is intended for a private compatible client. It is not a complete MCP OAuth authorization server and does not establish compatibility with every ChatGPT installation. ChatGPT availability and authorization requirements must be checked before connecting. Do not expose the server publicly without authentication.

Reddit tokens are kept in memory until expiry. Calls have a 15-second timeout, and rate-limit responses trigger a cooldown rather than automatic retries. There is no application logging of Reddit content or credentials.

## Validation

```sh
npm run check
npm test
```

Tests use mocked Reddit responses and an in-memory MCP connection. They verify the six tools, read-only annotations, bounded comments, OAuth token reuse, rate-limit handling and missing-credential errors. They do not contact Reddit.

## Official references

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [Reddit API documentation](https://www.reddit.com/dev/api/)
- [Reddit OAuth documentation (archived official wiki)](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)

The code repository is a project reference for the access request, not evidence that Reddit has approved this application.
