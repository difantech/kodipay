import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration missing'
      });
    }

    const sql = neon(databaseUrl);
    const result = await sql`SELECT NOW() AS server_time`;

    return res.status(200).json({
      success: true,
      message: 'Neon database connected successfully',
      time: result[0].server_time
    });

  } catch (error) {
    console.error('Database connection failed:', error);

    return res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
}