import jwt from 'jsonwebtoken';

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

export default async function handler(req, res) {
  const { file } = req.query;
  const allowedFiles = ['site', 'projects', 'posts'];
  if (!allowedFiles.includes(file)) return res.status(400).end();
  const filePath = `content/${file}.json`;

  if (req.method === 'GET') {
    const data = await githubRequest('GET', filePath);
    if (!data || !data.content) return res.status(502).json({ error: 'GitHub fetch failed', detail: data });
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    return res.json({ content, sha: data.sha });
  }

  if (req.method === 'PUT') {
    try { verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }
    const { content, sha } = req.body || {};
    const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    const result = await githubRequest('PUT', filePath, {
      message: `admin: update ${file}.json`,
      content: encoded,
      sha,
      branch: process.env.GITHUB_BRANCH || 'main',
    });
    if (result && result.commit) return res.json({ ok: true, sha: result.content && result.content.sha });
    return res.status(502).json({ error: 'GitHub write failed', detail: result });
  }

  res.status(405).end();
}
