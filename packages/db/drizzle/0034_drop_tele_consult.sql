-- Tele-consult was never a visit kind. It was a channel.
--
-- appointment already carries `channel` (virtual | in_clinic) — HOW the visit
-- happens — beside `type` — WHAT the visit is. "tele_consult" answered the
-- channel question inside the type column, which made two contradictions
-- possible and one useful thing impossible:
--
--   type=consultation + channel=virtual    the same visit, spelled twice
--   type=tele_consult + channel=in_clinic  nonsense, and the form allowed it
--   a review over video                    impossible — picking review lost the video
--
-- So `type` now holds only consultation | review, and `channel` holds how it
-- happens. A tele-consult is a consultation with channel=virtual, which is
-- what it always was.

UPDATE "appointment"
SET
  "type" = 'consultation',
  -- Only fills a channel that was never set. A row that explicitly says
  -- in_clinic keeps it: the two columns contradicted each other, and the one
  -- that names where the patient physically was is the one to believe.
  -- Overwriting it would destroy the only record of that.
  "channel" = COALESCE("channel", 'virtual')
WHERE "type" = 'tele_consult';
