import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ up: true, database: true });
  } catch (error) {
    console.error('Database health check failed', error);
    return res.status(500).json({ up: false, database: false });
  }
}
