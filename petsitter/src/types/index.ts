// ============================================
// User Types
// ============================================
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: UserRole;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// ============================================
// Pet Types
// ============================================
export type PetSpecies = 'dog' | 'cat' | 'bird' | 'fish' | 'reptile' | 'rabbit' | 'hamster' | 'other';
export type PetStatus = 'active' | 'deceased';

export interface Pet {
  id: string;
  user_id: string;
  name: string;
  species: PetSpecies;
  breed?: string;
  age?: number;
  weight?: number;
  weight_unit?: 'lbs' | 'kg';
  photo_url?: string;
  medical_notes?: string;
  vet_info?: VetInfo;
  feeding_schedule: FeedingSchedule[];
  medications: Medication[];
  behavioral_notes?: string;
  special_instructions?: string;
  status: PetStatus;
  deceased_date?: string;
  created_at: string;
  updated_at: string;
}

export interface VetInfo {
  name: string;
  clinic: string;
  phone: string;
  address?: string;
  emergency_phone?: string;
}

export interface FeedingSchedule {
  id: string;
  time: string; // HH:mm format
  food_type: string;
  amount: string;
  notes?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  time?: string; // HH:mm format
  with_food?: boolean;
  notes?: string;
}

// ============================================
// Guide Types
// ============================================
export interface Guide {
  id: string;
  user_id: string;
  title: string;
  pet_ids: string[]; // References to pets included in this guide
  start_date?: string; // ISO date string
  end_date?: string; // ISO date string
  emergency_contacts: EmergencyContact[];
  home_info: HomeInfo;
  travel_itinerary?: TravelItinerary;
  daily_routine?: DailyRoutine;
  home_care?: HomeCare;
  additional_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship: string;
  is_primary: boolean;
  notes?: string;
}

export interface HomeInfo {
  address?: string;
  wifi_name?: string;
  wifi_password?: string;
  alarm_code?: string;
  door_code?: string;
  garage_code?: string;
  mailbox_code?: string;
  spare_key_location?: string;
  parking_info?: string;
  trash_day?: string;
  notes?: string;
}

// ============================================
// Travel Itinerary Types
// ============================================
export interface TravelItinerary {
  destination?: string;
  departure_date?: string;
  return_date?: string;
  flights: FlightInfo[];
  hotel_info?: HotelInfo;
  contact_while_away?: string;
  timezone_difference?: string;
  notes?: string;
}

export interface FlightInfo {
  id: string;
  type: 'departure' | 'return';
  airline: string;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string;
}

export interface HotelInfo {
  name: string;
  address?: string;
  phone?: string;
  confirmation_number?: string;
}

// ============================================
// Daily Routine Types
// ============================================
export type TimeBlock = 'morning' | 'midday' | 'evening' | 'bedtime';

export interface DailyRoutine {
  id: string;
  guide_id: string;
  tasks: RoutineTask[];
}

export interface RoutineTask {
  id: string;
  pet_id?: string; // Optional: null for general tasks
  time_block: TimeBlock;
  time?: string; // Specific time (HH:mm), optional
  title: string;
  description?: string;
  is_recurring: boolean;
  category: TaskCategory;
  order: number;
}

export type TaskCategory =
  | 'feeding'
  | 'medication'
  | 'walk'
  | 'play'
  | 'grooming'
  | 'litter'
  | 'water'
  | 'other';

export interface TaskCompletion {
  id: string;
  task_id: string;
  guide_id: string;
  date: string; // ISO date string
  completed_at?: string; // ISO datetime string
  completed_by?: string; // sitter name or ID
  notes?: string;
}

// ============================================
// Home Care Types
// ============================================
export interface HomeCare {
  id: string;
  guide_id: string;
  systems: HomeSystem[];
  tasks: HomeTask[];
  supplies: Supply[];
  appliances: Appliance[];
  guest_amenities: GuestAmenity[];
}

export interface HomeSystem {
  id: string;
  name: string;
  type: HomeSystemType;
  location?: string;
  instructions?: string;
  emergency_shutoff?: string;
}

export type HomeSystemType =
  | 'hvac'
  | 'water_heater'
  | 'security'
  | 'sprinkler'
  | 'pool'
  | 'fireplace'
  | 'other';

export interface HomeTask {
  id: string;
  title: string;
  frequency: TaskFrequency;
  day_of_week?: number; // 0-6 for weekly tasks
  instructions?: string;
  category: HomeTaskCategory;
}

export type TaskFrequency = 'daily' | 'weekly' | 'as_needed';

export type HomeTaskCategory =
  | 'plants'
  | 'mail'
  | 'trash'
  | 'cleaning'
  | 'other';

export interface Supply {
  id: string;
  name: string;
  location: string;
  quantity?: string;
  notes?: string;
  category: SupplyCategory;
}

export type SupplyCategory =
  | 'pet_food'
  | 'pet_supplies'
  | 'cleaning'
  | 'household'
  | 'other';

export interface Appliance {
  id: string;
  name: string;
  location?: string;
  instructions?: string;
  brand?: string;
  notes?: string;
}

export interface GuestAmenity {
  id: string;
  name: string;
  location?: string;
  instructions?: string;
  password?: string; // for smart TVs, etc.
}

// ============================================
// Share Types
// ============================================
export interface ShareableLink {
  id: string;
  guide_id: string;
  user_id: string;
  code: string; // Short unique code for the link
  expires_at?: string;
  is_active: boolean;
  view_count: number;
  created_at: string;
}

// ============================================
// AI Cheat Sheet Types
// ============================================
export interface CheatSheet {
  id: string;
  guide_id: string;
  content: string; // Markdown content
  generated_at: string;
  model_used?: string;
}

// ============================================
// Settings Types
// ============================================
export interface AppSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  gemini_api_key?: string;
  notifications_enabled: boolean;
  auto_save_enabled: boolean;
  onboarding_completed: boolean;
}

// ============================================
// Onboarding Types
// ============================================
export interface OnboardingState {
  current_step: OnboardingStep;
  completed_steps: OnboardingStep[];
  first_pet_id?: string;
  first_guide_id?: string;
}

export type OnboardingStep =
  | 'welcome'
  | 'create_pet'
  | 'create_guide'
  | 'completion';

// ============================================
// Form Helpers
// ============================================
export interface FormError {
  field: string;
  message: string;
}

export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: string;
  error?: string;
}
