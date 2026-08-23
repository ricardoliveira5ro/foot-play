-- Add index on Player.name for fast autocomplete search
CREATE INDEX "Player_name_idx" ON "Player"("name");
