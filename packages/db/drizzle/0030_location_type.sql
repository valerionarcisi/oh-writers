-- spec 37 Step 1: persist the normalised location type per requirement.
-- Both columns are nullable; null means "not yet normalised".
ALTER TABLE location_requirements
  ADD COLUMN location_type text,
  ADD COLUMN location_type_source text;
