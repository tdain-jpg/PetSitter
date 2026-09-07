import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { SitterSection } from '../components/SitterSection';
import { useAuth, useData } from '../contexts';
import { COLORS } from '../constants';
import { friendlyError } from '../lib/errors';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Household } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'Sitters'>;

/**
 * A front door for inviting and managing PET SITTERS.
 *
 * This lived inside the Household screen next to family invites, and the Quick
 * Action subtitles made the conflation obvious: one button offered two things
 * that are not alike. Family membership grants everything, permanently. A
 * sitter connection is read-only, revocable, and covers only what the owner
 * shares. Two trust levels behind one door is how somebody hands out the wrong
 * one.
 */
export function SittersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { households, householdsLoading, getHouseholdMembers } = useData();
  const [ownedHouseholds, setOwnedHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadOwnedHouseholds = async () => {
      if (!households || !user) {
        setLoading(false);
        return;
      }

      try {
        const owned = await Promise.all(
          households.map(async (h) => {
            const members = await getHouseholdMembers(h.id);
            const isOwner = members.some(
              (m) => m.user_id === user.id && m.role === 'owner'
            );
            return isOwner ? h : null;
          })
        );

        const filtered = owned.filter(Boolean) as Household[];
        if (!cancelled) {
          setOwnedHouseholds(filtered);
        }
      } catch (err) {
        if (!cancelled) {
          showAlert('Error', friendlyError(err, "Couldn't load your households."));
          setOwnedHouseholds([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadOwnedHouseholds();

    return () => {
      cancelled = true;
    };
  }, [households, user, getHouseholdMembers]);

  if (loading || householdsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Pet Sitters" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
      >
        <ScreenContainer variant="content">
          <Card className="mb-6">
            <Text className="text-lg font-semibold text-brown-800 mb-2">
              A sitter is not a family member
            </Text>
            <Text className="text-tan-500">
              A sitter can read the pets and guides you share and tick off today&apos;s tasks, 
              and can change nothing. You can remove their access at any time.
            </Text>
            <Text className="text-tan-500 mt-2">
              If you want to add a partner or housemate who gets full access instead, 
              go to the Household screen.
            </Text>
          </Card>

          {ownedHouseholds.length === 0 ? (
            <Card className="mb-6">
              <Text className="text-4xl text-center">🐾</Text>
              <Text className="text-lg font-semibold text-brown-800 mb-2 text-center">
                Only an owner can invite a sitter
              </Text>
              <Text className="text-tan-500 mb-4 text-center">
                You are a member of a household but not its owner, so the owner needs to 
                send sitter invitations.
              </Text>
              <Button
                title="Go to Household"
                onPress={() => navigation.navigate('Household')}
              />
            </Card>
          ) : (
            ownedHouseholds.map((h) => (
              <View key={h.id} className="mb-6">
                {ownedHouseholds.length > 1 && (
                  <Text className="text-lg font-semibold text-brown-800 mb-2">
                    {h.name}
                  </Text>
                )}
                <SitterSection householdId={h.id} isOwner />
              </View>
            ))
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
