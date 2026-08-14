import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { showAlert } from '../lib/showAlert';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, PetCard, ScreenContainer } from '../components';
import { COLORS } from '../constants';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');
import { useAuth, useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const {
    activePets,
    guides,
    loadingPets,
    loadingGuides,
    settings,
    loadingSettings,
    pendingInvites,
    respondToInvite,
    refreshHouseholds,
  } = useData();

  // Re-check pending invites whenever Home regains focus: sessions persist for
  // days (PWA-first), so without this an already-signed-in invitee would never
  // see the invite banner until a full reload. refreshHouseholds is cheap and
  // also reloads the household list itself.
  useFocusEffect(
    useCallback(() => {
      refreshHouseholds();
    }, [refreshHouseholds])
  );

  // Invite id currently being accepted/declined (disables that banner's buttons)
  const [respondingInvite, setRespondingInvite] = useState<{
    id: string;
    accept: boolean;
  } | null>(null);

  // Prefer a real name; otherwise derive something human from the address.
  // Plain email.split('@')[0] surfaces plus-addressing and dots verbatim
  // ("tcdain+qapaws", "first.last"), which reads like a bug to the user.
  const displayName = (() => {
    const fullName = user?.full_name?.trim();
    if (fullName) return fullName.split(' ')[0];
    const local = user?.email?.split('@')[0];
    if (!local) return '';
    const base = local.split('+')[0].replace(/[._-]+/g, ' ').trim();
    if (!base) return '';
    return base.charAt(0).toUpperCase() + base.slice(1);
  })();

  // Check if onboarding is needed
  useEffect(() => {
    if (!loadingSettings && settings && !settings.onboarding_completed) {
      navigation.replace('Onboarding');
    }
  }, [loadingSettings, settings, navigation]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to sign out');
    }
  };

  const navigateToPets = () => {
    navigation.navigate('Pets');
  };

  const navigateToGuides = () => {
    navigation.navigate('Guides');
  };

  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  const handleInviteResponse = async (inviteId: string, accept: boolean) => {
    setRespondingInvite({ id: inviteId, accept });
    try {
      // On accept the context refreshes households, pets, and guides itself,
      // so the new household's data appears without extra calls here.
      await respondToInvite(inviteId, accept);
    } catch (error: any) {
      // Map the raw server errors for a revoked/already-answered invite to
      // friendlier copy; the context has already refreshed pendingInvites, so
      // the stale banner is gone by the time this alert shows.
      const raw: string = error?.message || '';
      const message = /invite is not pending|invite not found/i.test(raw)
        ? 'This invitation is no longer available.'
        : raw || 'Could not respond to the invitation.';
      showAlert('Error', message);
    } finally {
      setRespondingInvite(null);
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="wide">
        {/* flex-wrap + shrinkable children: the fixed-size logo/wordmark row
            previously forced ~437px of intrinsic width, so a 375px phone
            rendered the header clipped with Settings off-screen. */}
        <View className="flex-row justify-between items-center flex-wrap gap-y-2">
          <View className="flex-row items-center shrink" style={{ minWidth: 0 }}>
            <Image
              source={logo}
              style={{ width: 72, height: 72, marginRight: 10 }}
              resizeMode="contain"
            />
            <View className="shrink" style={{ minWidth: 0 }}>
              <Image
                source={wordmark}
                style={{ width: 160, height: 33 }}
                resizeMode="contain"
                accessibilityLabel="Pawstructions"
              />
              <Text style={{ fontSize: 11, color: COLORS.primary, fontStyle: 'italic', marginTop: 4 }}>
                Where Pets Rule the Kingdom!
              </Text>
            </View>
          </View>
          <View className="items-end shrink">
            <Button
              title="Settings"
              onPress={navigateToSettings}
              variant="secondary"
            />
            <Text style={{ fontSize: 12, color: COLORS.tan, marginTop: 4 }}>
              Welcome{displayName ? `, ${displayName}` : ''}!
            </Text>
          </View>
        </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="wide">
        {/* Pending household invites */}
        {pendingInvites.map((invite) => {
          const isResponding = respondingInvite?.id === invite.id;
          return (
            <Card key={invite.id} className="mb-4 bg-primary-50 border-primary-200">
              <Text className="text-brown-800 font-semibold mb-1">
                Household invitation
              </Text>
              <Text className="text-brown-600 mb-3">
                {`You've been invited to ${invite.household_name}${
                  invite.invited_by_email ? ` by ${invite.invited_by_email}` : ''
                }.`}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    title="Accept"
                    onPress={() => handleInviteResponse(invite.id, true)}
                    loading={isResponding && respondingInvite?.accept === true}
                    disabled={isResponding}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title="Decline"
                    variant="outline"
                    onPress={() => handleInviteResponse(invite.id, false)}
                    loading={isResponding && respondingInvite?.accept === false}
                    disabled={isResponding}
                  />
                </View>
              </View>
            </Card>
          );
        })}

        {/* Quick Stats */}
        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingPets ? '...' : activePets.length}
            </Text>
            <Text className="text-tan-500">Pets</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingGuides ? '...' : guides.length}
            </Text>
            <Text className="text-tan-500">Guides</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <Card className="mb-6">
          <Text className="text-lg font-semibold text-brown-800 mb-4">
            Quick Actions
          </Text>
          <View className="gap-3">
            {activePets.length > 0 && (
              <Button
                title="✈️ Quick Trip Setup"
                onPress={() => navigation.navigate('TripWizard')}
                variant="primary"
              />
            )}
            <Button
              title="Manage Pets"
              onPress={navigateToPets}
              variant={activePets.length > 0 ? 'outline' : 'primary'}
            />
            <Button
              title="View Guides"
              onPress={navigateToGuides}
              variant="outline"
            />
          </View>
        </Card>

        {/* Recent Pets */}
        {activePets.length > 0 && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-brown-800">
                Your Pets
              </Text>
              <Button
                title="See All →"
                onPress={navigateToPets}
                variant="outline"
              />
            </View>
            {activePets.slice(0, 3).map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                onPress={() => navigation.navigate('PetDetail', { petId: pet.id })}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {activePets.length === 0 && !loadingPets && (
          <Card className="mb-6">
            <View className="items-center py-8">
              <Text className="text-5xl mb-4">🐾</Text>
              <Text className="text-xl font-semibold text-brown-800 mb-2">
                Get Started
              </Text>
              <Text className="text-tan-500 text-center mb-4">
                Add your first pet to start creating care guides for your pet sitters.
              </Text>
              <Button
                title="Add Your First Pet"
                onPress={() => navigation.navigate('PetForm', { mode: 'create' })}
                variant="primary"
              />
            </View>
          </Card>
        )}

        {/* Sign Out */}
        <View className="mt-4">
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="secondary"
          />
        </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
