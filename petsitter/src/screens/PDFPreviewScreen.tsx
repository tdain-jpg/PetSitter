import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
  Switch,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button, Card, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { useGuideWithPets } from '../hooks';
import { supabase } from '../lib/supabase';
import { COLORS } from '../constants';
import { fillCheatSheetTokens } from '../lib/cheatSheetTokens';
import { showAlert } from '../lib/showAlert';
import { escapeHtml } from '../lib/escapeHtml';
import { formatDate, todayLocal } from '../lib/dates';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';
import { friendlyError } from '../lib/errors';

type Props = NativeStackScreenProps<MainStackParamList, 'PDFPreview'>;

interface PDFSections {
  emergencyContacts: boolean;
  homeInfo: boolean;
  pets: boolean;
  travelItinerary: boolean;
  aiCheatSheet: boolean;
  additionalNotes: boolean;
}

/** Posted by the exported document as soon as its embedded script runs. */
const PRINT_READY = 'pawstructions:print-ready';
/** Posted by the exported document once the browser's print dialog closes. */
const PRINT_DONE = 'pawstructions:print-done';

/** How long to wait for PRINT_READY before assuming the sandboxed frame failed. */
const PRINT_READY_TIMEOUT_MS = 4000;
/** Backstop teardown for browsers that never fire `afterprint` (e.g. iOS Safari). */
const PRINT_CLEANUP_TIMEOUT_MS = 120000;
/** Grace period before revoking a Blob URL handed off to a new browser tab. */
const BLOB_HANDOFF_REVOKE_MS = 60000;

/**
 * The exported cheat sheet's PREVIEW wash.
 *
 * An SVG <pattern> rather than a laid-out grid of tiles: `patternUnits` of
 * userSpaceOnUse repeats the tile across the whole fill region, so coverage is
 * a property of the geometry and cannot run out on a long sheet. (A fixed tile
 * count did run out — and because the grid was rotated about its own centre,
 * a tall block swung it out of the frame entirely.)
 */
const PDF_WATERMARK_WASH =
  '<div class="preview-frame" aria-hidden="true">' +
  '<svg class="preview-wash" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><pattern id="pawstructions-preview-wash" width="300" height="120"' +
  ' patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">' +
  '<text x="10" y="71">PREVIEW</text>' +
  '</pattern></defs>' +
  '<rect width="100%" height="100%" fill="url(#pawstructions-preview-wash)"></rect>' +
  '</svg></div>';

/**
 * Script embedded in the exported HTML on web only.
 *
 * It runs inside a sandboxed, opaque-origin iframe (no `allow-same-origin`), so
 * it cannot reach the app's DOM, storage or Supabase session — it can only print
 * its own document and postMessage progress back to us.
 */
const PRINT_SCRIPT = `
<script>
  (function () {
    var post = function (msg) { try { parent.postMessage(msg, '*'); } catch (e) {} };
    window.addEventListener('afterprint', function () { post('${PRINT_DONE}'); });
    post('${PRINT_READY}');
    setTimeout(function () { window.print(); }, 0);
  })();
</script>`;

/**
 * Print the exported guide on web without ever handing it a same-origin window.
 *
 * The HTML goes into a Blob, and the Blob URL is loaded in a hidden iframe whose
 * `sandbox` grants only `allow-scripts allow-modals` — enough for the embedded
 * script to open the print dialog, and deliberately NOT `allow-same-origin`, so
 * the document lands in an opaque origin with no access to the app. (The old
 * path did `document.write` into a same-origin popup; escaping made that safe,
 * this makes it structurally unreachable.)
 *
 * If the frame never reports back — blocked scripts, a browser that refuses the
 * Blob URL — we fall back to opening the Blob in a new tab and let the user
 * print from there.
 */
function printExportedGuideOnWeb(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-modals');
  iframe.setAttribute('title', 'Guide print preview');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  // Positioned off-screen rather than display:none — hidden frames are not
  // painted, and some browsers then refuse to print them.
  iframe.style.cssText =
    'position:fixed;top:0;left:-10000px;width:1px;height:1px;opacity:0;border:0;';

  let readyTimer: ReturnType<typeof setTimeout>;
  let cleanupTimer: ReturnType<typeof setTimeout>;

  const teardownFrame = () => {
    window.removeEventListener('message', onMessage);
    clearTimeout(readyTimer);
    clearTimeout(cleanupTimer);
    iframe.remove();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.data === PRINT_READY) {
      clearTimeout(readyTimer);
    } else if (event.data === PRINT_DONE) {
      teardownFrame();
      URL.revokeObjectURL(url);
    }
  };

  const fallbackToNewTab = () => {
    teardownFrame();
    const tab = window.open(url, '_blank');
    if (tab) {
      showAlert(
        'Ready to Print',
        "Your guide opened in a new tab. Use your browser's Print command to save it as a PDF."
      );
      // The new tab owns the Blob URL now; give it time to load before revoking.
      setTimeout(() => URL.revokeObjectURL(url), BLOB_HANDOFF_REVOKE_MS);
    } else {
      URL.revokeObjectURL(url);
      showAlert(
        'Popup Blocked',
        'Your browser blocked the print window. Allow popups for this site, then tap Export again.'
      );
    }
  };

  window.addEventListener('message', onMessage);
  readyTimer = setTimeout(fallbackToNewTab, PRINT_READY_TIMEOUT_MS);
  cleanupTimer = setTimeout(() => {
    teardownFrame();
    URL.revokeObjectURL(url);
  }, PRINT_CLEANUP_TIMEOUT_MS);

  iframe.src = url;
  document.body.appendChild(iframe);
}

export function PDFPreviewScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const {
    loadingPets,
    getCheatSheet,
    petsError,
    refreshPets,
  } = useData();

  // Resolved rather than filtered out of the context arrays, which hold only
  // the caller's own households. Exporting the guide to paper is the one thing
  // a sitter most obviously needs and the one this screen refused them: the
  // lookup missed and it rendered "Guide not found". No canEdit gating here —
  // a PDF is a read, and a sitter wanting the instructions on paper is the
  // entire point of the sitter account.
  const {
    guide: resolvedGuide,
    pets: resolvedPets,
    loading: guideLoading,
  } = useGuideWithPets(guideId);

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [cheatSheetContent, setCheatSheetContent] = useState<string | null>(null);
  // The exported PDF is the artifact a sitter is actually handed, so the free
  // tier's PREVIEW wash matters more here than on screen. Entitlement, not a
  // stored flag, decides it: sheets are saved unwatermarked so buying Crown
  // clears the wash from the next export with no regeneration.
  // Defaults to false — an entitlement read we couldn't complete must never
  // stamp PREVIEW across a paying household's export.
  const [cheatSheetWatermarked, setCheatSheetWatermarked] = useState(false);

  // Module selection state
  const [sections, setSections] = useState<PDFSections>({
    emergencyContacts: true,
    homeInfo: true,
    pets: true,
    travelItinerary: true,
    aiCheatSheet: true,
    additionalNotes: true,
  });
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);

  // Tracks which guide the "select all pets" default has been applied for, so
  // re-runs of loadData (guides/pets refreshing) never clobber the user's
  // manual pet selection.
  const selectionSeededForGuide = useRef<string | null>(null);

  // Entitlement decides the wash on an export whose sheet we didn't generate
  // this session. has_crown is membership-gated, so a non-member simply gets
  // false. A failed read leaves cheatSheetWatermarked ALONE rather than
  // setting it — see the state declaration: an entitlement we couldn't read
  // must never stamp PREVIEW across a paying household's export.
  const refreshCrown = useCallback(async (householdId: string | null | undefined) => {
    if (!householdId) return;
    try {
      const { data: crown, error: crownError } = await supabase.rpc('has_crown', {
        h: householdId,
      });
      if (!crownError) setCheatSheetWatermarked(crown !== true);
    } catch {
      // See above — the export keeps whatever treatment it already had.
    }
  }, []);

  // `guides`/pets are dependencies because a deep-link restore (hard reload of
  // /Main/PDFPreview?guideId=...) mounts this screen before DataContext's
  // initial fetch resolves — the lookup must retry once the data arrives.
  // The getCheatSheet re-fetch this triggers is an idempotent read.
  useEffect(() => {
    loadData();
  }, [guideId, resolvedGuide, resolvedPets]);

  // Crown can arrive while this screen just sits in the stack: the buyer
  // returns from UnlockCrown (which changes neither guideId nor guides, so the
  // effect above doesn't re-run), or another member of the household buys it
  // on their own device. Nothing else re-reads entitlement here — a foreground
  // refresh only touches households, not guides. Re-ask on focus so the PDF
  // the sitter is handed can't carry a wash they already paid to remove.
  useFocusEffect(
    useCallback(() => {
      refreshCrown(guide?.household_id);
    }, [guide?.household_id, refreshCrown])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = resolvedGuide;
      if (foundGuide) {
        setGuide(foundGuide);
        const pets = resolvedPets;
        setGuidePets(pets);
        // Don't consume the one-shot seed while pets are still loading: on a
        // deep-link restore the guides fetch can win the race, and seeding
        // against an empty pets array would leave every pet unchecked.
        // A FAILED pets load looks identical from here — `pets` is [] and
        // loadingPets is false — so it must not burn the seed either, or a
        // later successful refresh would never select anything.
        if (selectionSeededForGuide.current !== guideId && !loadingPets && !petsError) {
          setSelectedPetIds(pets.map((p) => p.id)); // Select all pets by default
          selectionSeededForGuide.current = guideId;
        }
      }

      const cheatSheet = await getCheatSheet(guideId);
      setCheatSheetContent(cheatSheet?.content || null);

      // Read here as well as on focus so the first paint already knows which
      // side of the paywall this export is on — the focus pass alone would
      // render the watermark banner a beat late. refreshCrown swallows its own
      // failures, so a bad entitlement read can never take the preview down.
      await refreshCrown(foundGuide?.household_id);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof PDFSections) => {
    setSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const togglePet = (petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId)
        ? prev.filter((id) => id !== petId)
        : [...prev, petId]
    );
  };

  const selectAllPets = () => setSelectedPetIds(guidePets.map((p) => p.id));
  const deselectAllPets = () => setSelectedPetIds([]);

  const generateHTML = ({ autoPrint = false }: { autoPrint?: boolean } = {}): string => {
    if (!guide) return '';

    // Every user/AI-supplied value MUST pass through esc(). On web this HTML is
    // rendered in a sandboxed, opaque-origin iframe, but escaping stays the
    // first line of defence (and the native PDF path has no sandbox at all).
    const esc = escapeHtml;

    const selectedPets = guidePets.filter((p) => selectedPetIds.includes(p.id));

    const petSections = selectedPets.map((pet) => `
      <div class="section">
        <h2>${esc(pet.name)} (${esc(pet.species)}${pet.breed ? ` - ${esc(pet.breed)}` : ''})</h2>
        ${pet.age != null ? `<p><strong>Age:</strong> ${esc(pet.age)} years</p>` : ''}
        ${pet.weight != null ? `<p><strong>Weight:</strong> ${esc(pet.weight)} ${esc(pet.weight_unit || 'lbs')}</p>` : ''}

        ${pet.feeding_schedule.length > 0 ? `
          <h3>Feeding Schedule</h3>
          <ul>
            ${pet.feeding_schedule.map((f) => `
              <li><strong>${esc(f.time)}</strong>: ${esc(f.amount)} of ${esc(f.food_type)}${f.notes ? ` (${esc(f.notes)})` : ''}</li>
            `).join('')}
          </ul>
        ` : ''}

        ${pet.medications.length > 0 ? `
          <h3>Medications</h3>
          <ul>
            ${pet.medications.map((m) => `
              <li><strong>${esc(m.name)}</strong>: ${esc(m.dosage)}, ${esc(m.frequency)}${m.with_food ? ' (give with food)' : ''}${m.notes ? ` - ${esc(m.notes)}` : ''}</li>
            `).join('')}
          </ul>
        ` : ''}

        ${pet.behavioral_notes ? `<p><strong>Behavioral Notes:</strong> ${esc(pet.behavioral_notes)}</p>` : ''}
        ${pet.special_instructions ? `<p><strong>Special Instructions:</strong> ${esc(pet.special_instructions)}</p>` : ''}
        ${pet.medical_notes ? `<p><strong>Medical Notes:</strong> ${esc(pet.medical_notes)}</p>` : ''}

        ${pet.vet_info ? `
          <h3>Veterinarian</h3>
          <p>${esc(pet.vet_info.name)} at ${esc(pet.vet_info.clinic)}<br>
          Phone: ${esc(pet.vet_info.phone)}${pet.vet_info.emergency_phone ? `<br>Emergency: ${esc(pet.vet_info.emergency_phone)}` : ''}</p>
        ` : ''}
      </div>
    `).join('<hr>');

    // Built out here rather than inline: the free-tier PREVIEW treatment adds
    // a wash layer and two lines of copy to this one block.
    let cheatSheetSection = '';
    if (sections.aiCheatSheet && cheatSheetContent) {
      const sheetBody = esc(
        fillCheatSheetTokens(cheatSheetContent, guide.home_info)
      ).replace(/\n/g, '<br>');

      if (cheatSheetWatermarked) {
        // Written for the SITTER first, who is the one holding this page: the
        // watermark explains itself before it can make anyone hesitate over a
        // dose. The sales line waits for the footer.
        const note =
          '<p class="preview-note"><strong>PREVIEW</strong> — the watermark marks a free Pawstructions cheat sheet. The care details below are the real ones from this guide.</p>';
        const footer =
          '<p class="preview-footer">Pawstructions Crown ($5, one-time) removes this watermark.</p>';
        cheatSheetSection = `<div class="cheat-sheet preview">${PDF_WATERMARK_WASH}<div class="cheat-sheet-body"><h2>🤖 AI Cheat Sheet</h2>${note}<div>${sheetBody}</div>${footer}</div></div>`;
      } else {
        cheatSheetSection = `<div class="cheat-sheet"><div class="cheat-sheet-body"><h2>🤖 AI Cheat Sheet</h2><div>${sheetBody}</div></div></div>`;
      }
    }

    const itinerary = guide.travel_itinerary;
    const travelSection = sections.travelItinerary && itinerary ? `
      <div class="travel">
        <h2>✈️ Travel Itinerary</h2>
        ${itinerary.destination ? `<p><strong>Destination:</strong> ${esc(itinerary.destination)}</p>` : ''}
        ${itinerary.departure_date ? `<p><strong>Departure:</strong> ${esc(itinerary.departure_date)}</p>` : ''}
        ${itinerary.return_date ? `<p><strong>Return:</strong> ${esc(itinerary.return_date)}</p>` : ''}
        ${itinerary.contact_while_away ? `<p><strong>Contact While Away:</strong> ${esc(itinerary.contact_while_away)}</p>` : ''}
        ${itinerary.timezone_difference ? `<p><strong>Timezone Difference:</strong> ${esc(itinerary.timezone_difference)}</p>` : ''}
        ${itinerary.flights.length > 0 ? `
          <h3>Flights</h3>
          <ul>
            ${itinerary.flights.map((flight) => `
              <li>
                <strong>${flight.type === 'departure' ? '✈️ Departure' : '🛬 Return'}</strong>:
                ${esc(flight.airline)} ${esc(flight.flight_number)},
                ${esc(flight.departure_airport)} → ${esc(flight.arrival_airport)}
                (${esc(flight.departure_time)} → ${esc(flight.arrival_time)})
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${itinerary.hotel_info ? `
          <h3>Hotel</h3>
          <p>${esc(itinerary.hotel_info.name)}${itinerary.hotel_info.address ? `<br>${esc(itinerary.hotel_info.address)}` : ''}${itinerary.hotel_info.phone ? `<br>Phone: ${esc(itinerary.hotel_info.phone)}` : ''}${itinerary.hotel_info.confirmation_number ? `<br>Confirmation #: ${esc(itinerary.hotel_info.confirmation_number)}` : ''}</p>
        ` : ''}
        ${itinerary.notes ? `<p><strong>Notes:</strong> ${esc(itinerary.notes)}</p>` : ''}
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${esc(guide.title)}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: ${COLORS.text};
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: ${COLORS.secondary};
            border-bottom: 2px solid ${COLORS.primary};
            padding-bottom: 10px;
          }
          h2 {
            color: ${COLORS.secondary};
            margin-top: 30px;
          }
          h3 {
            color: ${COLORS.primaryDark};
            margin-top: 20px;
          }
          .header {
            margin-bottom: 30px;
          }
          .dates {
            color: ${COLORS.textMuted};
            font-size: 14px;
          }
          .section {
            margin-bottom: 30px;
          }
          .emergency {
            background: #FBF0EF; /* accent-50 */
            border: 1px solid #ECBCB8; /* accent-200 */
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .emergency h2 {
            color: ${COLORS.accent};
            margin-top: 0;
          }
          .home-info {
            background: ${COLORS.cream};
            border: 1px solid ${COLORS.border};
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .home-info h2 {
            color: ${COLORS.secondary};
            margin-top: 0;
          }
          .travel {
            background: ${COLORS.cream};
            border: 1px solid ${COLORS.border};
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .travel h2 {
            color: ${COLORS.secondary};
            margin-top: 0;
          }
          ul {
            padding-left: 20px;
          }
          li {
            margin-bottom: 8px;
          }
          hr {
            border: none;
            border-top: 1px solid ${COLORS.border};
            margin: 30px 0;
          }
          .cheat-sheet {
            background: ${COLORS.primary50};
            border: 1px solid ${COLORS.primary200};
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            white-space: pre-wrap;
          }
          /* --- Free-tier PREVIEW treatment (cheat sheet only) --------------
             Scoped to the cheat sheet: the rest of this document is the
             owner's own guide, a free feature, and stamping PREVIEW across
             emergency contacts would tell a sitter to distrust a phone
             number. "Preview" describes the feature state, never the data. */
          .cheat-sheet.preview {
            /* Positioning anchor for the wash. Deliberately NOT
               overflow:hidden — a clipping block can lose content where it
               breaks across printed pages, and this one carries doses. */
            position: relative;
          }
          .preview-frame {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            overflow: hidden;
            z-index: 0;
            white-space: normal;
            /* Matches .cheat-sheet so the wash can't square off its corners. */
            border-radius: 8px;
          }
          .preview-wash {
            /* Fills the frame at whatever size the frame happens to be; the
               tiling itself is the <pattern>'s job, so a 400px sheet and an
               8000px one are both covered corner to corner. No viewBox, so one
               SVG user unit stays one CSS pixel and the tile is really 300x120.
               Absolutely positioned, and NOT via inset/auto sizing: an SVG is a
               monolithic box, so left in normal flow one taller than a page is
               pushed whole onto the next one and page 1 of the PDF prints
               unwatermarked. Out of flow with an explicit 100%/100% it paints
               across every page. */
            position: absolute;
            top: 0;
            left: 0;
            display: block;
            width: 100%;
            height: 100%;
          }
          .preview-wash text {
            font-size: 30px;
            font-weight: 800;
            letter-spacing: 8px;
            /* REAL TEXT, not a CSS background image. Browsers drop background
               graphics from a print unless the reader ticks a box; SVG content
               is part of the document and always prints. Light enough that
               every word underneath stays readable — legibility beats the
               nudge, every time. */
            fill: rgba(151, 120, 59, 0.22);
          }
          .cheat-sheet-body {
            position: relative;
            z-index: 1;
          }
          .preview-note {
            white-space: normal;
            border-left: 4px solid ${COLORS.warm};
            padding-left: 10px;
            margin: 0 0 12px 0;
            font-size: 13px;
            color: ${COLORS.textLight};
          }
          .preview-footer {
            white-space: normal;
            margin: 14px 0 0 0;
            padding-top: 8px;
            border-top: 1px solid ${COLORS.border};
            font-size: 12px;
            color: ${COLORS.textMuted};
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid ${COLORS.border};
            color: ${COLORS.textMuted};
            font-size: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🐾 ${esc(guide.title)}</h1>
          ${guide.start_date || guide.end_date ? `
            <p class="dates">
              ${esc(formatDate(guide.start_date))}
              ${guide.end_date ? `→ ${esc(formatDate(guide.end_date))}` : ''}
            </p>
          ` : ''}
        </div>

        ${sections.emergencyContacts && guide.emergency_contacts.length > 0 ? `
          <div class="emergency">
            <h2>🚨 Emergency Contacts</h2>
            <ul>
              ${guide.emergency_contacts.map((c) => `
                <li>
                  <strong>${esc(c.name)}</strong> (${esc(c.relationship)})${c.is_primary ? ' - PRIMARY' : ''}${c.has_key ? ' 🔑' : ''}<br>
                  Phone: ${esc(c.phone)}${c.email ? `<br>Email: ${esc(c.email)}` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        ${sections.homeInfo ? `
        <div class="home-info">
          <h2>🏠 Home Information</h2>
          ${guide.home_info.address ? `<p><strong>Address:</strong> ${esc(guide.home_info.address)}</p>` : ''}
          ${guide.home_info.wifi_name ? `<p><strong>WiFi:</strong> ${esc(guide.home_info.wifi_name)}${guide.home_info.wifi_password ? ` / Password: ${esc(guide.home_info.wifi_password)}` : ''}</p>` : ''}
          ${guide.home_info.door_code ? `<p><strong>Door Code:</strong> ${esc(guide.home_info.door_code)}</p>` : ''}
          ${guide.home_info.alarm_code ? `<p><strong>Alarm Code:</strong> ${esc(guide.home_info.alarm_code)}</p>` : ''}
          ${guide.home_info.garage_code ? `<p><strong>Garage Code:</strong> ${esc(guide.home_info.garage_code)}</p>` : ''}
          ${guide.home_info.gate_code ? `<p><strong>Gate Code:</strong> ${esc(guide.home_info.gate_code)}</p>` : ''}
          ${guide.home_info.mailbox_code ? `<p><strong>Mailbox Code:</strong> ${esc(guide.home_info.mailbox_code)}</p>` : ''}
          ${guide.home_info.spare_key_location ? `<p><strong>Spare Key:</strong> ${esc(guide.home_info.spare_key_location)}</p>` : ''}
          ${guide.home_info.trash_day ? `<p><strong>Trash Day:</strong> ${esc(guide.home_info.trash_day)}</p>` : ''}
          ${guide.home_info.notes ? `<p><strong>Notes:</strong> ${esc(guide.home_info.notes)}</p>` : ''}
        </div>
        ` : ''}

        ${sections.pets && selectedPetIds.length > 0 ? `
        <h2>🐾 Pets</h2>
        ${petSections || '<p>No pets selected.</p>'}
        ` : ''}

        ${travelSection}

        ${cheatSheetSection}

        ${sections.additionalNotes && guide.additional_notes ? `
          <div class="section">
            <h2>📝 Additional Notes</h2>
            <p>${esc(guide.additional_notes)}</p>
          </div>
        ` : ''}

        <div class="footer">
          Generated by Pawstructions • ${esc(formatDate(todayLocal()))}
        </div>
        ${autoPrint ? PRINT_SCRIPT : ''}
      </body>
      </html>
    `;
  };

  const handleExport = async () => {
    if (!guide) return;
    setExporting(true);

    try {
      if (Platform.OS === 'web') {
        // For web, print from a sandboxed iframe (never a same-origin window)
        printExportedGuideOnWeb(generateHTML({ autoPrint: true }));
      } else {
        // For native, generate PDF
        const { uri } = await Print.printToFileAsync({ html: generateHTML() });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${guide.title} - Pawstructions Guide`,
          });
        } else {
          showAlert('Success', `PDF saved to: ${uri}`);
        }
      }
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to export PDF'));
    } finally {
      setExporting(false);
    }
  };

  // Keep spinning while household guides/pets are still loading — declaring
  // "not found" before the initial fetch resolves would be a false negative.
  if (loading || guideLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            <Button
              title="🖨️ Export"
              onPress={handleExport}
              loading={exporting}
              // Same guard as the bottom Export button — this one would
              // otherwise be an unblocked path to a pet-less PDF.
              disabled={exporting || (petsError != null && guide.pet_ids.length > 0)}
            />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">📄 PDF Preview</Text>
            <Text className="text-tan-500">{guide.title}</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
        {/* Section Selection */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-3">
            Select Sections to Include
          </Text>

          {/* Section Toggles */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
              <Text className="text-brown-600">🚨 Emergency Contacts</Text>
              <Switch
                value={sections.emergencyContacts}
                accessibilityLabel="Include emergency contacts"
                onValueChange={() => toggleSection('emergencyContacts')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
              <Text className="text-brown-600">🏠 Home Information</Text>
              <Switch
                value={sections.homeInfo}
                accessibilityLabel="Include home information"
                onValueChange={() => toggleSection('homeInfo')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
              <Text className="text-brown-600">🐾 Pet Details</Text>
              <Switch
                value={sections.pets}
                accessibilityLabel="Include pet profiles"
                onValueChange={() => toggleSection('pets')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            {guide.travel_itinerary && (
              <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
                <Text className="text-brown-600">✈️ Travel Itinerary</Text>
                <Switch
                  value={sections.travelItinerary}
                accessibilityLabel="Include travel itinerary"
                  onValueChange={() => toggleSection('travelItinerary')}
                  trackColor={{ true: COLORS.primary }}
                />
              </View>
            )}

            {cheatSheetContent && (
              <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
                <Text className="text-brown-600">🤖 AI Cheat Sheet</Text>
                <Switch
                  value={sections.aiCheatSheet}
                accessibilityLabel="Include AI cheat sheet"
                  onValueChange={() => toggleSection('aiCheatSheet')}
                  trackColor={{ true: COLORS.primary }}
                />
              </View>
            )}

            {guide.additional_notes && (
              <View className="flex-row items-center justify-between py-2">
                <Text className="text-brown-600">📝 Additional Notes</Text>
                <Switch
                  value={sections.additionalNotes}
                accessibilityLabel="Include additional notes"
                  onValueChange={() => toggleSection('additionalNotes')}
                  trackColor={{ true: COLORS.primary }}
                />
              </View>
            )}
          </View>
        </Card>

        {/* Pet Selection */}
        {sections.pets && guidePets.length > 0 && (
          <Card className="mb-4">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-brown-800">
                Select Pets
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={selectAllPets}
                  accessibilityRole="button"
                  accessibilityLabel="Select all pets"
                >
                  <Text className="text-primary-600 text-sm">All</Text>
                </Pressable>
                <Text className="text-tan-300">|</Text>
                <Pressable
                  onPress={deselectAllPets}
                  accessibilityRole="button"
                  accessibilityLabel="Deselect all pets"
                >
                  <Text className="text-tan-500 text-sm">None</Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-2">
              {guidePets.map((pet) => (
                <Pressable
                  key={pet.id}
                  onPress={() => togglePet(pet.id)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={pet.name}
                  accessibilityState={{ checked: selectedPetIds.includes(pet.id) }}
                  className={`flex-row items-center p-3 rounded-lg border ${
                    selectedPetIds.includes(pet.id)
                      ? 'bg-primary-50 border-primary-200'
                      : 'bg-cream-200 border-tan-200'
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${
                      selectedPetIds.includes(pet.id)
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-tan-300'
                    }`}
                  >
                    {selectedPetIds.includes(pet.id) && (
                      <Text className="text-white text-xs">✓</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-brown-800">{pet.name}</Text>
                    <Text className="text-tan-500 text-sm">
                      {pet.feeding_schedule.length} feedings, {pet.medications.length} medications
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* Nobody should discover the watermark after emailing the PDF to
            their sitter. Only shown when the sheet is actually going in. */}
        {cheatSheetWatermarked && cheatSheetContent && sections.aiCheatSheet && (
          <Card className="mb-4 bg-warm-50 border-warm-300">
            <Text className="text-brown-800 font-semibold mb-1">
              👑 The cheat sheet will carry a PREVIEW watermark
            </Text>
            <Text className="text-brown-600 text-sm mb-3">
              Everything in this PDF is your own information, and the rest of it
              exports clean. Crown removes the watermark from the cheat sheet —
              $5 once for your whole household.
            </Text>
            <Button
              title="👑 Unlock Crown — $5"
              variant="outline"
              onPress={() => navigation.navigate('UnlockCrown', { guideId })}
            />
          </Card>
        )}

        {/* Tip for cheat sheet */}
        {!cheatSheetContent && (
          <Card className="mb-4">
            <Text className="text-warm-600 font-medium mb-2">💡 Tip</Text>
            <Text className="text-tan-600">
              Generate an AI Cheat Sheet first to include a quick-reference summary in your PDF.
            </Text>
            <View className="mt-3">
              <Button
                title="Generate Cheat Sheet"
                onPress={() => (navigation as any).navigate('AICheatSheet', { guideId })}
                variant="outline"
              />
            </View>
          </Card>
        )}

        {/* Export Summary */}
        <Card className="mb-4">
          <Text className="text-sm font-medium text-tan-500 mb-2">EXPORT SUMMARY</Text>
          <Text className="text-tan-600">
            {[
              sections.emergencyContacts && guide.emergency_contacts.length > 0 && `${guide.emergency_contacts.length} contacts`,
              sections.homeInfo && 'Home info',
              sections.pets && selectedPetIds.length > 0 && `${selectedPetIds.length} pets`,
              sections.travelItinerary && guide.travel_itinerary && 'Travel itinerary',
              sections.aiCheatSheet && cheatSheetContent && 'AI cheat sheet',
              sections.additionalNotes && guide.additional_notes && 'Notes',
            ].filter(Boolean).join(' • ') || 'No sections selected'}
          </Text>
        </Card>

        {/* A failed pets load is indistinguishable from "this guide has no
            pets" once loadingPets clears, so without this the export silently
            produces a document with no Pets section at all — every feeding
            schedule, medication and vet contact missing from the page a sitter
            is handed. Refuse to export instead, and offer the retry. */}
        {petsError && guide.pet_ids.length > 0 && (
          <Card className="mb-4 border border-red-300 bg-red-50">
            <Text className="font-semibold text-red-700 mb-1">Pets couldn't be loaded</Text>
            <Text className="text-tan-600 mb-3">
              This guide covers {guide.pet_ids.length}{' '}
              {guide.pet_ids.length === 1 ? 'pet' : 'pets'}, but we couldn't read
              their details. Exporting now would leave them out of the PDF.
            </Text>
            <Button title="Try again" onPress={() => refreshPets()} variant="outline" />
          </Card>
        )}

        <View className="mb-8">
          <Button
            title={exporting ? 'Exporting...' : '📄 Export as PDF'}
            onPress={handleExport}
            loading={exporting}
            disabled={exporting || (petsError != null && guide.pet_ids.length > 0) || (!sections.emergencyContacts && !sections.homeInfo && !sections.pets && !sections.travelItinerary && !sections.aiCheatSheet && !sections.additionalNotes)}
          />
        </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
