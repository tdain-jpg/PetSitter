import { View, Text, ActivityIndicator } from 'react-native';
import type { SaveStatus } from '../hooks';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSaved: Date | null;
  error?: string | null;
}

export function SaveStatusIndicator({
  status,
  lastSaved,
  error,
}: SaveStatusIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <View
      className={`flex-row items-center px-4 py-2 rounded-lg ${
        status === 'error' ? 'bg-accent-50' : 'bg-cream-200'
      }`}
    >
      {status === 'saving' && (
        <>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text className="ml-2 text-amber-700">Saving...</Text>
        </>
      )}

      {status === 'saved' && (
        <>
          <Text className="text-primary-600 text-base">&#10003;</Text>
          <Text className="ml-2 text-primary-700">Saved</Text>
          {lastSaved && (
            <Text className="ml-2 text-tan-400 text-xs">
              at {formatTime(lastSaved)}
            </Text>
          )}
        </>
      )}

      {status === 'error' && (
        <>
          <Text className="text-accent-600 text-base">&#10007;</Text>
          <Text className="ml-2 text-accent-600">{error || 'Save failed'}</Text>
        </>
      )}

      {status === 'idle' && lastSaved && (
        <Text className="text-tan-400">Last saved at {formatTime(lastSaved)}</Text>
      )}
    </View>
  );
}
