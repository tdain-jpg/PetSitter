import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, DateField, Input, ScreenContainer, ScreenHeader } from '../components';
import { dataService } from '../services';
import { showAlert, showConfirm } from '../lib/dialogs';
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
type Tab = 'overview' | 'users' | 'paid' | 'promo' | 'feedback' | 'usage';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'paid', label: 'Paid' },
  { key: 'promo', label: 'Promo codes' },
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
const PROMO_KINDS = [
  { key: 'crown_free', label: 'Free Crown' },
  { key: 'crown_percent', label: '% off Crown' },
  { key: 'sitter_free_months', label: 'Free sitter months' },
  { key: 'sitter_percent', label: '% off sitter plan' },
] as const;
type PromoKind = (typeof PROMO_KINDS)[number]['key'];
const kindLabel = (k?: string | null) => PROMO_KINDS.find((x) => x.key === k)?.label ?? 'Made in Stripe';

/** Small grey label for a test account; they are kept out of every count. */
function TestBadge() {
  return (
    <Text className="text-xs text-white bg-gray-500 rounded px-2 py-0.5 self-start overflow-hidden">TEST</Text>
  );
}
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
  const [promos, setPromos] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [promoForm, setPromoForm] = useState<{
    kind: PromoKind;
    code: string;
    percent: string;
    months: string;
    max: string;
    expires: string;
  }>({ kind: 'crown_free', code: '', percent: '50', months: '3', max: '', expires: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview') setOverview(await dataService.adminOverview());
      if (tab === 'users') setUsers(await dataService.adminUsers(search));
      if (tab === 'paid') setPaid(await dataService.adminPaid());
      if (tab === 'feedback') setFeedback(await dataService.adminFeedback(feedbackFilter === 'new' ? 'new' : undefined));
      if (tab === 'usage') setUsage(await dataService.adminUsage(usageDays));
      if (tab === 'promo') {
        const [list, used] = await Promise.all([
          dataService.adminPromo({ action: 'list' }),
          dataService.adminPromoRedemptions(),
        ]);
        setPromos(list?.codes ?? []);
        setRedemptions(used);
      }
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

  const setTest = async (u: any) => {
    try {
      await dataService.adminSetTest(u.user_id, !u.is_test);
      await load();
    } catch (error) {
      showAlert("Couldn't update", friendlyError(error, 'Please try again.'));
    }
  };

  const createPromo = async () => {
    const f = promoForm;
    const isCrown = f.kind.startsWith('crown');
    const isFree = f.kind === 'crown_free' || f.kind === 'sitter_free_months';
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
      showAlert('Check the code', 'Use 3 to 40 letters, numbers or dashes, like FRIENDS-2026.');
      return;
    }
    const what = isCrown
      ? isFree ? 'a free Crown' : `${f.percent}% off Crown`
      : isFree ? `${f.months} free sitter months (monthly plan)` : `${f.percent}% off the sitter plan for ${f.months} months (monthly plan)`;
    const ok = await showConfirm({
      title: `Create ${code}?`,
      message: `This creates a live code in Stripe for ${what}${f.max ? `, usable ${f.max} times` : ''}${f.expires ? `, until ${f.expires}` : ''}. Anyone with the code can use it. You can switch it off later, but not edit it.`,
      confirmLabel: 'Create code',
    });
    if (!ok) return;
    setCreating(true);
    try {
      await dataService.adminPromo({
        action: 'create',
        kind: f.kind,
        code,
        ...(isFree ? {} : { percent: Number(f.percent) }),
        ...(isCrown ? {} : { months: Number(f.months) }),
        ...(f.max ? { max_redemptions: Number(f.max) } : {}),
        ...(f.expires ? { expires_on: f.expires } : {}),
      });
      setPromoForm((prev) => ({ ...prev, code: '', max: '', expires: '' }));
      await load();
      showAlert('Code created', `${code} is live in Stripe. People enter it at checkout.`);
    } catch (error) {
      showAlert("Couldn't create the code", friendlyError(error, 'Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  const switchOffPromo = async (p: any) => {
    const ok = await showConfirm({
      title: `Switch off ${p.code}?`,
      message: 'Nobody will be able to use it from now on. Past uses stay in Stripe and here.',
      confirmLabel: 'Switch off',
      destructive: true,
    });
    if (!ok) return;
    try {
      await dataService.adminPromo({ action: 'deactivate', id: p.id });
      await load();
    } catch (error) {
      showAlert("Couldn't switch it off", friendlyError(error, 'Please try again.'));
    }
  };

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
              <Text className="text-tan-500 text-sm mb-3">
                {overview.test_accounts} test {overview.test_accounts === 1 ? 'account is' : 'accounts are'} left out of every number on this page. Change which accounts are tests on the Users tab.
              </Text>
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
                <Card key={u.user_id} className={`mb-2 ${u.is_test ? 'opacity-60' : ''}`}>
                  {u.is_test ? <TestBadge /> : null}
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
                    {u.promo_codes ? ` · Code: ${u.promo_codes}` : ''}
                  </Text>
                  <View className="flex-row mt-2">
                    <Button
                      title={u.is_test ? 'Not a test account' : 'Mark as test account'}
                      onPress={() => setTest(u)}
                      variant="outline"
                    />
                  </View>
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
                  <View key={i} className={`py-2 border-b border-tan-100 ${s.is_test ? 'opacity-60' : ''}`}>
                    {s.is_test ? <TestBadge /> : null}
                    <Text className="text-brown-800 font-medium">{s.name || s.email}</Text>
                    <Text className="text-tan-600 text-sm">
                      {s.status}
                      {s.period_end ? ` · ${s.cancel_at_period_end ? 'ends' : 'renews'} ${day(s.period_end)}` : ''}
                      {s.promo_code ? ` · code ${s.promo_code}` : ''}
                    </Text>
                  </View>
                ))}
              </Card>
              <Card className="mb-10">
                <Text className="text-lg font-semibold text-brown-800 mb-2">Crown</Text>
                {paid.crown.length === 0 ? <Text className="text-tan-500">None yet.</Text> : null}
                {paid.crown.map((c, i) => (
                  <View key={i} className={`py-2 border-b border-tan-100 ${c.is_test ? 'opacity-60' : ''}`}>
                    {c.is_test ? <TestBadge /> : null}
                    <Text className="text-brown-800 font-medium">
                      {c.household} {c.active ? '' : '(not active)'}
                    </Text>
                    <Text className="text-tan-600 text-sm">
                      {[c.buyer, money(c.amount_cents, c.currency), c.promo_code ? `code ${c.promo_code}` : null, c.reason, day(c.at)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {!loading && tab === 'promo' ? (
            <>
              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Create a code</Text>
                <Text className="text-tan-600 text-sm mb-3">
                  Codes live in Stripe, so its reports count every discount. Sitter codes work on the
                  monthly plan only.
                </Text>
                <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
                  {PROMO_KINDS.map((k) => (
                    <Pressable
                      key={k.key}
                      onPress={() => setPromoForm((prev) => ({ ...prev, kind: k.key }))}
                      style={{ minHeight: 40, justifyContent: 'center' }}
                      className={pill(promoForm.kind === k.key)}
                    >
                      <Text className={promoForm.kind === k.key ? 'text-white font-semibold' : 'text-primary-700'}>
                        {k.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Input
                  label="Code"
                  placeholder="e.g., FRIENDS-2026"
                  value={promoForm.code}
                  onChangeText={(v) => setPromoForm((prev) => ({ ...prev, code: v.toUpperCase() }))}
                  autoCapitalize="characters"
                />
                {promoForm.kind === 'crown_percent' || promoForm.kind === 'sitter_percent' ? (
                  <Input
                    label="Percent off"
                    placeholder="50"
                    value={promoForm.percent}
                    onChangeText={(v) => setPromoForm((prev) => ({ ...prev, percent: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                  />
                ) : null}
                {promoForm.kind.startsWith('sitter') ? (
                  <Input
                    label="For how many months"
                    placeholder="3"
                    value={promoForm.months}
                    onChangeText={(v) => setPromoForm((prev) => ({ ...prev, months: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                  />
                ) : null}
                <Input
                  label="How many times it can be used (optional)"
                  placeholder="No limit"
                  value={promoForm.max}
                  onChangeText={(v) => setPromoForm((prev) => ({ ...prev, max: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="numeric"
                />
                <DateField
                  label="Last day it works (optional)"
                  value={promoForm.expires}
                  onChange={(v) => setPromoForm((prev) => ({ ...prev, expires: v }))}
                />
                <View className="mt-3">
                  <Button title={creating ? 'Creating…' : 'Create code in Stripe'} onPress={createPromo} disabled={creating} />
                </View>
              </Card>

              <Card className="mb-10">
                <Text className="text-lg font-semibold text-brown-800 mb-2">Codes</Text>
                {promos.length === 0 ? <Text className="text-tan-500">No codes yet.</Text> : null}
                {promos.map((p) => {
                  const users = redemptions.filter((r) => r.code === p.code);
                  return (
                    <View key={p.id} className={`py-3 border-b border-tan-100 ${p.active ? '' : 'opacity-60'}`}>
                      <Text className="text-brown-800 font-semibold">
                        {p.code} {p.active ? '' : '(switched off)'}
                      </Text>
                      <Text className="text-tan-600 text-sm">
                        {kindLabel(p.kind)}
                        {p.percent_off && p.percent_off !== 100 ? ` · ${p.percent_off}% off` : ''}
                        {p.duration_in_months ? ` · ${p.duration_in_months} months` : ''}
                        {` · used ${p.times_redeemed}${p.max_redemptions ? ` of ${p.max_redemptions}` : ''}`}
                        {p.expires_at ? ` · until ${day(new Date(p.expires_at * 1000).toISOString())}` : ''}
                      </Text>
                      {users.map((r, i) => (
                        <Text key={i} className="text-brown-700 text-sm">
                          {r.is_test ? '[TEST] ' : ''}
                          {r.email || 'unknown'}
                          {r.household ? ` (${r.household})` : ''} · {day(r.at)}
                        </Text>
                      ))}
                      {p.active ? (
                        <View className="flex-row mt-2">
                          <Button title="Switch off" onPress={() => switchOffPromo(p)} variant="outline" />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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
