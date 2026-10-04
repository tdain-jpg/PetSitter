import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, ScreenContainer, ScreenHeader, SecurityNote } from '../components';
import { useData } from '../contexts';
import { dataService, generateId } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { vetContactsFromPets } from '../lib/homeDetails';
import { isValidPhoneNumber } from '../utils';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { EmergencyContact, HomeInfo, HomeOwner } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'HomeDetails'>;

/**
 * Home details: the household facts every guide repeats, entered once.
 *
 * Saved per household (0032) and copied into each NEW guide, where they can be
 * changed for that one trip. Editing here never reaches back into guides that
 * already exist: a sitter holding last month's guide keeps exactly what they
 * were given.
 */

const HOME_FIELDS: { key: keyof HomeInfo; label: string; placeholder: string }[] = [
  { key: 'address', label: 'Address', placeholder: '123 Main Street, City, State' },
  { key: 'wifi_name', label: 'WiFi Network', placeholder: 'Network name' },
  { key: 'wifi_password', label: 'WiFi Password', placeholder: 'Password' },
  { key: 'door_code', label: 'Door Code', placeholder: 'Entry code' },
  { key: 'alarm_code', label: 'Alarm Code', placeholder: 'Alarm disarm code' },
  { key: 'garage_code', label: 'Garage Code', placeholder: 'Garage code' },
  { key: 'gate_code', label: 'Gate Code', placeholder: 'Gate code' },
  { key: 'mailbox_code', label: 'Mailbox Code', placeholder: 'Mailbox code' },
  { key: 'spare_key_location', label: 'Spare Key Location', placeholder: 'e.g., Under the mat, With neighbor' },
  { key: 'parking_info', label: 'Parking', placeholder: 'e.g., Driveway, left side' },
  { key: 'trash_day', label: 'Trash Day', placeholder: 'e.g., Tuesday' },
];

const blankOwner = (): HomeOwner => ({ name: '', phone: '', email: '' });
const blankContact = (): EmergencyContact => ({
  id: generateId(),
  name: '',
  phone: '',
  relationship: '',
  contact_type: 'personal',
  is_primary: false,
});

export function HomeDetailsScreen({ navigation }: Props) {
  const { primaryHouseholdId, households, pets } = useData();
  const householdName = households.find((h) => h.id === primaryHouseholdId)?.name ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [owners, setOwners] = useState<HomeOwner[]>([blankOwner()]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [homeInfo, setHomeInfo] = useState<HomeInfo>({});

  useEffect(() => {
    if (!primaryHouseholdId) return;
    let cancelled = false;
    setLoading(true);
    dataService
      .getHomeDetails(primaryHouseholdId)
      .then((details) => {
        if (cancelled || !details) return;
        setOwners(details.owners.length > 0 ? details.owners : [blankOwner()]);
        setContacts(details.emergency_contacts);
        setHomeInfo(details.home_info);
      })
      .catch((error) => {
        if (!cancelled) showAlert("Couldn't load your home details", friendlyError(error, 'Please try again.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryHouseholdId]);

  const householdPets = useMemo(
    () => pets.filter((p) => p.household_id === primaryHouseholdId),
    [pets, primaryHouseholdId]
  );
  const vetSuggestions = useMemo(
    () => vetContactsFromPets(householdPets, contacts),
    [householdPets, contacts]
  );

  const setOwner = (i: number, patch: Partial<HomeOwner>) =>
    setOwners((prev) => prev.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const setContact = (id: string, patch: Partial<EmergencyContact>) =>
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const save = useCallback(async () => {
    if (!primaryHouseholdId) return;
    const cleanOwners = owners
      .map((o) => ({ name: o.name.trim(), phone: o.phone.trim(), email: o.email?.trim() || undefined }))
      .filter((o) => o.name || o.phone);
    const cleanContacts = contacts
      .map((c) => ({ ...c, name: c.name.trim(), phone: c.phone.trim(), relationship: c.relationship.trim() }))
      .filter((c) => c.name || c.phone);
    const badPhone = [...cleanOwners, ...cleanContacts].find((p) => p.phone && !isValidPhoneNumber(p.phone));
    if (badPhone) {
      showAlert('Check that phone number', `${badPhone.name || 'One of the numbers'} doesn't look like a phone number.`);
      return;
    }
    const cleanInfo: HomeInfo = {};
    for (const [k, v] of Object.entries(homeInfo)) {
      if (typeof v === 'string' && v.trim()) (cleanInfo as Record<string, string>)[k] = v.trim();
    }
    setSaving(true);
    try {
      await dataService.saveHomeDetails(primaryHouseholdId, {
        owners: cleanOwners,
        emergency_contacts: cleanContacts,
        home_info: cleanInfo,
      });
      await showAlert('Saved', 'New guides will start with these details.');
      navigation.goBack();
    } catch (error) {
      showAlert("Couldn't save", friendlyError(error, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  }, [primaryHouseholdId, owners, contacts, homeInfo, navigation]);

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Home details" width="form" />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <ScreenContainer variant="form" className="p-4">
          <Text className="text-tan-600 mb-4 leading-6">
            Fill this in once{householdName ? ` for ${householdName}` : ''}. Every new guide starts
            with it, and you can still change anything for a single trip. Guides you have
            already made stay as they are.
          </Text>

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Who to call first</Text>
                <Text className="text-tan-500 text-sm mb-3">
                  You, and anyone else in your home. These go at the top of every guide.
                </Text>
                {owners.map((o, i) => (
                  <View key={i} className={i > 0 ? 'border-t border-tan-200 pt-3 mt-1' : ''}>
                    <Input
                      label="Name"
                      placeholder="e.g., Tim Dain"
                      value={o.name}
                      onChangeText={(v) => setOwner(i, { name: v })}
                      autoCapitalize="words"
                    />
                    <Input
                      label="Phone"
                      placeholder="(555) 123-4567"
                      value={o.phone}
                      onChangeText={(v) => setOwner(i, { phone: v })}
                      keyboardType="phone-pad"
                      formatAsPhone
                    />
                    <Input
                      label="Email (optional)"
                      placeholder="name@example.com"
                      value={o.email ?? ''}
                      onChangeText={(v) => setOwner(i, { email: v })}
                      keyboardType="email-address"
                    />
                    {owners.length > 1 ? (
                      <Button
                        title="Remove this person"
                        onPress={() => setOwners((prev) => prev.filter((_, k) => k !== i))}
                        variant="outline"
                      />
                    ) : null}
                  </View>
                ))}
                <View className="mt-3">
                  <Button
                    title="+ Add another person"
                    onPress={() => setOwners((prev) => [...prev, blankOwner()])}
                    variant="outline"
                  />
                </View>
              </Card>

              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Your home</Text>
                <SecurityNote context="entry" />
                {HOME_FIELDS.map((f) => (
                  <Input
                    key={f.key}
                    label={f.label}
                    placeholder={f.placeholder}
                    value={(homeInfo[f.key] as string | undefined) ?? ''}
                    onChangeText={(v) => setHomeInfo((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ))}
              </Card>

              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Emergency contacts</Text>
                <Text className="text-tan-500 text-sm mb-3">
                  A neighbor with a key, a relative nearby, your vet.
                </Text>

                {vetSuggestions.length > 0 ? (
                  <Pressable
                    onPress={() => setContacts((prev) => [...prev, ...vetSuggestions])}
                    className="bg-primary-50 border border-primary-200 rounded px-3 mb-3"
                    accessibilityRole="button"
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text className="text-primary-700 text-sm">
                      {vetSuggestions.length === 1
                        ? `+ Add ${vetSuggestions[0].name || 'your vet'} from your pet records`
                        : `+ Add ${vetSuggestions.length} vets from your pet records`}
                    </Text>
                  </Pressable>
                ) : null}

                {contacts.map((c, i) => (
                  <View key={c.id} className={i > 0 ? 'border-t border-tan-200 pt-3 mt-1' : ''}>
                    <Input
                      label="Name"
                      placeholder="e.g., Pat (neighbor)"
                      value={c.name}
                      onChangeText={(v) => setContact(c.id, { name: v })}
                      autoCapitalize="words"
                    />
                    <Input
                      label="Phone"
                      placeholder="(555) 123-4567"
                      value={c.phone}
                      onChangeText={(v) => setContact(c.id, { phone: v })}
                      keyboardType="phone-pad"
                      formatAsPhone
                    />
                    <Input
                      label="Relationship"
                      placeholder="e.g., Neighbor, has a key"
                      value={c.relationship}
                      onChangeText={(v) => setContact(c.id, { relationship: v })}
                      autoCapitalize="sentences"
                    />
                    <Button
                      title="Remove this contact"
                      onPress={() => setContacts((prev) => prev.filter((x) => x.id !== c.id))}
                      variant="outline"
                    />
                  </View>
                ))}
                <View className="mt-3">
                  <Button
                    title="+ Add a contact"
                    onPress={() => setContacts((prev) => [...prev, blankContact()])}
                    variant="outline"
                  />
                </View>
              </Card>

              <View className="mb-10">
                <Button
                  title={saving ? 'Saving…' : 'Save home details'}
                  onPress={save}
                  disabled={saving || !primaryHouseholdId}
                />
              </View>
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
