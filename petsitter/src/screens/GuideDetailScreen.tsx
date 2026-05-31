import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, SectionHeader, ContactCard, PetCard, SensitiveValue } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'GuideDetail'>;

export function GuideDetailScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, activePets, deceasedPets, deleteGuide, duplicateGuide } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const foundGuide = guides.find((g) => g.id === guideId);
    if (foundGuide) {
      setGuide(foundGuide);
      const allPets = [...activePets, ...deceasedPets];
      setGuidePets(allPets.filter((p) => foundGuide.pet_ids.includes(p.id)));
    }
    setLoading(false);
  }, [guideId, guides, activePets, deceasedPets]);

  const handleEdit = () => {
    (navigation as any).navigate('GuideForm', { mode: 'edit', guideId });
  };

  const handleDelete = () => {
    const confirmDelete = async () => {
      await deleteGuide(guideId);
      navigation.goBack();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${guide?.title}"? This cannot be undone.`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Guide',
        `Are you sure you want to delete "${guide?.title}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  const handleDuplicate = async () => {
    try {
      const newGuide = await duplicateGuide(guideId);
      (navigation as any).navigate('GuideDetail', { guideId: newGuide.id });
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to duplicate guide');
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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-cream-50 border-b border-tan-200">
        <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
          <View className="flex-row items-center" style={{ gap: 16 }}>
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            <Button title="Home" onPress={() => navigation.navigate('Home')} variant="outline" />
          </View>
          <Button title="Edit" onPress={handleEdit} variant="primary" />
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
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Pets Section */}
        <SectionHeader
          title={`Pets (${guidePets.length})`}
          icon="🐾"
          rightAction={{
            label: 'Edit Pets',
            onPress: handleEdit,
          }}
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
          rightAction={{
            label: 'Edit',
            onPress: handleEdit,
          }}
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
          rightAction={{
            label: 'Edit',
            onPress: handleEdit,
          }}
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
          <Button title="🔗 Share Guide" onPress={handleShare} variant="outline" />
          <Button title="📄 Export as PDF" onPress={handleExportPDF} variant="outline" />
          <Button title="📋 Duplicate Guide" onPress={handleDuplicate} variant="secondary" />
          <Button title="🗑️ Delete Guide" onPress={handleDelete} variant="outline" />
        </View>
      </ScrollView>
    </View>
  );
}
