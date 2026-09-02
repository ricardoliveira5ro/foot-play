import crypto from 'crypto';
import { prisma } from '../prisma';

function getPlayerTokenSecret(): string {
  const secret = process.env.PLAYER_TOKEN_SECRET;

  if (!secret) {
    throw new Error('PLAYER_TOKEN_SECRET is required but missing from environment');
  }

  return secret;
}

const PLAYER_TOKEN_SECRET = getPlayerTokenSecret();

export function generatePlayerToken(gameId: number, playerId: number): string {
  return crypto
    .createHmac('sha256', PLAYER_TOKEN_SECRET)
    .update(`${gameId}:${playerId}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

export async function resolvePlayerToken(gameId: number, token: string): Promise<number | null> {
  const appearances = await prisma.appearance.findMany({
    where: { gameId }
  });

  for (const ap of appearances) {
    const recomputedToken = generatePlayerToken(gameId, ap.playerId);

    const tokenBuf = Buffer.from(token);
    const recomputedBuf = Buffer.from(recomputedToken);
    if (tokenBuf.length === recomputedBuf.length && crypto.timingSafeEqual(tokenBuf, recomputedBuf)) {
      return ap.playerId;
    }
  }

  return null;
}