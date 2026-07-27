-- ON CONFLICT DO NOTHING: idempotent across restarts, never wipes rows
-- added later (real OCM data, user-created vehicles). Needs the unique
-- constraint on name in Vehicle/Charger entities.

INSERT INTO vehicle (name, battery_kwh, base_wh_per_km, connector_type, max_charge_kw) VALUES
('Tata Nexon EV LR', 40.5, 145, 'CCS2', 50),
('MG ZS EV', 50.3, 170, 'CCS2', 76),
('Tata Tiago EV', 24.0, 110, 'CCS2', 25)
ON CONFLICT (name) DO NOTHING;

-- Placeholder corridor chargers, verified=false: real OCM pull + hand-verification
-- against Google Maps is still the Day-1-afternoon task in kishore's_work.pdf section 5.
INSERT INTO charger (name, lat, lng, power_kw, connector_types, operator, address, verified) VALUES
('Statiq - Channapatna Bypass', 12.6531, 77.2068, 50, ARRAY['CCS2'], 'Statiq', 'NH275, Channapatna', false),
('Tata Power EZ Charge - Maddur', 12.5843, 77.0461, 50, ARRAY['CCS2'], 'Tata Power', 'NH275, Maddur', false),
('ChargeZone - Mandya', 12.5218, 76.8951, 60, ARRAY['CCS2'], 'ChargeZone', 'NH275, Mandya', false),
('Ather Grid - Srirangapatna', 12.4231, 76.6923, 30, ARRAY['CCS2'], 'Ather', 'NH275, Srirangapatna', false)
ON CONFLICT (name) DO NOTHING;
