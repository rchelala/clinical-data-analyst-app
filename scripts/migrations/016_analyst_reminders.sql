-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds a persistent free-text "Reminders" note per analyst (Worklist page).
-- Not week-scoped (unlike weekly_notes) and not included in the weekly update.

CREATE TABLE IF NOT EXISTS analyst_reminders (
   analyst_id int  PRIMARY KEY REFERENCES analysts(id) ON DELETE CASCADE,
   reminders  text,
   updated_at timestamptz NOT NULL DEFAULT now()
);
