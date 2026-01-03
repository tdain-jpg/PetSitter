# Pet Sitter Guide Pro

A cross-platform mobile app for creating comprehensive pet care guides for pet sitters.

Built with React Native + Expo + Supabase.

## Tech Stack

- **Framework:** React Native 0.81 + Expo SDK 54
- **Navigation:** React Navigation 7
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **Backend:** Supabase (Auth + PostgreSQL)
- **Language:** TypeScript

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli` - optional, npx works too)
- A Supabase account (free tier works)

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/tdain-jpg/petsitter.git
cd petsitter
git checkout claude/review-petsitter-status-v9d8y
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/migrations/001_initial_schema.sql`
3. Go to **Settings → API** and copy your project URL and anon key

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run the App

```bash
# Web (runs on port 8081)
npm run web

# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Expo dev server
npm start
```

## Project Structure

```
petsitter/
├── App.tsx                 # App entry point with navigation
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Input.tsx
│   ├── screens/            # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   └── SignUpScreen.tsx
│   ├── navigation/         # React Navigation setup
│   │   ├── AuthNavigator.tsx
│   │   ├── MainNavigator.tsx
│   │   ├── RootNavigator.tsx
│   │   └── types.ts
│   ├── hooks/              # Custom React hooks
│   │   └── useAuth.ts
│   ├── lib/                # External service clients
│   │   └── supabase.ts
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   └── constants/          # App constants
├── supabase/
│   └── migrations/         # Database schema SQL
└── tailwind.config.js      # NativeWind/Tailwind config
```

## Database Schema

The Supabase schema includes:

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (auto-created on signup) |
| `pets` | Pet information (name, species, breed, etc.) |
| `pet_medical_info` | Allergies, conditions, vet details |
| `medications` | Medication schedules |
| `feeding_schedules` | Feeding times and portions |
| `guides` | Pet sitter guide documents |
| `emergency_contacts` | Emergency contact list |
| `home_info` | WiFi, alarm codes, house instructions |
| `daily_routines` | Daily task checklists |

All tables have Row Level Security (RLS) enabled.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server on port 8081 |
| `npm run web` | Run in web browser |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build:web` | Build for web deployment |

## Current Status

✅ Implemented:
- Project scaffolding with Expo + TypeScript
- NativeWind styling configuration
- React Navigation (Auth + Main stacks)
- Login/SignUp screens with validation
- Supabase client setup
- Database schema with RLS

🚧 TODO:
- Pet management screens (create, edit, list)
- Guide creation/editing
- Home info and emergency contacts forms
- PDF export functionality
- Share guide feature

## License

Private - Castles and Cruises, LLC
