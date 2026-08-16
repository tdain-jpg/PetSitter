import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useData } from '../contexts';
import { Button, Card, ScreenContainer } from '../components';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { Icon } from '../components/Icon';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { SitterConnection } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SitterHome'>;

export function SitterHomeScreen({ navigation }: Props) {
  const {
    sitterConnections,
    loadingSitterConnections,
    sitterConnectionsError,
    refreshSitterConnections,
    respondToSitterInvite
  } = useData();
  
  const [pendingInvites, setPendingInvites] = useState<SitterConnection[]>([]);
  const [activeClients, setActiveClients] = useState<SitterConnection[]>([]);
  const [loadingResponse, setLoadingResponse] = useState<string | null>(null);

  // Separate connections into pending and active
  React.useEffect(() => {
    const invites = sitterConnections.filter(c => c.status === 'invited');
    const clients = sitterConnections.filter(c => c.status === 'active');
    setPendingInvites(invites);
    setActiveClients(clients);
  }, [sitterConnections]);

  useFocusEffect(
    useCallback(() => {
      void refreshSitterConnections();
    }, [refreshSitterConnections])
  );

  const handleAccept = async (id: string) => {
    setLoadingResponse(id);
    try {
      const success = await respondToSitterInvite(id, true);
      if (success) {
        await refreshSitterConnections();
      } else {
        showAlert('Could not accept', 'Please try again later.');
      }
    } catch (error: any) {
      showAlert('Could not respond', error.message || 'An unknown error occurred');
    } finally {
      setLoadingResponse(null);
    }
  };

  const handleDecline = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Decline invitation?',
      message: 'You can be invited again later.',
      confirmLabel: 'Decline'
    });
    
    if (!confirmed) return;
    
    setLoadingResponse(id);
    try {
      const success = await respondToSitterInvite(id, false);
      if (success) {
        await refreshSitterConnections();
      } else {
        showAlert('Could not decline', 'Please try again later.');
      }
    } catch (error: any) {
      showAlert('Could not respond', error.message || 'An unknown error occurred');
    } finally {
      setLoadingResponse(null);
    }
  };

  const renderPendingInvite = (invite: SitterConnection) => (
    <Card key={invite.id} className="mb-4 bg-warm-50 border border-warm-300">
      <View className="p-4">
        <Text className="text-brown-800 font-semibold">{invite.household_name}</Text>
        <View className="flex-row justify-end mt-3 space-x-2">
          <Button
            title="Accept"
            onPress={() => handleAccept(invite.id)}
            variant="primary"
            disabled={loadingResponse === invite.id}
          />
          <Button
            title="Decline"
            onPress={() => handleDecline(invite.id)}
            variant="outline"
            disabled={loadingResponse === invite.id}
          />
        </View>
      </View>
    </Card>
  );

  const renderActiveClient = (client: SitterConnection) => {
    let accessText = 'Ongoing access';
    if (client.ends_on) {
      accessText = `Until ${formatDate(client.ends_on)}`;
    } else if (client.starts_on) {
      accessText = `From ${formatDate(client.starts_on)}`;
    }

    return (
      <Pressable
        key={client.id}
        onPress={() => navigation.navigate('SitterHousehold', {
          householdId: client.household_id,
          householdName: client.household_name
        })}
        className="mb-4"
      >
        <Card>
          <View className="p-4">
            <Text className="text-lg font-semibold text-brown-800">{client.household_name}</Text>
            <Text className="text-tan-500 mt-1">{accessText}</Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <Card className="py-12 items-center justify-center">
      <Icon name="paw" size={48} />
      <Text className="text-xl font-semibold text-brown-800 mt-4">No clients yet</Text>
      <Text className="text-tan-500 text-center mt-2 px-4">
        When an owner invites you to care for their pets, the invitation will appear here.
      </Text>
    </Card>
  );

  const renderError = () => (
    <Card className="py-6">
      <Text className="text-center text-brown-800">{sitterConnectionsError}</Text>
      <View className="mt-4">
        <Button title="Try Again" onPress={refreshSitterConnections} variant="primary" />
      </View>
    </Card>
  );

  const renderContent = () => {
    if (loadingSitterConnections && sitterConnections.length === 0) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (sitterConnectionsError) {
      return renderError();
    }

    if (pendingInvites.length === 0 && activeClients.length === 0) {
      return renderEmptyState();
    }

    return (
      <>
        {pendingInvites.map(renderPendingInvite)}
        {activeClients.map(renderActiveClient)}
      </>
    );
  };

  const clientCount = activeClients.length;
  const subtitle = clientCount === 0
    ? 'No clients yet'
    : clientCount === 1
      ? '1 household'
      : `${clientCount} households`;

  return (
    <View className="flex-1 bg-cream-200">
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">My Clients</Text>
            <Text className="text-tan-500">{subtitle}</Text>
          </View>
        </ScreenContainer>
      </View>
      <ScrollView className="flex-1">
        <ScreenContainer variant="content" className="py-4">
          {renderContent()}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
