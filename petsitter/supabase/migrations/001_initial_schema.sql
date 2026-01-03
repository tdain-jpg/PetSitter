-- Pet Sitter Guide Pro - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================
-- PETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT NOT NULL CHECK (species IN ('dog', 'cat', 'bird', 'fish', 'reptile', 'small_mammal', 'other')),
    breed TEXT,
    age_years INTEGER,
    age_months INTEGER,
    weight_lbs DECIMAL(5,1),
    photo_url TEXT,
    color TEXT,
    microchip_id TEXT,
    is_spayed_neutered BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'memorial')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

-- Pets policies
CREATE POLICY "Users can view own pets"
    ON pets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pets"
    ON pets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pets"
    ON pets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pets"
    ON pets FOR DELETE
    USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_pets_user_id ON pets(user_id);

-- ============================================
-- PET MEDICAL INFO TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pet_medical_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    allergies TEXT[],
    medical_conditions TEXT[],
    special_needs TEXT,
    vet_name TEXT,
    vet_phone TEXT,
    vet_address TEXT,
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pet_medical_info ENABLE ROW LEVEL SECURITY;

-- Medical info policies (through pet ownership)
CREATE POLICY "Users can view own pet medical info"
    ON pet_medical_info FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM pets WHERE pets.id = pet_medical_info.pet_id AND pets.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own pet medical info"
    ON pet_medical_info FOR ALL
    USING (EXISTS (
        SELECT 1 FROM pets WHERE pets.id = pet_medical_info.pet_id AND pets.user_id = auth.uid()
    ));

-- ============================================
-- MEDICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    time_of_day TEXT[],
    instructions TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Medications policies
CREATE POLICY "Users can manage own pet medications"
    ON medications FOR ALL
    USING (EXISTS (
        SELECT 1 FROM pets WHERE pets.id = medications.pet_id AND pets.user_id = auth.uid()
    ));

-- ============================================
-- FEEDING SCHEDULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS feeding_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    meal_name TEXT NOT NULL,
    time TEXT NOT NULL,
    food_type TEXT NOT NULL,
    amount TEXT NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE feeding_schedules ENABLE ROW LEVEL SECURITY;

-- Feeding schedules policies
CREATE POLICY "Users can manage own pet feeding schedules"
    ON feeding_schedules FOR ALL
    USING (EXISTS (
        SELECT 1 FROM pets WHERE pets.id = feeding_schedules.pet_id AND pets.user_id = auth.uid()
    ));

-- ============================================
-- GUIDES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS guides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    sitter_name TEXT,
    sitter_phone TEXT,
    sitter_email TEXT,
    notes TEXT,
    share_id TEXT UNIQUE,
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;

-- Guides policies
CREATE POLICY "Users can view own guides"
    ON guides FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own guides"
    ON guides FOR ALL
    USING (auth.uid() = user_id);

-- Public can view shared guides
CREATE POLICY "Public can view shared guides"
    ON guides FOR SELECT
    USING (is_shared = TRUE AND share_id IS NOT NULL);

-- Index for share lookups
CREATE INDEX idx_guides_share_id ON guides(share_id) WHERE share_id IS NOT NULL;

-- ============================================
-- EMERGENCY CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Emergency contacts policies
CREATE POLICY "Users can manage own emergency contacts"
    ON emergency_contacts FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- HOME INFO TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS home_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    address TEXT,
    wifi_network TEXT,
    wifi_password TEXT,
    alarm_code TEXT,
    door_code TEXT,
    mailbox_info TEXT,
    trash_day TEXT,
    parking_info TEXT,
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE home_info ENABLE ROW LEVEL SECURITY;

-- Home info policies
CREATE POLICY "Users can manage own home info"
    ON home_info FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- DAILY ROUTINES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS daily_routines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
    time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning', 'midday', 'evening', 'bedtime')),
    task TEXT NOT NULL,
    pet_ids UUID[],
    is_completed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE daily_routines ENABLE ROW LEVEL SECURITY;

-- Daily routines policies
CREATE POLICY "Users can manage own guide routines"
    ON daily_routines FOR ALL
    USING (EXISTS (
        SELECT 1 FROM guides WHERE guides.id = daily_routines.guide_id AND guides.user_id = auth.uid()
    ));

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pets_updated_at
    BEFORE UPDATE ON pets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pet_medical_info_updated_at
    BEFORE UPDATE ON pet_medical_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medications_updated_at
    BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feeding_schedules_updated_at
    BEFORE UPDATE ON feeding_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guides_updated_at
    BEFORE UPDATE ON guides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_contacts_updated_at
    BEFORE UPDATE ON emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_home_info_updated_at
    BEFORE UPDATE ON home_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_routines_updated_at
    BEFORE UPDATE ON daily_routines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
