# Product Requirements Document (PRD): Pet Sitter Guide Pro

## 1. Project Overview
**Product Name:** Pet Sitter Guide Pro
**Description:** A comprehensive web application designed for pet owners to create, manage, and share detailed care guides for their pets and home. The goal is to provide peace of mind to owners by ensuring sitters have every critical detail—from feeding schedules and medical needs to home access codes and emergency contacts.

**Core Value Proposition:**
1.  **Centralization:** All pet and home data in one place.
2.  **Detail-Oriented:** Structured data entry prevents owners from forgetting critical care details.
3.  **Shareability:** Secure, read-only access for sitters and PDF export capabilities.
4.  **AI Assistance:** AI-generated "Cheat Sheets" for quick reference.

---

## 2. Technical Constraint: Tech Stack Agnostic
*   **Frontend:** The developer (AI) should choose a modern, component-based frontend framework (e.g., React, Vue, Svelte) that ensures responsiveness and interactivity.
*   **Backend/Database:** The developer should choose a scalable backend and database solution (e.g., Supabase, Firebase, Node/Postgres) to replace the current mock `localStorage` implementation.
*   **Styling:** Clean, modern, accessible UI (similar to Tailwind CSS utility-first design).
*   **AI Integration:** Must use **Google Gemini API** for content generation features.

---

## 3. User Roles
*   **Pet Owner (Admin):** Can create accounts, edit guides, manage pets, generate links, and delete data.
*   **Pet Sitter (Viewer):** Can view shared guides via a unique link. View-only access; cannot edit data.

---

## 4. User Flows & Navigation

### 4.1. Authentication & Landing
*   **Landing Page:** informative marketing page explaining features (Profiles, Emergency Hub, AI Cheat Sheet, PDF Export).
*   **Auth:** Sign Up / Login / Logout.
    *   Support Email/Password.
    *   Support OAuth (Google, Apple, Facebook).
    *   *Requirement:* User data must be persistent in a real database.

### 4.2. Onboarding (Wizard)
*   **New User Flow:** Upon first login, present a modal wizard to collect essentials:
    *   Step 1: Welcome & Context.
    *   Step 2: Trip Dates (Start/End) & Sitter Schedule.
    *   Step 3: Critical Contacts (Owner Name/Phone, Vet Info).
    *   Step 4: First Pet Basic Info (Name, Breed, Age).
*   **Trip Planning Flow:** Existing users can trigger a "Plan New Trip" wizard to quickly update travel dates and sitter hours without re-entering pet details.

### 4.3. Main Guide Interface (Dashboard)
*   The guide is divided into **Collapsible Modules** for better organization.
*   **Auto-Save:** The application must automatically save changes after the user stops typing (debounce) or toggles a section.

---

## 5. Functional Modules (Data Requirements)

### 5.1. Emergency Information & Access
*   **Primary Contacts:** Owner 1 & 2 (Name, Phone), Trusted Neighbor (Name, Phone, "Has Key?" toggle), Emergency Contact.
*   **Veterinary:** Primary Vet, Emergency Vet (24hr), Specialty Vet. All include Clinic Name, Phone, Address.
*   **Property Access:** Address, WiFi (Network/Pass), Alarm Codes, Key Locations (Front Door, Garage, Gate).

### 5.2. Owner Travel Itinerary
*   **Schedule:** Travel Start/End Dates, Sitter Start/End Times (daily shift).
*   **Logistics:** Flight Info, Hotel/Accommodation Info.
*   **Transport:** Secondary transport details (Cruise, Train, Driving) and specific emergency hotlines for those modes.

### 5.3. Pet Profiles (Multi-Pet Support)
*   **CRUD:** Users can Add, Edit, and Remove pets.
*   **Memorial Status:** Pets can be moved to a "Memorial" status (archived/read-only) or permanently deleted.
*   **Photo:** Image upload with cropping capability.
*   **Bio:** Name, Nicknames, Breed, Sex, Spayed/Neutered, Age, Weight, Color/Markings.
*   **Identification:** Microchip ID, License Tag.
*   **Personality:** Energy Level, Sociability (People/Pets), Fears, Bad Habits, Comfort Items, Favorite Toys, Commands.
*   **Feeding Schedule:**
    *   Breakfast/Lunch/Dinner: Food Type, Portion, Bowl Location (Left/Right), Instructions.
    *   Snacks: Type, Max per day, Instructions.
*   **Medications:**
    *   Summary text field.
    *   **Detailed Schedule:** List of meds with Name, Dosage, Frequency (Daily/Twice Daily/As Needed), Time(s), Storage Location, and "Given With" (Food, Treat, etc.).
*   **Exercise:** Preferred activities, duration, routes, off-leash rules.

### 5.4. Health & Medical Protocols
*   **Symptom Checker:** Configurable list of "When to call the vet" (e.g., "Vomiting > 24hrs", "Refusal to eat"). Users can toggle specific symptoms and add custom notes.
*   **Insurance:** Provider, Policy #, Claims Phone, Coverage Notes.

### 5.5. Daily Routine Checklist
*   **Sections:** Morning, Midday, Evening, Bedtime.
*   **Time Range:** Approximate time for the routine.
*   **Task Matrix:** A list of standard tasks (Potty, Food, Meds, Play).
    *   *Critical:* Each task must have a boolean toggle **per pet**. (e.g., "Meds" might be checked for Dog A but unchecked for Cat B).
    *   Notes field per task.
*   **Special Instructions:** Free text area for the routine block.

### 5.6. Home Care & Household Info
*   **Systems:** Thermostat, Water Shut-off, Breaker Panel, Security, Smart Home. (Location + Instructions).
*   **Tasks:** Mail, Plants, Trash, Recycling, Blinds. (Frequency + Instructions + Details).
*   **Supplies Inventory:** Locations for Food, Meds, Treats, Leashes, Cleaning supplies, First Aid.
*   **Appliances:** TV/Remote help, Washer/Dryer, Coffee maker, Dishwasher.
*   **Guest Amenities:** (For overnight sitters) Bedroom info, Bathroom, Linens, Parking, House Rules ("Do's and Don'ts").

---

## 6. Key Features & Integrations

### 6.1. Share Guide (Read-Only)
*   **Action:** User clicks "Share".
*   **Function:** Generates a unique URL (e.g., `/view?id=xyz`).
*   **Security:** The view mode must disable all input fields, hide "Save" buttons, and show a visual indicator ("You are viewing a read-only guide").
*   **Privacy:** Sensitive data (like alarm codes) should be shared, but the user should be warned before generating the link.

### 6.2. PDF Export & Print
*   **Action:** User clicks "Print / Save PDF".
*   **Function:** Opens a modal to select which modules/pets to include.
*   **Output:** Generates a printer-friendly version of the guide.
    *   Must strip UI elements (buttons, nav).
    *   Must use a clean layout (two-column where appropriate) to save paper.
    *   *Library suggestion:* `html2canvas` + `jsPDF` or browser native print styling.

### 6.3. AI Cheat Sheet Generator
*   **Integration:** **Google Gemini API**.
*   **Trigger:** Button click "Generate Cheat Sheet".
*   **Logic:**
    1.  Compiles current guide data into a JSON payload.
    2.  Sends prompt to Gemini: "Create a concise, one-page summary in Markdown..."
    3.  Receives Markdown response.
    4.  Renders Markdown in a modal.
    5.  Allows printing of *just* the cheat sheet.
*   **Content:** Focuses on high-priority info: Contacts, Codes, Meds, Allergies, Feeding.

### 6.4. Profile Management
*   **Menu:** Dropdown in header.
*   **Memorial Archive:** View pets moved to memorial status; option to restore them to active.
*   **Account:** Option to permanently delete account and all data.

---

## 7. UI/UX Guidelines
*   **Theme:** Clean, professional, trustworthy. Primary color: Indigo/Blue.
*   **Feedback:** Visual indicators for "Saving...", "Saved", and Errors.
*   **Responsiveness:** Must work fully on Mobile (owners updating on the go) and Desktop (sitters reading/printing).
*   **Animations:** Subtle transitions for opening/closing modules and modals to feel polished.
*   **Icons:** Use intuitive icons for sections (Paw for pets, House for home, Plane for travel).

## 8. Data Schema (Reference)
*The system needs to store the following relationship:*
*   **User** (1) -> (1) **Guide**
*   **Guide** contains:
    *   Objects: Owner1, Owner2, Neighbor, EmergencyContact, PrimaryVet, EmergencyVet, SpecialtyVet, OwnerTravel, HomeInfo (Systems, Tasks, Supplies, Appliances, Amenities), EmergencyMedical.
    *   Arrays: Pets (List of Pet Profiles), Routines (Morning, Midday, Evening, Bedtime).

*(See provided `types.ts` in original code for exact field definitions).*
