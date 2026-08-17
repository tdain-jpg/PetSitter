import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, SectionHeader, ContactCard, PetCard, SensitiveValue, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { useGuideWithPets } from '../hooks';
import { COLORS } from '../constants';
import { showAlert, showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { friendlyError } from '../lib/errors';

type Props = NativeStackScreenProps<MainStackParamList, 'GuideDetail'>;

export function GuideDetailScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { deleteGuide, duplicateGuide } = useData();

  /**
   * A CONNECTED SITTER can reach this screen — the sitter household view links
   * straight here, and RLS lets them read a client's guides. They are not a
   * household member, so every write below is refused ("household member can
   * crud"). Showing them Edit, Duplicate and Delete offers buttons that can
   * only ever produce a permission error, and Delete Guide is an alarming thing
   * to dangle in front of someone looking after your animals.
   *
   * Both the guide and its pets come from useGuideWithPets rather than from the
   * context arrays directly. Those arrays hold only the caller's OWN
   * households, so this screen used to answer "Guide not found" to every sitter
   * — which also meant canEdit's own not-found branch defaulted them to
   * editable. Resolving first and deciding second fixes both halves.
   */
  const { guide, pets: guidePets, loading, canEdit } = useGuideWithPets(guideId);

  const handleEdit = () => {
    (navigation as any).navigate('GuideForm', { mode: 'edit', guideId });
  };

  const handleDelete = async () => {
    const ok = await showConfirm({
      title: 'Delete Guide',
      message: `Are you sure you want to delete "${guide?.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteGuide(guideId);
    navigation.goBack();
  };

  const handleDuplicate = async () => {
    try {
      const newGuide = await duplicateGuide(guideId);
      (navigation as any).navigate('GuideDetail', { guideId: newGuide.id });
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to duplicate guide'));
    }
  };

  const handleShare = () => {
    (navigation as any).navigate('ShareGuide', { guideId });
  };

  const handleExportPDF = () => {
    (navigation as any).navigate('PDFPreview', { guideId });
  };

  const handleAICheatSheet = () => {
    (navigation as any).navigate('AICheatSheet', { guideId });
  };

  const handleDailyRoutine = () => {
    (navigation as any).navigate('DailyRoutine', { guideId });
  };

  const handleHomeCare = () => {
    (navigation as any).navigate('HomeCare', { guideId });
  };

  // The hook holds `loading` true until the context load AND the by-id
  // fallback have both had their turn, so "not found" below is a real answer
  // rather than a race.
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
      <View className="bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
            <View className="flex-row items-center" style={{ gap: 16 }}>
              <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
              <Button title="Home" onPress={() => navigation.navigate('Home')} variant="outline" />
            </View>
            {canEdit ? <Button title="Edit" onPress={handleEdit} variant="primary" /> : null}
          </View>

          <View className="px-4 pb-4">
            <Text className="text-2xl font-bold text-brown-800">{guide.title}</Text>
            {(guide.start_date || guide.end_date) && (
              <Text className="text-tan-500 mt-1">
                📅 {formatDate(guide.start_date)}
                {guide.end_date && ` → ${formatDate(guide.end_date)}`}
              </Text>
            )}
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
          {/* Pets Section */}
          <SectionHeader
            title={`Pets (${guidePets.length})`}
            icon="🐾"
            rightAction={
                canEdit ? { label: 'Edit Pets', onPress: handleEdit } : undefined
            }
          >
            {guidePets.length === 0 ? (
              <Text className="text-tan-500">No pets assigned to this guide.</Text>
            ) : (
              guidePets.map((pet) => (
                <PetCard
                  key={pet.id}
                  pet={pet}
                  onPress={() => (navigation as any).navigate('PetDetail', { petId: pet.id })}
                />
              ))
            )}
          </SectionHeader>

          {/* Emergency Contacts */}
          <SectionHeader
            title={`Emergency Contacts (${guide.emergency_contacts.length})`}
            icon="🚨"
            rightAction={
                canEdit ? { label: 'Edit', onPress: handleEdit } : undefined
            }
          >
            {guide.emergency_contacts.length === 0 ? (
              <Text className="text-tan-500">No emergency contacts added.</Text>
            ) : (
              guide.emergency_contacts.map((contact) => (
                <ContactCard key={contact.id} contact={contact} readOnly />
              ))
            )}
          </SectionHeader>

          {/* Home Info */}
          <SectionHeader
            title="Home Information"
            icon="🏠"
            rightAction={
                canEdit ? { label: 'Edit', onPress: handleEdit } : undefined
            }
          >
            <View className="gap-2">
              {guide.home_info.address && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Address:</Text>
                  <Text className="text-brown-800 flex-1">{guide.home_info.address}</Text>
                </View>
              )}
              {guide.home_info.wifi_name && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">WiFi:</Text>
                  <Text className="text-brown-800 flex-1">{guide.home_info.wifi_name}</Text>
                </View>
              )}
              {guide.home_info.wifi_password && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Password:</Text>
                  <View className="flex-1">
                    <SensitiveValue value={guide.home_info.wifi_password} label="WiFi password" />
                  </View>
                </View>
              )}
              {guide.home_info.door_code && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Door Code:</Text>
                  <View className="flex-1">
                    <SensitiveValue value={guide.home_info.door_code} label="door code" />
                  </View>
                </View>
              )}
              {guide.home_info.alarm_code && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Alarm Code:</Text>
                  <View className="flex-1">
                    <SensitiveValue value={guide.home_info.alarm_code} label="alarm code" />
                  </View>
                </View>
              )}
              {guide.home_info.spare_key_location && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Spare Key:</Text>
                  <Text className="text-brown-800 flex-1">{guide.home_info.spare_key_location}</Text>
                </View>
              )}
              {guide.home_info.trash_day && (
                <View className="flex-row">
                  <Text className="text-tan-500 w-28">Trash Day:</Text>
                  <Text className="text-brown-800 flex-1">{guide.home_info.trash_day}</Text>
                </View>
              )}
              {guide.home_info.notes && (
                <View className="mt-2">
                  <Text className="text-tan-500">Notes:</Text>
                  <Text className="text-brown-800">{guide.home_info.notes}</Text>
                </View>
              )}
              {!guide.home_info.address &&
                !guide.home_info.wifi_name &&
                !guide.home_info.door_code && (
                  <Text className="text-tan-500">No home information added.</Text>
                )}
            </View>
          </SectionHeader>

          {/* Travel Itinerary */}
          {guide.travel_itinerary && (
            <SectionHeader title="Travel Itinerary" icon="✈️" defaultExpanded={false}>
              <View className="gap-2">
                {guide.travel_itinerary.destination && (
                  <View className="flex-row">
                    <Text className="text-tan-500 w-28">Destination:</Text>
                    <Text className="text-brown-800 flex-1">
                      {guide.travel_itinerary.destination}
                    </Text>
                  </View>
                )}
                {guide.travel_itinerary.contact_while_away && (
                  <View className="flex-row">
                    <Text className="text-tan-500 w-28">Contact:</Text>
                    <Text className="text-brown-800 flex-1">
                      {guide.travel_itinerary.contact_while_away}
                    </Text>
                  </View>
                )}
                {guide.travel_itinerary.flights.length > 0 && (
                  <View className="mt-2">
                    <Text className="text-tan-500 mb-2">Flights:</Text>
                    {guide.travel_itinerary.flights.map((flight) => (
                      <Card key={flight.id} className="mb-2">
                        <Text className="font-semibold text-brown-800">
                          {flight.type === 'departure' ? '✈️ Departure' : '🛬 Return'}
                        </Text>
                        <Text className="text-tan-600">
                          {flight.airline} {flight.flight_number}
                        </Text>
                        <Text className="text-tan-500 text-sm">
                          {flight.departure_airport} → {flight.arrival_airport}
                        </Text>
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Additional Notes */}
          {guide.additional_notes && (
            <SectionHeader title="Additional Notes" icon="📝" defaultExpanded={false}>
              <Text className="text-brown-600">{guide.additional_notes}</Text>
            </SectionHeader>
          )}

          {/* Quick Actions */}
          <View className="gap-3 mt-4">
            <Button title="📋 Daily Routine Checklist" onPress={handleDailyRoutine} variant="primary" />
            <Button title="🏠 Home Care Details" onPress={handleHomeCare} variant="outline" />
          </View>

          {/* Action Buttons */}
          <View className="gap-3 mt-6 mb-8">
            <Button title="🤖 Generate AI Cheat Sheet" onPress={handleAICheatSheet} variant="primary" />
            {/* Share is owner-only. It mints a PUBLIC, unauthenticated URL to
                the household's pet data and retires the guide's existing links
                — not something to offer the person you hired to feed the cat.
                RLS refuses it either way, but only after the screen has already
                started writing. Export as PDF stays: it is read-only, and a
                sitter wanting the guide on paper is the whole point. */}
            {canEdit ? <Button title="🔗 Share Guide" onPress={handleShare} variant="outline" /> : null}
            <Button title="📄 Export as PDF" onPress={handleExportPDF} variant="outline" />
            {canEdit ? (
              <>
                <Button title="📋 Duplicate Guide" onPress={handleDuplicate} variant="secondary" />
                <Button title="🗑️ Delete Guide" onPress={handleDelete} variant="outline" />
              </>
            ) : null}
          </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
