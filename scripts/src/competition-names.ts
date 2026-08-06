export const OVERRIDES: Record<string, string> = {
    CL: 'UEFA Champions League',
    CLQ: 'UEFA Champions League Qualifying',
    EL: 'UEFA Europa League',
    ELQ: 'UEFA Europa League Qualifying',
    UCOL: 'UEFA Conference League',
    ECLQ: 'UEFA Conference League Qualifying',
    USC: 'UEFA Super Cup',
    EURO: 'UEFA Euro',
    FAC: 'FA Cup',
    DFB: 'DFB-Pokal',
    CDR: 'Copa del Rey',
    COPA: 'Copa América',
    FRCH: 'Trophée des Champions',
    POSU: 'Supertaça Cândido de Oliveira',
    CIT: 'Coppa Italia',
    ES1: 'LaLiga',
};

export const MISSING_COMPETITIONS: Record<string, string> = {
    POCP: 'Taça de Portugal',
    KLUB: 'FIFA Club World Cup',
    CGB: 'EFL Cup',
};

export function normalizeCompetitionName(competitionId: string, slug: string): string {
    const override = OVERRIDES[competitionId];
    if (override) return override;

    return slug
        .split('-')
        .filter(token => token !== '')
        .map(token => {
            if (/^[a-z]{1,2}$/.test(token)) return token.toUpperCase();
            return token.charAt(0).toUpperCase() + token.slice(1);
        })
        .join(' ');
}
