import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, SectionHeader, ContactCard, SensitiveValue, ScreenContainer, Icon, speciesIconName } from '../components';
import { friendlyError } from '../lib/errors';

// @ts-ignore
const wordmark = require('../../assets/wordmark.png');
import { useData } from '../contexts';
import { COLORS } from '../constants';
import { formatDate } from '../lib/dates';
import { displayablePhotoUrl } from '../lib/petPhotos';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SharedGuideView'>;

export function SharedGuideViewScreen({ navigation, route }: Props) {
  const { code } = route.params;
  const { getSharedGuideBundle } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Direct share-link visitors (the primary audience) land here as the only
  // screen in the stack, where goBack() would be a dead button.
  const canGoBack = navigation.canGoBack();

  useEffect(() => {
    loadSharedGuide();
  }, [code]);

  const loadSharedGuide = async () => {
    setLoading(true);
    setError(null);
    try {
      // Single RPC call for guide + pets — resolve_share increments the
      // link's view_count per invocation, so this must not be two calls.
      const bundle = await getSharedGuideBundle(code);

      if (!bundle) {
        setError('This share link is invalid or has expired.');
        return;
      }

      setGuide(bundle.guide);
      setGuidePets(bundle.pets);
    } catch (err: any) {
      setError(friendlyError(err, 'Failed to load shared guide.'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text className="text-tan-500 mt-4">Loading shared guide...</Text>
      </View>
    );
  }

  if (error || !guide) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200 px-6">
        <Text className="text-5xl mb-4">🔗</Text>
        <Text className="text-xl text-brown-800 font-semibold text-center mb-2">
          Link Not Available
        </Text>
        <Text className="text-tan-500 text-center mb-6">
          {error || 'This share link is invalid or has expired.'}
        </Text>
        {canGoBack ? (
          <Button
            title="Go Back"
            onPress={() => navigation.goBack()}
            variant="outline"
          />
        ) : (
          <Image
            source={wordmark}
            style={{ width: 170, height: 35 }}
            resizeMode="contain"
            accessibilityLabel="Pawstructions"
          />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Read-Only Banner */}
      <View
        style={{ backgroundColor: COLORS.secondary }}
        className="px-4 pt-12 pb-3"
      >
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-center">
            <Text className="text-white font-medium">
              👁️ Read-Only View
            </Text>
          </View>
        </ScreenContainer>
      </View>

      {/* Header */}
      <View className="bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center px-4 py-3">
            {canGoBack ? (
              <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            ) : (
              <Image
                source={wordmark}
                style={{ width: 170, height: 35 }}
                resizeMode="contain"
                accessibilityLabel="Pawstructions"
              />
            )}
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
          {/* Privacy Notice */}
          <Card className="mb-4 bg-primary-50 border-primary-200">
            <View className="flex-row items-start">
              <Text className="text-2xl mr-3">🔒</Text>
              <View className="flex-1">
                <Text className="text-brown-800 font-medium mb-1">Shared Guide</Text>
                <Text className="text-tan-600 text-sm">
                  This guide has been shared with you for viewing. Some sensitive information
                  may be included. Please handle this information responsibly.
                </Text>
                <Text className="text-tan-600 text-sm mt-2">
                  Codes and passwords stay hidden until you tap to reveal them, and the owner
                  can turn this link off at any time.
                </Text>
              </View>
            </View>
          </Card>

          {/* Pets Section */}
          <SectionHeader title={`Pets (${guidePets.length})`} icon="🐾">
            {guidePets.length === 0 ? (
              <Text className="text-tan-500">No pets in this guide.</Text>
            ) : (
              guidePets.map((pet) => (
                <Card key={pet.id} className="mb-3">
                  <View className="flex-row items-center">
                    {displayablePhotoUrl(pet.photo_url) ? (
                      <View
                        className="w-16 h-16 rounded-full bg-tan-200 mr-4 overflow-hidden"
                      >
                        <Image
                          source={{ uri: displayablePhotoUrl(pet.photo_url)! }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View className="w-16 h-16 rounded-full bg-primary-100 items-center justify-center mr-4">
                        <Icon name={speciesIconName(pet.species)} size={40} />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-brown-800">{pet.name}</Text>
                      <Text className="text-tan-500 capitalize">{pet.species}</Text>
                      {pet.breed && <Text className="text-tan-400 text-sm">{pet.breed}</Text>}
                    </View>
                  </View>

                  {/* Pet Details */}
                  {(pet.age != null || pet.weight != null) && (
                    <View className="flex-row mt-3 gap-4">
                      {pet.age != null && (
                        <Text className="text-tan-600">Age: {pet.age} years</Text>
                      )}
                      {pet.weight != null && (
                        <Text className="text-tan-600">
                          Weight: {pet.weight} {pet.weight_unit}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Feeding Schedule */}
                  {pet.feeding_schedule.length > 0 && (
                    <View className="mt-3 pt-3 border-t border-tan-200">
                      <Text className="text-brown-700 font-medium mb-2">Feeding Schedule</Text>
                      {pet.feeding_schedule.map((schedule, idx) => (
                        <View key={idx} className="flex-row mb-1">
                          <Text className="text-tan-500 w-20">{schedule.time}</Text>
                          <Text className="text-brown-600 flex-1">
                            {schedule.food_type} - {schedule.amount}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Medications */}
                  {pet.medications.length > 0 && (
                    <View className="mt-3 pt-3 border-t border-tan-200">
                      <Text className="text-brown-700 font-medium mb-2">Medications</Text>
                      {pet.medications.map((med, idx) => (
                        <View key={idx} className="mb-2">
                          <Text className="text-brown-600 font-medium">{med.name}</Text>
                          <Text className="text-tan-500 text-sm">
                            {med.dosage} - {med.frequency}
                            {med.with_food ? ' (with food)' : ''}
                          </Text>
                          {med.times && med.times.filter(Boolean).length > 0 && (
                            <Text className="text-tan-500 text-sm">
                              ⏰ {med.times.filter(Boolean).join(', ')}
                            </Text>
                          )}
                          {med.notes && (
                            <Text className="text-tan-500 text-sm">{med.notes}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Medical Notes */}
                  {pet.medical_notes && (
                    <View className="mt-3 pt-3 border-t border-tan-200">
                      <Text className="text-brown-700 font-medium mb-1">Medical Notes</Text>
                      <Text className="text-tan-600">{pet.medical_notes}</Text>
                    </View>
                  )}

                  {/* Special Instructions */}
                  {pet.special_instructions && (
                    <View className="mt-3 pt-3 border-t border-tan-200">
                      <Text className="text-brown-700 font-medium mb-1">Special Instructions</Text>
                      <Text className="text-tan-600">{pet.special_instructions}</Text>
                    </View>
                  )}

                  {/* Vet Info */}
                  {pet.vet_info && (
                    <View className="mt-3 pt-3 border-t border-tan-200">
                      <Text className="text-brown-700 font-medium mb-2">Veterinarian</Text>
                      {pet.vet_info.name && (
                        <Text className="text-brown-600">{pet.vet_info.name}</Text>
                      )}
                      {pet.vet_info.clinic && (
                        <Text className="text-tan-500">{pet.vet_info.clinic}</Text>
                      )}
                      {pet.vet_info.phone && (
                        <Text className="text-secondary-600">{pet.vet_info.phone}</Text>
                      )}
                    </View>
                  )}
                </Card>
              ))
            )}
          </SectionHeader>

          {/* Emergency Contacts */}
          <SectionHeader title={`Emergency Contacts (${guide.emergency_contacts.length})`} icon="🚨">
            {guide.emergency_contacts.length === 0 ? (
              <Text className="text-tan-500">No emergency contacts added.</Text>
            ) : (
              guide.emergency_contacts.map((contact) => (
                <ContactCard key={contact.id} contact={contact} readOnly />
              ))
            )}
          </SectionHeader>

          {/* Home Info */}
          <SectionHeader title="Home Information" icon="🏠">
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

          {/* Footer */}
          <View className="items-center py-8 mb-8">
            <Text className="text-tan-400 text-sm text-center">
              Shared via Pawstructions
            </Text>
            <Text className="text-tan-300 text-xs mt-1">
              pawstructions.com
            </Text>
          </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
