import { View, Text } from 'react-native';
import { Icon } from '../components/Icon';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { RefundScreenProps } from '../navigation/types';

// Bump when the wording below changes.
const LAST_UPDATED = '2026-08-15';

export function RefundScreen(_props: RefundScreenProps) {
  return (
    <TrustPage
      route="Refund"
      title="Refund Policy"
      lastUpdated={LAST_UPDATED}
      intro="Crown is a $5 one-time purchase, and we would rather give the $5 back than have you feel stuck with something you do not want."
    >
      {/* The policy itself, up top, before any conditions — anyone landing
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
          If you buy Crown and it is not what you wanted, email us within 14 days of the purchase
          and we will refund it in full. You do not need to give a reason, and we will not try to
          talk you out of it.
        </Text>
      </View>

      <TrustSection heading="What this covers">
        <TrustText>
          Crown is the only thing we sell: a single $5 (USD) payment that unlocks AI cheat sheets
          for one household, permanently. It is not a subscription — it never renews, so there is
          nothing to cancel and no future charge to stop.
        </TrustText>
      </TrustSection>

      <TrustSection heading="How to ask for one">
        <TrustBullet>
          Email <Text className="font-semibold">support@pawstructions.com</Text> from the email
          address on your Pawstructions account.
        </TrustBullet>
        <TrustBullet>
          Say you would like a Crown refund. That is genuinely all we need — the account address
          is enough for us to find the purchase.
        </TrustBullet>
        <TrustBullet>
          We will confirm by email once the refund has been issued, and it goes back to the card
          or account you paid with. How quickly it appears on your statement is up to your bank,
          usually within 5–10 business days.
        </TrustBullet>
      </TrustSection>

      <TrustSection heading="What happens to your pets and guides">
        <TrustText>
          Nothing is deleted. Your pets, guides, share links and any cheat sheets already
          generated stay exactly where they are. The household simply returns to the free tier:
          sheets are shown with the PREVIEW watermark again, and every guide still has its one
          free cheat sheet unless it had already used it. Sheets that Crown wrote do not use it
          up, so those guides can each be rewritten once more, free and watermarked; after that,
          rewriting a sheet needs Crown.
        </TrustText>
        <TrustText>
          You can buy Crown again later if you change your mind. Nothing about a refund closes
          your account or holds it against you.
        </TrustText>
      </TrustSection>

      <TrustSection heading="After 14 days">
        <TrustText>
          Past 14 days we are not obliged to refund, but please write to us anyway. If Crown did
          not do what you expected, we would much rather hear about it than keep your $5.
        </TrustText>
        <TrustText>
          Duplicate or accidental purchases — the same household paid for twice, a purchase made
          by someone who did not mean to — we refund whenever we hear about them, however long it
          has been.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Before you dispute a charge">
        <TrustText>
          If you do not recognise a charge from us, email support@pawstructions.com first. We can
          almost always sort it out the same way a bank dispute would, only faster, and without
          the account being frozen while it is investigated.
        </TrustText>
      </TrustSection>
    </TrustPage>
  );
}
