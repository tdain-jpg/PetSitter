import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Admin'>;

/**
 * The admin page (0041). Tim only: every number here comes from an admin_*
 * function that refuses anyone not in public.admins, so this screen being
 * reachable by URL shows a stranger nothing but an error.
 *
 * Money totals live in Stripe, which is the record for revenue (every
 * discount and comp is issued there). This page shows who is paying and
 * everything Stripe cannot: who signed up, from where, what they use, and
 * what they said.
 */
type Tab = 'overview' | 'users' | 'paid' | 'feedback' | 'usage';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'paid', label: 'Paid' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'usage', label: 'Usage' },
];

const SOURCE_LABELS: Record<string, string> = {
  sheet: 'Printed sheet QR',
  share: 'Share link',
  sitter_invite: 'Sitter invite',
  household_invite: 'Family invite',
  owner_invite: 'Invited by a sitter',
  trip_request: 'Trip request',
  direct: 'Direct',
  'before tracking': 'Before tracking',
};
const sourceLabel = (s?: string | null) => (s ? SOURCE_LABELS[s] ?? s : 'Not recorded');
const day = (ts?: string | null) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const money = (cents?: number | null, currency?: string | null) =>
  cents == null ? '' : `${(cents / 100).toLocaleString(undefined, { style: 'currency', currency: (currency || 'usd').toUpperCase() })}`;

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{ flexBasis: 150, flexGrow: 1 }}>
      <Card className="mb-3">
        <Text className="text-2xl font-bold text-primary-600">{value}</Text>
        <Text className="text-tan-600 text-sm">{label}</Text>
      </Card>
    </View>
  );
}

export function AdminScreen(_props: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [paid, setPaid] = useState<{ crown: any[]; sitters: any[] } | null>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<'new' | 'all'>('new');
  const [usageDays, setUsageDays] = useState(30);
  const [usage, setUsage] = useState<{ label: string; count: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview') setOverview(await dataService.adminOverview());
      if (tab === 'users') setUsers(await dataService.adminUsers(search));
      if (tab === 'paid') setPaid(await dataService.adminPaid());
      if (tab === 'feedback') setFeedback(await dataService.adminFeedback(feedbackFilter === 'new' ? 'new' : undefined));
      if (tab === 'usage') setUsage(await dataService.adminUsage(usageDays));
    } catch (error) {
      showAlert("Couldn't load", friendlyError(error, 'Please try again.'));
    } finally {
      setLoading(false);
    }
    // search is applied by its own button, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, feedbackFilter, usageDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const markFeedback = async (id: string, status: 'read' | 'done') => {
    try {
      await dataService.adminUpdateFeedback(id, status);
      await load();
    } catch (error) {
      showAlert("Couldn't update", friendlyError(error, 'Please try again.'));
    }
  };

  const pill = (active: boolean) =>
    `px-4 rounded-full border ${active ? 'bg-primary-500 border-primary-500' : 'border-primary-300 bg-cream-50'}`;

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Admin" width="wide" />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <ScreenContainer variant="wide" className="p-4">
          <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
                style={{ minHeight: 40, justifyContent: 'center' }}
                className={pill(tab === t.key)}
              >
                <Text className={tab === t.key ? 'text-white font-semibold' : 'text-primary-700'}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null}

          {!loading && tab === 'overview' && overview ? (
            <>
              <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                <Stat label="Accounts" value={overview.users_total} />
                <Stat label="New, last 7 days" value={overview.users_7d} />
                <Stat label="New, last 30 days" value={overview.users_30d} />
                <Stat label="Sitters" value={overview.sitters} />
                <Stat label="Households" value={overview.households} />
                <Stat label="Pets" value={overview.pets} />
                <Stat label="Guides" value={overview.guides} />
                <Stat label="Crown households" value={overview.crown_households} />
                <Stat label="Sitter subscribers" value={overview.sitter_subscribers} />
                <Stat label="New feedback" value={overview.feedback_new} />
              </View>
              <Card className="mt-2 mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-2">Where accounts came from</Text>
                {(overview.by_source ?? []).map((s: any) => (
                  <View key={s.source} className="flex-row justify-between py-1 border-b border-tan-100">
                    <Text className="text-brown-700">{sourceLabel(s.source)}</Text>
                    <Text className="text-brown-800 font-semibold">{s.count}</Text>
                  </View>
                ))}
                <Text className="text-tan-500 text-xs mt-2">
                  Counted from October 5, 2026. Earlier accounts show as "Before tracking".
                </Text>
              </Card>
              <Card className="mb-10">
                <Text className="text-brown-800 font-semibold mb-1">Revenue and discounts</Text>
                <Text className="text-tan-600 mb-3">
                  Stripe is the record for money: revenue, subscribers, refunds, and every promotion
                  code. Create codes there under Product catalog, Coupons.
                </Text>
                <Button
                  title="Open the Stripe dashboard"
                  onPress={() => Linking.openURL('https://dashboard.stripe.com').catch(() => {})}
                  variant="outline"
                />
              </Card>
            </>
          ) : null}

          {!loading && tab === 'users' ? (
            <>
              <View className="flex-row mb-3" style={{ gap: 8 }}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by email or name"
                  placeholderTextColor={COLORS.tan}
                  autoCapitalize="none"
                  onSubmitEditing={() => void load()}
                  className="flex-1 border border-tan-200 rounded-lg px-3 bg-cream-50 text-brown-800"
                  style={{ minHeight: 44 }}
                />
                <Button title="Search" onPress={() => void load()} variant="outline" />
              </View>
              <Text className="text-tan-500 text-sm mb-2">{users.length} accounts, newest first</Text>
              {users.map((u) => (
                <Card key={u.user_id} className="mb-2">
                  <Text className="text-brown-800 font-semibold">{u.name || u.email}</Text>
                  {u.name ? <Text className="text-tan-600 text-sm">{u.email}</Text> : null}
                  <Text className="text-tan-600 text-sm">
                    Joined {day(u.created_at)} · {sourceLabel(u.signup_source)}
                    {u.last_sign_in_at ? ` · last in ${day(u.last_sign_in_at)}` : ''}
                  </Text>
                  <Text className="text-brown-700 text-sm mt-1">
                    {u.role === 'sitter' ? 'Sitter' : 'Owner'} · {u.pets} pets · {u.guides} guides
                    {u.sitter_clients > 0 ? ` · ${u.sitter_clients} sitter clients` : ''}
                    {u.crown ? ' · 👑 Crown' : ''}
                    {u.sitter_plan ? ` · Sitter plan: ${u.sitter_plan}` : ''}
                  </Text>
                </Card>
              ))}
            </>
          ) : null}

          {!loading && tab === 'paid' && paid ? (
            <>
              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-2">Sitter subscriptions</Text>
                {paid.sitters.length === 0 ? <Text className="text-tan-500">None yet.</Text> : null}
                {paid.sitters.map((s, i) => (
                  <View key={i} className="py-2 border-b border-tan-100">
                    <Text className="text-brown-800 font-medium">{s.name || s.email}</Text>
                    <Text className="text-tan-600 text-sm">
                      {s.status}
                      {s.period_end ? ` · ${s.cancel_at_period_end ? 'ends' : 'renews'} ${day(s.period_end)}` : ''}
                    </Text>
                  </View>
                ))}
              </Card>
              <Card className="mb-10">
                <Text className="text-lg font-semibold text-brown-800 mb-2">Crown</Text>
                {paid.crown.length === 0 ? <Text className="text-tan-500">None yet.</Text> : null}
                {paid.crown.map((c, i) => (
                  <View key={i} className="py-2 border-b border-tan-100">
                    <Text className="text-brown-800 font-medium">
                      {c.household} {c.active ? '' : '(not active)'}
                    </Text>
                    <Text className="text-tan-600 text-sm">
                      {[c.buyer, money(c.amount_cents, c.currency), c.reason, day(c.at)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {!loading && tab === 'feedback' ? (
            <>
              <View className="flex-row mb-3" style={{ gap: 8 }}>
                {(['new', 'all'] as const).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setFeedbackFilter(f)}
                    style={{ minHeight: 40, justifyContent: 'center' }}
                    className={pill(feedbackFilter === f)}
                  >
                    <Text className={feedbackFilter === f ? 'text-white font-semibold' : 'text-primary-700'}>
                      {f === 'new' ? 'New' : 'All'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {feedback.length === 0 ? (
                <Text className="text-tan-500 mb-10">{feedbackFilter === 'new' ? 'Nothing new.' : 'No feedback yet.'}</Text>
              ) : null}
              {feedback.map((f) => (
                <Card key={f.id} className="mb-3">
                  <Text className="text-brown-800 font-semibold">{f.name || f.email}</Text>
                  <Text className="text-tan-600 text-sm mb-2">
                    {day(f.created_at)}
                    {f.screen ? ` · from ${f.screen}` : ''} · {f.status}
                  </Text>
                  <Text className="text-brown-700 leading-6 mb-3" selectable>
                    {f.message}
                  </Text>
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {f.email ? (
                      <Button
                        title="Reply by email"
                        onPress={() =>
                          Linking.openURL(
                            `mailto:${f.email}?subject=${encodeURIComponent('Re: your Pawstructions feedback')}`
                          ).catch(() => {})
                        }
                        variant="outline"
                      />
                    ) : null}
                    {f.status === 'new' ? (
                      <Button title="Mark read" onPress={() => markFeedback(f.id, 'read')} variant="outline" />
                    ) : null}
                    {f.status !== 'done' ? (
                      <Button title="Done" onPress={() => markFeedback(f.id, 'done')} variant="primary" />
                    ) : null}
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          {!loading && tab === 'usage' ? (
            <>
              <View className="flex-row mb-3" style={{ gap: 8 }}>
                {[7, 30, 90].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setUsageDays(d)}
                    style={{ minHeight: 40, justifyContent: 'center' }}
                    className={pill(usageDays === d)}
                  >
                    <Text className={usageDays === d ? 'text-white font-semibold' : 'text-primary-700'}>
                      Last {d} days
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Card className="mb-10">
                {usage.map((u) => (
                  <View key={u.label} className="flex-row justify-between py-2 border-b border-tan-100">
                    <Text className="text-brown-700 flex-1 mr-3">{u.label}</Text>
                    <Text className="text-brown-800 font-semibold">{u.count}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
