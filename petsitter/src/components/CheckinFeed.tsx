import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { useData } from '../contexts';
import { Checkin } from '../types';

interface CheckinFeedProps {
  householdId: string;
  /** Hides the composer when false. Read-only viewers still see the feed. */
  canPost?: boolean;
}

export function CheckinFeed({ householdId, canPost = true }: CheckinFeedProps) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [posting, setPosting] = useState(false);
  const { getCheckins, addCheckin, deleteCheckin } = useData();

  useEffect(() => {
    loadCheckins();
  }, [householdId]);

  const loadCheckins = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCheckins(householdId);
      setCheckins(data);
    } catch (err) {
      setError('Could not load updates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newNote.trim()) {
      showAlert('Add a note', 'Please write something to share.');
      return;
    }

    try {
      setPosting(true);
      await addCheckin({
        householdId,
        note: newNote.trim(),
        guideId: null
      });
      setNewNote('');
      await loadCheckins();
    } catch (err) {
      showAlert('Could not post', (err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Delete this update?',
      message: 'It will disappear for everyone in the household.',
      confirmLabel: 'Delete',
      destructive: true
    });

    if (!confirmed) return;

    try {
      await deleteCheckin(id);
      await loadCheckins();
    } catch (err) {
      showAlert('Could not delete', (err as Error).message);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'yesterday';

    return date.toLocaleDateString();
  };

  if (error) {
    return (
      <View className="p-4">
        <Text className="text-gray-700">{error}</Text>
        <View className="mt-2">
          <Button title="Try again" onPress={loadCheckins} />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="p-4">
        <Text className="text-gray-500">Loading updates...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {canPost && (
        <Card className="mb-4 p-4">
          <Input
            value={newNote}
            onChangeText={setNewNote}
            placeholder="Fed Clark, all good"
            label="Add an update"
            multiline
            numberOfLines={3}
          />
          <View className="mt-2">
            <Button
              title="Post update"
              onPress={handlePost}
              loading={posting}
              disabled={posting}
            />
          </View>
        </Card>
      )}

      {checkins.length === 0 ? (
        <Text className="p-4 text-gray-500">
          {canPost 
            ? "No updates yet. Post one to let the household know how things are going." 
            : "No updates yet."}
        </Text>
      ) : (
        checkins.map(checkin => (
          <Card key={checkin.id} className="mb-3 p-4">
            <Text className="text-gray-800">{checkin.note}</Text>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-xs text-gray-500">
                {/* is_mine FIRST: seeing your own address quoted back at you
                    reads like somebody else wrote it. */}
                {checkin.is_mine
                  ? 'You'
                  : checkin.author_email
                  ? checkin.author_email
                  : checkin.is_mine 
                    ? 'You' 
                    : 'Someone in this household'}
                {' '}
                • {formatTime(checkin.created_at)}
              </Text>
              {checkin.is_mine && (
                <Button
                  title="Delete"
                  onPress={() => handleDelete(checkin.id)}
                  variant="outline"
                />
              )}
            </View>
          </Card>
        ))
      )}
    </View>
  );
}
