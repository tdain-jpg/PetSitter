import { View, Text } from 'react-native';
import { Icon } from '../components/Icon';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { PrivacyScreenProps } from '../navigation/types';

// Bump when the wording below changes.
const LAST_UPDATED = '2026-08-15';

export function PrivacyScreen(_props: PrivacyScreenProps) {
  return (
    <TrustPage
      route="Privacy"
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro="Pawstructions holds some of the most sensitive information in your house — where the spare key is, what the alarm code is, which medication your dog cannot miss. This page says plainly what we do with it."
    >
      <TrustSection heading="The short version">
        <TrustBullet>
          We store what you type so we can show it back to you and to the sitters you choose.
        </TrustBullet>
        <TrustBullet>
          Your home access codes and wifi password are never sent to an AI provider. They are
          replaced with placeholders before the prompt leaves our infrastructure.
        </TrustBullet>
        <TrustBullet>
          We do not sell your information, and there are no advertising or analytics trackers in
          the app.
        </TrustBullet>
        <TrustBullet>
          You can export everything as a file, and you can delete it, from Settings.
        </TrustBullet>
      </TrustSection>

      {/* The differentiator. Given a prominent card rather than a paragraph
          buried mid-page: this is the single question people ask before they
          type a door code into someone else's software. */}
      <View className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-6">
        <View className="flex-row items-center mb-2">
          <Icon name="privacy" size={28} style={{ marginRight: 10 }} />
          <Text
            accessibilityRole="header"
            className="flex-1 text-lg font-semibold text-brown-800"
          >
            Your access codes never reach the AI
          </Text>
        </View>
        <Text className="text-brown-700 leading-6 mb-3">
          Crown cheat sheets are written by an AI model run by Anthropic. Before any of your
          guide is sent there, our server rewrites it: every sensitive home value is swapped for
          a placeholder. Your wifi password becomes{' '}
          <Text className="font-semibold">[[WIFI_PASSWORD]]</Text>, your door code becomes{' '}
          <Text className="font-semibold">[[DOOR_CODE]]</Text>, and the same happens to your
          alarm, garage, gate and mailbox codes and the location of your spare key.
        </Text>
        <Text className="text-brown-700 leading-6 mb-3">
          Anthropic receives the placeholders. The finished sheet is stored with the placeholders
          still in it, so the real values are not sitting in our AI records either. They are
          filled back in on your own device, at the moment the sheet is shown, printed or copied.
        </Text>
        <Text className="text-brown-700 leading-6">
          The substitution happens in the server code that assembles the prompt, so it does not
          depend on the app on your phone behaving correctly. It is the same code path for the
          screen, the PDF and the clipboard.
        </Text>
      </View>

      <TrustSection heading="What we store">
        <TrustBullet>
          <Text className="font-semibold">Your account.</Text> Your email address, and your name
          if you give one. Passwords are handled by our authentication provider and we never see
          them.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Your pets.</Text> Name, species, breed, age, weight,
          photo, feeding schedules, medications, vet and insurance details, and any notes you
          write.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Your guides.</Text> Home and access information
          (including the sensitive values above), emergency contacts, daily routines, trip dates,
          and anything else you add.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Your household.</Text> Who belongs to it, and the email
          addresses you send invitations to.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Sharing and activity.</Text> The share links you
          create, how many times each has been opened, and which checklist tasks have been ticked
          off.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Settings and generated sheets.</Text> Your preferences,
          and the cheat sheets Crown has written for you.
        </TrustBullet>
        <TrustText>
          We do not ask for your address for our own purposes, and we never see or store card
          numbers.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Who else touches it">
        <TrustBullet>
          <Text className="font-semibold">Supabase</Text> hosts the database, the file storage
          for pet photos, and sign-in. They process this data on our instructions. Everything
          travels over TLS and is encrypted at rest, and database rules restrict each row to the
          household it belongs to.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Brevo</Text> sends our email: sign-in and
          password-reset messages, household invitations, and any notifications you switch on.
          Brevo receives the recipient address and the contents of that message.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Anthropic</Text> runs the AI model behind Crown cheat
          sheets, and receives your guide text with sensitive values replaced by placeholders, as
          described above.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Stripe</Text> handles the Crown payment. Your card
          details go directly to Stripe; they never pass through our servers and we never store
          them.
        </TrustBullet>
        <TrustText>
          Beyond these, we do not share your information with anyone. We do not sell it, and we
          do not hand it to advertisers or data brokers. We would disclose information if the law
          genuinely required it.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Share links">
        <TrustText>
          A share link contains a long random code, so it cannot be guessed or found by browsing.
          But it is a key, not a password: anyone holding that link can open that guide, without
          signing in, including the sensitive values it contains — those are hidden behind a tap
          in the shared view, not withheld.
        </TrustText>
        <TrustText>
          Send links only to people you trust with your house. You can turn any link off from the
          app the moment you want it to stop working, and you can set a link to expire when you
          create it.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Taking your data with you, or deleting it">
        <TrustBullet>
          <Text className="font-semibold">Export.</Text> Settings → Export Data downloads
          everything in your default household as a JSON file you keep.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Delete.</Text> Settings → Clear All Data permanently
          deletes every pet, guide and share link in that household. It affects everyone in the
          household and cannot be undone.
        </TrustBullet>
        <TrustBullet>
          <Text className="font-semibold">Close your account.</Text> Email
          support@pawstructions.com from the address on the account and we will delete the
          account and the data attached to it.
        </TrustBullet>
        <TrustText>
          Backups are kept for a short period after deletion as part of normal database
          operation, and age out on their own.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Cookies and tracking">
        <TrustText>
          Pawstructions keeps your sign-in on your own device so you stay logged in between
          visits. That is the only thing we put in browser storage. There are no advertising
          trackers, no analytics scripts and no third-party cookies in the app.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Children">
        <TrustText>
          Pawstructions is meant for adults looking after pets. We do not knowingly collect
          information from children under 13. If you believe a child has created an account,
          write to us and we will remove it.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Changes, and how to reach us">
        <TrustText>
          If this policy changes we will update the date at the top of this page, and we will say
          so in the app or by email if the change is significant.
        </TrustText>
        <TrustText>
          Questions, corrections, or a request to delete your account: support@pawstructions.com.
        </TrustText>
      </TrustSection>
    </TrustPage>
  );
}
