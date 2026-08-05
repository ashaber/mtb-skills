-- MTB Skills -- Phase 3.2 -- person.grade / person.category.
--
-- CLAUDE.md's Phase 2b column-mapping table ("Grade, Year -> meta.grade" /
-- "Category, Cat -> meta.category") already models these two fields on the
-- LOCAL (offline-first, src/storage.js) athlete record. This migration adds
-- the matching columns on the backend `person` table so a HC/TD roster
-- import (app/roster.py's POST /api/roster/import) and sync (src/sync.js)
-- can carry grade/category through to the backend, keeping the two data
-- models in parity rather than silently dropping these fields server-side.
--
-- Both nullable: an athlete `person` row carries grade/category; a coach/
-- HC/TD/league_staff row leaves both null (mirrors src/storage.js's own
-- convention -- category/grade are athlete-only fields, see savePerson's
-- role branch).
--
-- No RLS change needed: 0002_rls.sql's `person_select`/`person_insert`/
-- `person_update` policies already scope which `person` rows a caller can
-- see or write -- grade/category just ride along as ordinary columns on
-- rows already subject to those policies, same rationale as 0005_person_
-- email.sql's own note for `email`.
--
-- Idempotent: `add column if not exists`.

alter table person add column if not exists grade int;
alter table person add column if not exists category text;
