-- Migration 060: Regulation register for known-but-absent regulations
--
-- Part of the legal-validity layer. `works` holds regulations we have the TEXT for.
-- Some regulations are known to exist (from the Lembaran Daerah register) but their
-- text is not in the corpus — e.g. Perda 20/2010, which Perda 4/2020 (Parkir) amends.
-- These cannot live in `works` (no nodes) and cannot be a `work_relationships` target
-- (FK requires a real work). This lightweight register lets relationships point at them
-- and drives the `out_of_coverage` validity state.

CREATE TABLE regulation_register (
    id SERIAL PRIMARY KEY,
    reg_type VARCHAR(20) NOT NULL,        -- e.g. PERDA_KAB
    number   VARCHAR(20) NOT NULL,
    year     INTEGER     NOT NULL,
    title    TEXT,
    lembaran_ref TEXT,                     -- Lembaran Daerah citation
    note     TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (reg_type, number, year)
);

COMMENT ON TABLE regulation_register IS
    'Regulations known to exist (Lembaran Daerah) but whose text is NOT in the corpus. '
    'Targets for work_relationships and source of the out_of_coverage validity state.';
