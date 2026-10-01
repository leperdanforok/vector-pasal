-- Migration 061: Allow work_relationships edges to target the regulation_register
--
-- Extends the existing work_relationships table (does not duplicate it) so an edge can
-- point either at a real work (text in corpus) OR a register entry (known, no text).
-- Exactly one target must be set. Also marks works.status as non-authoritative for
-- validity, so nobody trusts it later.

ALTER TABLE work_relationships
    ADD COLUMN target_register_id INTEGER REFERENCES regulation_register(id) ON DELETE CASCADE;

-- target_work_id was NOT NULL; relax it now that a register target is allowed.
ALTER TABLE work_relationships
    ALTER COLUMN target_work_id DROP NOT NULL;

-- Exactly one of (work, register) target must be present.
ALTER TABLE work_relationships
    ADD CONSTRAINT chk_one_target
    CHECK ((target_work_id IS NOT NULL)::int + (target_register_id IS NOT NULL)::int = 1);

-- The original UNIQUE(source, target_work_id, rel_type) does not constrain register
-- targets (NULL target_work_id). Add a partial unique index for register edges.
CREATE UNIQUE INDEX uq_rel_register ON work_relationships
    (source_work_id, target_register_id, relationship_type_id)
    WHERE target_register_id IS NOT NULL;

CREATE INDEX idx_rel_target_register ON work_relationships(target_register_id)
    WHERE target_register_id IS NOT NULL;

-- works.status reads 'berlaku' even for repealed works. It is NOT the validity source.
COMMENT ON COLUMN works.status IS
    'NOT authoritative for legal validity. Validity is derived from work_relationships '
    '(dicabut_oleh edges) and rendered deterministically in code. Do not use this column '
    'for in-force checks.';
