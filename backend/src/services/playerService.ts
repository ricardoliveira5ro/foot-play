import { prisma } from '../prisma';

export async function getPlayers(name: string) {
  const players = await prisma.player.findMany({
    where: {
      OR: [
        { displayName: { contains: name, mode: 'insensitive' } },
        {
          AND: [
            { displayName: null },
            { name: { contains: name, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { playerId: true, name: true, displayName: true },
  });

  // v1.0.2 owns player display names; autocomplete follows the same resolved
  // name without renaming either persisted field.
  const resolvedName = (player: typeof players[number]) => player.displayName ?? player.name;
  return players
    .sort((a, b) => resolvedName(a).localeCompare(resolvedName(b)))
    .map((player) => ({ id: player.playerId, name: player.displayName ?? player.name }));
}
