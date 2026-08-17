-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "isNationalTeam" BOOLEAN;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("clubId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("clubId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appearance" ADD CONSTRAINT "Appearance_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("clubId") ON DELETE RESTRICT ON UPDATE CASCADE;
