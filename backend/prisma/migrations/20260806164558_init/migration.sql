-- CreateTable
CREATE TABLE "Competition" (
    "id" SERIAL NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "position" TEXT,
    "subPosition" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "competitionId" TEXT NOT NULL,
    "season" INTEGER,
    "round" TEXT,
    "date" TIMESTAMP(3),
    "homeClubId" INTEGER NOT NULL,
    "awayClubId" INTEGER NOT NULL,
    "targetTeamId" INTEGER NOT NULL,
    "opponentTeamId" INTEGER NOT NULL,
    "homeClubGoals" INTEGER,
    "awayClubGoals" INTEGER,
    "homeClubFormation" TEXT,
    "awayClubFormation" TEXT,
    "stadium" TEXT,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appearance" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "number" INTEGER,
    "type" TEXT NOT NULL,
    "position" TEXT,
    "isCaptain" BOOLEAN,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Appearance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_competitionId_key" ON "Competition"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Club_clubId_key" ON "Club"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_playerId_key" ON "Player"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_gameId_key" ON "Game"("gameId");

-- CreateIndex
CREATE INDEX "Game_competitionId_idx" ON "Game"("competitionId");

-- CreateIndex
CREATE INDEX "Appearance_gameId_idx" ON "Appearance"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Appearance_gameId_playerId_key" ON "Appearance"("gameId", "playerId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("competitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appearance" ADD CONSTRAINT "Appearance_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("gameId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appearance" ADD CONSTRAINT "Appearance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;
