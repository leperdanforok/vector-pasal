-- Migration 070: Add PERBUP_KAB regulation type for Peraturan Bupati
INSERT INTO regulation_types (code, name_id, name_en, hierarchy_level, description)
VALUES ('PERBUP_KAB', 'Peraturan Bupati', 'Regent Regulation', 8,
        'Peraturan Bupati Kabupaten/Kota — implementing regulations for Perda')
ON CONFLICT (code) DO NOTHING;
