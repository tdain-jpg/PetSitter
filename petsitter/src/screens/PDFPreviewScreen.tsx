import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'PDFPreview'>;

export function PDFPreviewScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, activePets, deceasedPets, getCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [cheatSheetContent, setCheatSheetContent] = useState<string | null>(null);

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
        setGuidePets(allPets.filter((p) => foundGuide.pet_ids.includes(p.id)));
      }

      const cheatSheet = await getCheatSheet(guideId);
      setCheatSheetContent(cheatSheet?.content || null);
    } finally {
      setLoading(false);
    }
  };

  const generateHTML = (): string => {
    if (!guide) return '';

    const petSections = guidePets.map((pet) => `
      <div class="section">
        <h2>${pet.name} (${pet.species}${pet.breed ? ` - ${pet.breed}` : ''})</h2>
        ${pet.age ? `<p><strong>Age:</strong> ${pet.age} years</p>` : ''}
        ${pet.weight ? `<p><strong>Weight:</strong> ${pet.weight} ${pet.weight_unit || 'lbs'}</p>` : ''}

        ${pet.feeding_schedule.length > 0 ? `
          <h3>Feeding Schedule</h3>
          <ul>
            ${pet.feeding_schedule.map((f) => `
              <li><strong>${f.time}</strong>: ${f.amount} of ${f.food_type}${f.notes ? ` (${f.notes})` : ''}</li>
            `).join('')}
          </ul>
        ` : ''}

        ${pet.medications.length > 0 ? `
          <h3>Medications</h3>
          <ul>
            ${pet.medications.map((m) => `
              <li><strong>${m.name}</strong>: ${m.dosage}, ${m.frequency}${m.with_food ? ' (give with food)' : ''}${m.notes ? ` - ${m.notes}` : ''}</li>
            `).join('')}
          </ul>
        ` : ''}

        ${pet.behavioral_notes ? `<p><strong>Behavioral Notes:</strong> ${pet.behavioral_notes}</p>` : ''}
        ${pet.special_instructions ? `<p><strong>Special Instructions:</strong> ${pet.special_instructions}</p>` : ''}
        ${pet.medical_notes ? `<p><strong>Medical Notes:</strong> ${pet.medical_notes}</p>` : ''}

        ${pet.vet_info ? `
          <h3>Veterinarian</h3>
          <p>${pet.vet_info.name} at ${pet.vet_info.clinic}<br>
          Phone: ${pet.vet_info.phone}${pet.vet_info.emergency_phone ? `<br>Emergency: ${pet.vet_info.emergency_phone}` : ''}</p>
        ` : ''}
      </div>
    `).join('<hr>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${guide.title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2563eb;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
          }
          h2 {
            color: #1f2937;
            margin-top: 30px;
          }
          h3 {
            color: #374151;
            margin-top: 20px;
          }
          .header {
            margin-bottom: 30px;
          }
          .dates {
            color: #6b7280;
            font-size: 14px;
          }
          .section {
            margin-bottom: 30px;
          }
          .emergency {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .emergency h2 {
            color: #dc2626;
            margin-top: 0;
          }
          .home-info {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .home-info h2 {
            color: #0284c7;
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
            border-top: 1px solid #e5e7eb;
            margin: 30px 0;
          }
          .cheat-sheet {
            background: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #9ca3af;
            font-size: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🐾 ${guide.title}</h1>
          ${guide.start_date || guide.end_date ? `
            <p class="dates">
              ${guide.start_date ? new Date(guide.start_date).toLocaleDateString() : ''}
              ${guide.end_date ? `→ ${new Date(guide.end_date).toLocaleDateString()}` : ''}
            </p>
          ` : ''}
        </div>

        ${guide.emergency_contacts.length > 0 ? `
          <div class="emergency">
            <h2>🚨 Emergency Contacts</h2>
            <ul>
              ${guide.emergency_contacts.map((c) => `
                <li>
                  <strong>${c.name}</strong> (${c.relationship})${c.is_primary ? ' - PRIMARY' : ''}<br>
                  Phone: ${c.phone}${c.email ? `<br>Email: ${c.email}` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="home-info">
          <h2>🏠 Home Information</h2>
          ${guide.home_info.address ? `<p><strong>Address:</strong> ${guide.home_info.address}</p>` : ''}
          ${guide.home_info.wifi_name ? `<p><strong>WiFi:</strong> ${guide.home_info.wifi_name}${guide.home_info.wifi_password ? ` / Password: ${guide.home_info.wifi_password}` : ''}</p>` : ''}
          ${guide.home_info.door_code ? `<p><strong>Door Code:</strong> ${guide.home_info.door_code}</p>` : ''}
          ${guide.home_info.alarm_code ? `<p><strong>Alarm Code:</strong> ${guide.home_info.alarm_code}</p>` : ''}
          ${guide.home_info.spare_key_location ? `<p><strong>Spare Key:</strong> ${guide.home_info.spare_key_location}</p>` : ''}
          ${guide.home_info.trash_day ? `<p><strong>Trash Day:</strong> ${guide.home_info.trash_day}</p>` : ''}
          ${guide.home_info.notes ? `<p><strong>Notes:</strong> ${guide.home_info.notes}</p>` : ''}
        </div>

        <h2>🐾 Pets</h2>
        ${petSections || '<p>No pets assigned to this guide.</p>'}

        ${cheatSheetContent ? `
          <div class="cheat-sheet">
            <h2>🤖 AI Cheat Sheet</h2>
            <div>${cheatSheetContent.replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}

        ${guide.additional_notes ? `
          <div class="section">
            <h2>📝 Additional Notes</h2>
            <p>${guide.additional_notes}</p>
          </div>
        ` : ''}

        <div class="footer">
          Generated by Pet Sitter Guide Pro • ${new Date().toLocaleDateString()}
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
        }
      } else {
        // For native, generate PDF
        const { uri } = await Print.printToFileAsync({ html });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${guide.title} - Pet Sitter Guide`,
          });
        } else {
          Alert.alert('Success', `PDF saved to: ${uri}`);
        }
      }
    } catch (error: any) {
      const message = error.message || 'Failed to export PDF';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-xl text-gray-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#2563eb',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          )}
          {Platform.OS === 'web' ? (
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontSize: 14,
                opacity: exporting ? 0.5 : 1,
              }}
            >
              {exporting ? 'Exporting...' : '🖨️ Print/Save PDF'}
            </button>
          ) : (
            <Button
              title="🖨️ Export"
              onPress={handleExport}
              loading={exporting}
              disabled={exporting}
            />
          )}
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-gray-900">📄 PDF Preview</Text>
          <Text className="text-gray-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Preview Card */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">
            What's Included
          </Text>
          <View className="gap-2">
            <Text className="text-gray-600">✓ Emergency contacts</Text>
            <Text className="text-gray-600">✓ Home information</Text>
            <Text className="text-gray-600">
              ✓ {guidePets.length} {guidePets.length === 1 ? 'pet' : 'pets'} with details
            </Text>
            {guidePets.map((pet) => (
              <Text key={pet.id} className="text-gray-500 ml-4">
                • {pet.name} - {pet.feeding_schedule.length} feeding times, {pet.medications.length} medications
              </Text>
            ))}
            {cheatSheetContent && (
              <Text className="text-gray-600">✓ AI-generated cheat sheet</Text>
            )}
            {guide.additional_notes && (
              <Text className="text-gray-600">✓ Additional notes</Text>
            )}
          </View>
        </Card>

        {!cheatSheetContent && (
          <Card className="mb-4">
            <Text className="text-orange-600 font-medium mb-2">💡 Tip</Text>
            <Text className="text-gray-600">
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

        <View className="mb-8">
          <Button
            title={exporting ? 'Exporting...' : '📄 Export as PDF'}
            onPress={handleExport}
            loading={exporting}
            disabled={exporting}
          />
        </View>
      </ScrollView>
    </View>
  );
}
