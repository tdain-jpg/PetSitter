import { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Feedback'>;

/**
 * Send feedback, stored (0041) so it lands in the admin page's inbox, and
 * emailed to support@ as well. It used to be a mailto link, which did nothing
 * at all for the many people with no mail app set up, and left nothing to
 * read back, count or mark done.
 */
export function FeedbackScreen({ navigation, route }: Props) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const from = route.params?.from;

  const send = async () => {
    const text = message.trim();
    if (!text) {
      showAlert('Write something first', 'Tell us what is working, what is not, or what you would add.');
      return;
    }
    setSending(true);
    try {
      await dataService.sendFeedback(text.slice(0, 5000), { screen: from });
      setMessage('');
      await showAlert('Thank you', 'A person reads every message. If you asked something, we will reply by email.');
      navigation.goBack();
    } catch (error) {
      showAlert("Couldn't send", friendlyError(error, 'Please try again, or email support@pawstructions.com.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Send feedback" width="form" />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <ScreenContainer variant="form" className="p-4">
          <Card className="mb-4">
            <Text className="text-brown-700 mb-3 leading-6">
              Something broken, confusing, or missing? Tell us. A person reads every message.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="What's working, what isn't, and what would you add?"
              placeholderTextColor={COLORS.tan}
              multiline
              numberOfLines={8}
              maxLength={5000}
              accessibilityLabel="Your feedback"
              style={{ minHeight: 160, textAlignVertical: 'top' }}
              className="border border-tan-200 rounded-lg p-3 text-brown-800 bg-cream-50"
            />
            <Text className="text-tan-500 text-xs mt-1 text-right">{message.length} / 5000</Text>
          </Card>
          <Button title={sending ? 'Sending…' : 'Send feedback'} onPress={send} disabled={sending} />
          <Text className="text-tan-500 text-sm text-center mt-4 mb-10" selectable>
            Or email support@pawstructions.com
          </Text>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
