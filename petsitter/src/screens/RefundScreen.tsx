import { View, Text } from 'react-native';
import { Icon } from '../components/Icon';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { RefundScreenProps } from '../navigation/types';

// Bump when the wording below changes.
const LAST_UPDATED = '2026-10-21';

export function RefundScreen(_props: RefundScreenProps) {
  return (
    <TrustPage
      route="Refund"
      title="Refund Policy"
      lastUpdated={LAST_UPDATED}
      intro="You can cancel a subscription any time, and if a charge catches you by surprise, we would rather give it back than have you feel stuck paying for something you do not want."
    >
      {/* The policy itself, up top, before any conditions: anyone landing
          here is looking for exactly one answer. */}
      <View className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-6">
        <View className="flex-row items-center mb-2">
          <Icon name="check" size={28} style={{ marginRight: 10 }} />
          <Text
            accessibilityRole="header"
            className="flex-1 text-lg font-semibold text-brown-800"
          >
            14 days, no questions asked
          </Text>
        </View>
        <Text className="text-brown-700 leading-6">
          If you are charged and did not mean to be (for example, a renewal you forgot about, or
          the first charge after a free trial), email us within 14 days of that charge and we
          will refund it in full. You do not need to give a reason, and we will not try to talk
          you out of it.
        </Text>
      </View>

      <TrustSection heading="What this covers">
        <TrustText>
          We sell two subscriptions: Pawstructions Plus for pet owners ($3 a month or $24 a year,
          USD, per household), and Pro for independent sitters ($9 a month or $79 a year, USD,
          after a 30-day free trial). You can cancel either one any time from the billing page,
          and no further charge is made. You keep what you have paid for until the end of that
          period.
        </TrustText>
        <TrustText>
          Bought Crown before? You keep it, forever, and it includes everything in Plus. Crown
          purchases keep the promise they were sold with: if it was not what you wanted, email us
          within 14 days of the purchase and we will refund it in full.
        </TrustText>
      </TrustSection>

      <TrustSection heading="How to ask for one">
        <TrustBullet>
          Email <Text className="font-semibold">support@pawstructions.com</Text> from the email
          address on your Pawstructions account.
        </TrustBullet>
        <TrustBullet>
          Say you would like a refund. That is genuinely all we need: the account address is
          enough for us to find the charge.
        </TrustBullet>
        <TrustBullet>
          We will confirm by email once the refund has been issued, and it goes back to the card
          or account you paid with. How quickly it appears on your statement is up to your bank,
          usually within 5 to 10 business days.
        </TrustBullet>
      </TrustSection>

      <TrustSection heading="What happens to your pets and guides">
        <TrustText>
          Nothing is deleted. Your pets, guides, share links and any cheat sheets already
          generated stay exactly where they are. A refund of Plus or Crown simply returns the
          household to the free tier: sheets already written stay readable, shown with the
          PREVIEW watermark again, and every guide still has its one free cheat sheet unless it
          had already used it. Sheets written while the household had Plus or Crown do not use it
          up, so those guides can each be rewritten once more, free and watermarked; after that,
          rewriting a sheet needs Plus.
        </TrustText>
        <TrustText>
          A refund of Pro never cuts a sitter off from the clients they are already connected to.
        </TrustText>
        <TrustText>
          You can subscribe again later if you change your mind. Nothing about a refund closes
          your account or holds it against you.
        </TrustText>
      </TrustSection>

      <TrustSection heading="After 14 days">
        <TrustText>
          Past 14 days we are not obliged to refund, but please write to us anyway. If something
          did not do what you expected, we would much rather hear about it than keep your money.
        </TrustText>
        <TrustText>
          Duplicate or accidental purchases: the same household paid for twice, a purchase made
          by someone who did not mean to. We refund whenever we hear about them, however long it
          has been.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Before you dispute a charge">
        <TrustText>
          If you do not recognize a charge from us, email support@pawstructions.com first. We can
          almost always sort it out the same way a bank dispute would, only faster, and without
          the account being frozen while it is investigated.
        </TrustText>
      </TrustSection>
    </TrustPage>
  );
}
