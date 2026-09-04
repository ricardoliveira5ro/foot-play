/**
 * Tier 1 team-name overrides keyed by clubId.
 * Maps verbose/official names to common short names.
 */

export const TEAM_NAME_OVERRIDES: Record<number, string> = {
    932: 'Lokomotiv Moscow',
    114: 'Beşiktaş',
    12: 'AS Roma',
    398: 'Lazio',
    2441: 'AEK Athens',
    683: 'Olympiacos',
    265: 'Panathinaikos',
    1091: 'PAOK',
    189: 'Boca Juniors',
    209: 'River Plate',
    1775: 'San Lorenzo',
    614: 'Flamengo',
    69261: 'Inter Miami',
    1023: 'Palmeiras',
    537: 'Botafogo',
    2462: 'Fluminense',
    210: 'Grêmio',
    1025: 'Bologna',
    1114: 'Al-Hilal',
    51828: 'LAFC',
    1044: 'Djurgården',
    1101: 'Elfsborg',
    496: 'Malmö FF',
    501: 'Bodø/Glimt',
    687: 'Molde',
    1293: 'Tromsø',
    195: 'Rosenborg',
    409: 'Red Bull Salzburg',
    2036: 'Heidenheim',
    122: 'Sturm Graz',
    4172: 'Pisa',
    2068: 'Raja Casablanca',
    10948: 'Guangzhou Evergrande',
    964: 'Zenit Saint Petersburg',
    2700: 'Anzhi Makhachkala',
    976: 'União Madeira',
    3336: 'Desportivo Aves',
    339: 'Dnipro',
    6676: 'Asteras Tripolis',
    4864: 'Oriental',
    3854: 'D.R. Congo',
    317: 'FC Twente',
    150: 'Real Betis',
    65: 'Greuther Fürth',
    714: 'Espanyol'
};

export function normalizeTeamName(clubId: number, name: string): string {
    const override = TEAM_NAME_OVERRIDES[clubId];
    return override ?? name;
}
