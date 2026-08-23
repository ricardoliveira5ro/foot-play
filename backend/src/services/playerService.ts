import { prisma } from '../prisma';

export async function getPlayers(name: string) {
  const players = await prisma.player.findMany({
    where: {
      name: {
        contains: name,
        mode: 'insensitive'
      }
    },
    orderBy: {
      displayName: "asc"  
    }
  });

  return players.map(p => { return { id: p.playerId, name: p.name }; })
}