-- Script DDL de Concorrência e Extensões PostgreSQL (Neon / Vercel Storage)
-- Executar no Console SQL da Vercel / Neon / Supabase se desejado para isolamento estrito via RLS e btree_gist

-- 1. Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Restrição de Concorrência nativa: Impede Overbooking (Double Booking)
-- Impede que consultas 'CONFIRMED' ou 'AGENDADO' se sobreponham no tempo para a mesma clínica/tenant
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_appointments'
    ) THEN
        ALTER TABLE appointments 
        ADD CONSTRAINT no_overlapping_appointments 
        EXCLUDE USING gist (
            clinic_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        )
        WHERE (status IN ('CONFIRMED', 'AGENDADO'));
    END IF;
END $$;

-- 3. Row-Level Security (RLS) opcional para isolamento por tenant/clínica
-- ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation_patients ON patients
--     FOR ALL
--     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
