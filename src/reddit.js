export class RedditClient {
  constructor({ clientId, clientSecret, userAgent, fetchImpl = fetch } = {}) {
    Object.assign(this, { clientId, clientSecret, userAgent, fetchImpl });
    this.token = null;
    this.blockedUntil = 0;
  }

  async accessToken() {
    if (!this.clientId || !this.clientSecret || !this.userAgent) {
      throw new Error('Reddit API is not configured. Obtain approval and set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT.');
    }
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (!this.tokenRequest) {
      this.tokenRequest = (async () => {
        const response = await this.fetchImpl('https://www.reddit.com/api/v1/access_token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ grant_type: 'client_credentials' }),
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Reddit OAuth failed (${response.status}). Check API approval and app credentials.`);
        const body = await response.json();
        if (!body.access_token || !Number.isFinite(body.expires_in)) throw new Error('Invalid Reddit OAuth response.');
        this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000 };
        return this.token.value;
      })();
    }
    try { return await this.tokenRequest; } finally { this.tokenRequest = null; }
  }

  async get(path, params = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) throw new Error('Invalid API path.');
    if (Date.now() < this.blockedUntil) throw new Error('Reddit rate limit reached. Try again later.');
    const token = await this.accessToken();
    const url = new URL(`https://oauth.reddit.com${path}`);
    for (const [key, value] of Object.entries({ ...params, raw_json: 1 })) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.userAgent },
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401) this.token = null;
    if (response.status === 429 || Number(response.headers.get('x-ratelimit-remaining') ?? 1) <= 0) {
      const delay = Number(response.headers.get('retry-after') ?? response.headers.get('x-ratelimit-reset') ?? 60);
      this.blockedUntil = Date.now() + (Number.isFinite(delay) ? Math.max(1, delay) : 60) * 1000;
    }
    if (!response.ok) throw new Error(`Reddit API returned ${response.status}${response.status === 429 ? ': rate limit reached; try later' : ''}.`);
    return response.json();
  }
}

export function post(data) {
  return {
    id: data.id, title: data.title, subreddit: data.subreddit, author: data.author,
    text: data.selftext, url: data.url,
    permalink: `https://www.reddit.com${data.permalink}`,
    score: data.score, comment_count: data.num_comments, created_utc: data.created_utc,
    nsfw: data.over_18
  };
}

export function listing(data) {
  return { posts: (data.data?.children ?? []).filter(item => item.kind === 't3').map(item => post(item.data)) };
}

export function comments(data, limit) {
  const result = [];
  let omittedBranches = 0;
  const walk = children => {
    for (const item of children ?? []) {
      if (item.kind === 'more') { omittedBranches++; continue; }
      if (item.kind !== 't1' || result.length >= limit) continue;
      const d = item.data;
      result.push({ id: d.id, parent_id: d.parent_id, author: d.author, text: d.body,
        score: d.score, created_utc: d.created_utc, permalink: `https://www.reddit.com${d.permalink}` });
      if (d.replies?.data) walk(d.replies.data.children);
    }
  };
  walk(data.data?.children);
  return { comments: result, omitted_branches: omittedBranches, note: 'Bounded comment sample; not a complete thread.' };
}
