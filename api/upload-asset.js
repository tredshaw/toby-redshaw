import jwt from 'jsonwebtoken';

const ALLOWED = {
  cv: { path: 'assets/cv.pdf', mime: 'application/pdf', maxBytes: 8 * 1024 * 1024 },
};

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return jwt.verify(token, process.env.JWT_SECRET);
}

async function githubRequest(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`, {
    method,
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'toby-redshaw-admin',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') return res.status(405).end();
  try { verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { key, content } = req.body || {};
  const spec = ALLOWED[key];
  if (!spec) return res.status(400).json({ error: 'Unknown asset key' });
  if (typeof content !== 'string' || !content) return res.status(400).json({ error: 'Missing content' });

  const buf = Buffer.from(content, 'base64');
  if (buf.length === 0) return res.status(400).json({ error: 'Empty file' });
  if (buf.length > spec.maxBytes) return res.status(413).json({ error: `File too large (max ${Math.round(spec.maxBytes / 1024 / 1024)}MB)` });

  const existing = await githubRequest('GET', spec.path);
  const sha = existing && existing.sha ? existing.sha : undefined;

  const result = await githubRequest('PUT', spec.path, {
    message: `admin: upload ${spec.path}`,
    content,
    sha,
    branch: process.env.GITHUB_BRANCH || 'main',
  });
  if (result && result.commit) return res.json({ ok: true, path: spec.path });
  return res.status(502).json({ error: 'GitHub write failed', detail: result });
}
