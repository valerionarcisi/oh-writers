-- Strip Fountain `#N#` scene-number markers from scenes.heading and scenes.time_of_day.
-- These were stored incorrectly before fix b43dcbc (scenes-sync: use cur.heading
-- instead of raw fountain line). Rows written after that fix are already clean;
-- this migration cleans up pre-existing rows.

UPDATE scenes
SET
  heading    = regexp_replace(heading,    '\s*#[^#]+#\s*$', '', 'g'),
  time_of_day = regexp_replace(time_of_day, '\s*#[^#]+#\s*$', '', 'g')
WHERE heading ~ '#[^#]+#' OR time_of_day ~ '#[^#]+#';
