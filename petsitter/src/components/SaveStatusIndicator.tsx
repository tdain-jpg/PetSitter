import { View, Text, Platform, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants';
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

  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          backgroundColor: status === 'error' ? COLORS.accentLight : COLORS.creamDark,
          borderRadius: 8,
          fontSize: 14,
        }}
      >
        {status === 'saving' && (
          <>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                animation: 'pulse 1s infinite',
              }}
            />
            <span style={{ color: '#92400e' }}>Saving...</span>
          </>
        )}

        {status === 'saved' && (
          <>
            <span style={{ color: COLORS.primary, fontSize: 16 }}>&#10003;</span>
            <span style={{ color: COLORS.primaryDark }}>Saved</span>
            {lastSaved && (
              <span style={{ color: COLORS.tanLight, fontSize: 12 }}>
                at {formatTime(lastSaved)}
              </span>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <span style={{ color: COLORS.accent, fontSize: 16 }}>&#10007;</span>
            <span style={{ color: COLORS.accent }}>{error || 'Save failed'}</span>
          </>
        )}

        {status === 'idle' && lastSaved && (
          <span style={{ color: COLORS.tanLight }}>
            Last saved at {formatTime(lastSaved)}
          </span>
        )}
      </div>
    );
  }

  // Native implementation
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
