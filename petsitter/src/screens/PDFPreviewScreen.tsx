import { useState, useEffect } from 'react';
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import { escapeHtml } from '../lib/escapeHtml';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'PDFPreview'>;

interface PDFSections {
  emergencyContacts: boolean;
  homeInfo: boolean;
  pets: boolean;
  travelItinerary: boolean;
  aiCheatSheet: boolean;
  additionalNotes: boolean;
}

export function PDFPreviewScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, activePets, deceasedPets, getCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [cheatSheetContent, setCheatSheetContent] = useState<string | null>(null);

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

  useEffect(() => {
    loadData();
  }, [guideId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
        const allPets = [...activePets, ...deceasedPets];
        const pets = allPets.filter((p) => foundGuide.pet_ids.includes(p.id));
        setGuidePets(pets);
        setSelectedPetIds(pets.map((p) => p.id)); // Select all pets by default
      }

      const cheatSheet = await getCheatSheet(guideId);
      setCheatSheetContent(cheatSheet?.content || null);
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

  const generateHTML = (): string => {
    if (!guide) return '';

    // Every user/AI-supplied value MUST pass through esc() — on web this HTML
    // is written into a same-origin print window (XSS surface).
    const esc = escapeHtml;

    const selectedPets = guidePets.filter((p) => selectedPetIds.includes(p.id));

    const petSections = selectedPets.map((pet) => `
      <div class="section">
        <h2>${esc(pet.name)} (${esc(pet.species)}${pet.breed ? ` - ${esc(pet.breed)}` : ''})</h2>
        ${pet.age ? `<p><strong>Age:</strong> ${esc(pet.age)} years</p>` : ''}
        ${pet.weight ? `<p><strong>Weight:</strong> ${esc(pet.weight)} ${esc(pet.weight_unit || 'lbs')}</p>` : ''}

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
              ${guide.start_date ? new Date(guide.start_date).toLocaleDateString() : ''}
              ${guide.end_date ? `→ ${new Date(guide.end_date).toLocaleDateString()}` : ''}
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

        ${sections.aiCheatSheet && cheatSheetContent ? `
          <div class="cheat-sheet">
            <h2>🤖 AI Cheat Sheet</h2>
            <div>${esc(cheatSheetContent).replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}

        ${sections.additionalNotes && guide.additional_notes ? `
          <div class="section">
            <h2>📝 Additional Notes</h2>
            <p>${esc(guide.additional_notes)}</p>
          </div>
        ` : ''}

        <div class="footer">
          Generated by Pawstructions • ${new Date().toLocaleDateString()}
        </div>
      </body>
      </html>
    `;
  };

  const handleExport = async () => {
    if (!guide) return;
    setExporting(true);

    try {
      const html = generateHTML();

      if (Platform.OS === 'web') {
        // For web, open print dialog
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.print();
        } else {
          showAlert(
            'Popup Blocked',
            'Your browser blocked the print window. Allow popups for this site, then tap Export again.'
          );
        }
      } else {
        // For native, generate PDF
        const { uri } = await Print.printToFileAsync({ html });

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
      showAlert('Error', error.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
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
        <View className="flex-row items-center justify-between">
          <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          <Button
            title="🖨️ Export"
            onPress={handleExport}
            loading={exporting}
            disabled={exporting}
          />
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-brown-800">📄 PDF Preview</Text>
          <Text className="text-tan-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
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
                onValueChange={() => toggleSection('emergencyContacts')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
              <Text className="text-brown-600">🏠 Home Information</Text>
              <Switch
                value={sections.homeInfo}
                onValueChange={() => toggleSection('homeInfo')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
              <Text className="text-brown-600">🐾 Pet Details</Text>
              <Switch
                value={sections.pets}
                onValueChange={() => toggleSection('pets')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>

            {guide.travel_itinerary && (
              <View className="flex-row items-center justify-between py-2 border-b border-tan-200">
                <Text className="text-brown-600">✈️ Travel Itinerary</Text>
                <Switch
                  value={sections.travelItinerary}
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

        <View className="mb-8">
          <Button
            title={exporting ? 'Exporting...' : '📄 Export as PDF'}
            onPress={handleExport}
            loading={exporting}
            disabled={exporting || (!sections.emergencyContacts && !sections.homeInfo && !sections.pets && !sections.travelItinerary && !sections.aiCheatSheet && !sections.additionalNotes)}
          />
        </View>
      </ScrollView>
    </View>
  );
}
