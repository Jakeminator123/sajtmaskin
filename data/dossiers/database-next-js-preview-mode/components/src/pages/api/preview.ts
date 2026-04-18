import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = req.query.secret;
  const slug = typeof req.query.slug === 'string' ? req.query.slug : '/';

  if (!process.env.PREVIEW_SECRET) {
    return res.status(500).json({ message: 'PREVIEW_SECRET is not configured' });
  }

  if (secret !== process.env.PREVIEW_SECRET) {
    return res.status(401).json({ message: 'Invalid preview token' });
  }

  res.setPreviewData({});
  res.writeHead(307, { Location: slug });
  res.end();
}
