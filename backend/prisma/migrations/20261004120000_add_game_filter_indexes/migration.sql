-- Indexes backing the v1.1 Season and Competition filter range queries.
-- CLOSED list: do not extend without changing roadmap v1.0.2.
-- CreateIndex
CREATE INDEX "Game_season_idx" ON "Game"("season");

-- CreateIndex
CREATE INDEX "Game_date_idx" ON "Game"("date");

-- CreateIndex
CREATE INDEX "Game_targetTeamId_idx" ON "Game"("targetTeamId");
