export function cleanDisplayName(player: {
    lastName?: string | null;
    name?: string | null;
    firstName?: string | null;
}): string {
    
    const displayName = player.lastName || player.name || player.firstName || "";

    return displayName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}