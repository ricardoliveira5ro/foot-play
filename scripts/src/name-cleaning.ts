export function cleanDisplayName(
    lastName?: string | null,
    name?: string | null,
    firstName?: string | null,
): string {
    
    const displayName = lastName || name || firstName || "";

    return displayName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}