export const leagueIdPathParam = {
    name: 'league_id',
    in: 'path',
    description: 'League ID',
    required: true,
    schema: {
        type: 'integer',
    },
};
