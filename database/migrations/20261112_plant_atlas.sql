-- Shared plant atlas: canonical species, region-specific forage/risk assessment,
-- private field observations, and private image object metadata.
-- Public contributions are opt-in and require moderation; exact coordinates remain private.
CREATE TABLE public.plant_species (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scientific_name text,
 common_name text NOT NULL,
 synonyms text[] NOT NULL DEFAULT '{}',
 family_name text,
 description text,
 identification_status text NOT NULL DEFAULT 'unverified' CHECK (identification_status IN ('unverified','verified','rejected')),
 review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
 sources jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by_user_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
 reviewed_by_user_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (length(btrim(common_name)) BETWEEN 1 AND 160),
 CHECK (scientific_name IS NULL OR length(btrim(scientific_name)) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX plant_species_scientific_name_uq ON public.plant_species (lower(scientific_name)) WHERE scientific_name IS NOT NULL;
CREATE INDEX plant_species_common_name_idx ON public.plant_species (lower(common_name));
CREATE TABLE public.plant_regional_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 species_id uuid NOT NULL REFERENCES public.plant_species(id) ON DELETE CASCADE,
 region_code text NOT NULL,
 region_name text NOT NULL,
 nectar_rating text NOT NULL DEFAULT 'unknown' CHECK (nectar_rating IN ('unknown','low','medium','high','very_high')),
 pollen_rating text NOT NULL DEFAULT 'unknown' CHECK (pollen_rating IN ('unknown','low','medium','high','very_high')),
 climate_suitability text NOT NULL DEFAULT 'unknown' CHECK (climate_suitability IN ('unknown','poor','conditional','good')),
 invasive_status text NOT NULL DEFAULT 'unknown' CHECK (invasive_status IN ('unknown','not_invasive','potential','invasive')),
 weed_risk text NOT NULL DEFAULT 'unknown' CHECK (weed_risk IN ('unknown','low','medium','high')),
 cultivation_advice text NOT NULL DEFAULT 'unknown' CHECK (cultivation_advice IN ('unknown','recommend','conditional','avoid')),
 flowering_start_month smallint CHECK (flowering_start_month BETWEEN 1 AND 12),
 flowering_end_month smallint CHECK (flowering_end_month BETWEEN 1 AND 12),
 rationale text,
 risk_notes text,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
 reviewed_by_user_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (species_id, region_code),
 CHECK (length(btrim(region_code)) BETWEEN 2 AND 32),
 CHECK (length(btrim(region_name)) BETWEEN 1 AND 160)
);
CREATE INDEX plant_regional_assessments_region_idx ON public.plant_regional_assessments (region_code, cultivation_advice);
CREATE TABLE public.plant_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
 species_id uuid REFERENCES public.plant_species(id) ON DELETE SET NULL,
 suggested_name text NOT NULL,
 observed_at date NOT NULL,
 latitude numeric(9,6),
 longitude numeric(9,6),
 location_accuracy_m integer CHECK (location_accuracy_m IS NULL OR location_accuracy_m BETWEEN 0 AND 100000),
 locality text,
 region_code text,
 flowering_phase text NOT NULL DEFAULT 'unknown' CHECK (flowering_phase IN ('unknown','beginning','mass','ending','finished')),
 abundance text NOT NULL DEFAULT 'unknown' CHECK (abundance IN ('unknown','rare','scattered','common','mass')),
 bee_visits text NOT NULL DEFAULT 'not_checked' CHECK (bee_visits IN ('not_checked','observed','not_observed')),
 note text,
 input_source text NOT NULL DEFAULT 'text' CHECK (input_source IN ('text','voice','photo','mixed')),
 identification_result jsonb NOT NULL DEFAULT '{}'::jsonb,
 contribution_consent boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','pending_review','public')),
 moderation_status text NOT NULL DEFAULT 'private' CHECK (moderation_status IN ('private','pending','approved','rejected')),
 public_location_label text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (length(btrim(suggested_name)) BETWEEN 1 AND 160),
 CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
 CHECK (visibility <> 'public' OR (contribution_consent = true AND moderation_status = 'approved'))
);
CREATE INDEX plant_observations_species_date_idx ON public.plant_observations (species_id, observed_at DESC);
CREATE INDEX plant_observations_owner_date_idx ON public.plant_observations (owner_user_id, observed_at DESC);
CREATE INDEX plant_observations_region_date_idx ON public.plant_observations (region_code, observed_at DESC);
CREATE TABLE public.plant_observation_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 observation_id uuid NOT NULL REFERENCES public.plant_observations(id) ON DELETE CASCADE,
 storage_key text NOT NULL UNIQUE,
 mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic')),
 size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
 width integer,
 height integer,
 captured_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plant_observation_media_observation_idx ON public.plant_observation_media (observation_id);
