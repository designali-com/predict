-- EMG recordings made in the clinic with the Predict EMG armband (NPG Lite,
-- 3 channels at 500 Hz), optionally alongside a VALD DynaMo, against a
-- patient's chart and the visit they were made at.
--
-- The raw signal (ADC codes, every sample) is a private file in the bucket;
-- the row keeps what the clinic reads: the protocol and placement, the phase
-- markers, per-channel metrics, and a light envelope for the chart.

CREATE TABLE IF NOT EXISTS emg_recording (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES patient_record(id) ON DELETE CASCADE,
  appointment_id text REFERENCES appointment(id) ON DELETE SET NULL,
  clinic_id text REFERENCES clinic(id) ON DELETE SET NULL,
  protocol_name text NOT NULL,
  montage text,
  side text,
  placements jsonb NOT NULL DEFAULT '[]'::jsonb,
  device jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_rate_hz integer NOT NULL DEFAULT 500,
  channel_count integer NOT NULL DEFAULT 3,
  duration_seconds double precision NOT NULL,
  samples_received integer NOT NULL,
  samples_missing integer NOT NULL DEFAULT 0,
  markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  envelope jsonb NOT NULL DEFAULT '{}'::jsonb,
  force jsonb,
  raw_url text,
  notes text,
  recorded_at timestamp NOT NULL,
  recorded_by_user_id text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emg_recording_patient_idx ON emg_recording (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS emg_recording_appointment_idx ON emg_recording (appointment_id);
