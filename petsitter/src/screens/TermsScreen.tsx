import { View, Text } from 'react-native';
import { Icon } from '../components/Icon';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { TermsScreenProps } from '../navigation/types';

// Bump when the wording below changes.
const LAST_UPDATED = '2026-10-21';

export function TermsScreen(_props: TermsScreenProps) {
  return (
    <TrustPage
      route="Terms"
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro="Plain language, because these actually matter. This page describes what Pawstructions does for you, what we ask of you in return, and where our responsibility ends."
    >
      <TrustSection heading="Agreeing to these terms">
        <TrustText>
          By creating a Pawstructions account or using the app, you agree to these terms. If you
          do not agree with them, please do not use Pawstructions. You need to be old enough to
          enter into an agreement where you live, and at least 13.
        </TrustText>
      </TrustSection>

      {/* The one thing on this page that can hurt an animal if it is missed,
          so it gets a card instead of a paragraph. */}
      <View className="bg-warm-50 border border-warm-300 rounded-xl p-4 mb-6">
        <View className="flex-row items-center mb-2">
          <Icon name="vet" size={28} style={{ marginRight: 10 }} />
          <Text
            accessibilityRole="header"
            className="flex-1 text-lg font-semibold text-brown-800"
          >
            Pawstructions is not veterinary advice
          </Text>
        </View>
        <Text className="text-brown-700 leading-6 mb-3">
          Pawstructions is an organizational tool. It stores, formats and shares the care
          instructions you write. It does not give veterinary or medical advice, it is not a
          medical device, and it is not a monitoring service.
        </Text>
        {/* Deliberately not a promise that the model never adds advice: we instruct it not
            to, but an instruction reduces that behaviour, it cannot rule it out. What is
            promised here is only what the system actually guarantees. */}
        <Text className="text-brown-700 leading-6 mb-3">
          AI cheat sheets rewrite your own words into a one-page summary. We do not check
          your dosages and we do not diagnose anything: a sheet is built from what you put in
          the guide, and nothing in it has been verified against any medical source. The model
          is instructed to summarize your instructions and add nothing of its own, but like any
          AI it can make mistakes in the rewriting, and it can slip in a line you never wrote.
          Read a sheet before you hand it over, and treat anything you do not recognize as
          something to check with your vet, not something to follow.
        </Text>
        <Text className="text-brown-700 leading-6">
          Nothing here replaces your vet. In an emergency, call your vet or an emergency animal
          hospital.
        </Text>
      </View>

      <TrustSection heading="You are responsible for what you enter">
        <TrustText>
          Medication names, doses and timings, allergy notes, vet numbers, gate codes,
          emergency contacts: Pawstructions repeats what you type and has no way to tell whether
          it is right. Keeping it accurate and current is your job, and so is checking a guide or
          a generated cheat sheet before you hand it to a sitter.
        </TrustText>
        <TrustText>
          If you invite other people into your household, they can see and change the pets and
          guides in it. Invite people you would trust with the animals themselves.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Sharing guides">
        <TrustText>
          A share link is a key. Anyone holding it can open that guide without signing in,
          including the sensitive home values in it. You decide who gets a link, you choose how
          long it lasts when you create it, and you can turn any link off at any time. What
          happens to a link after you send it is on you, not us.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Acceptable use">
        <TrustBullet>
          Use Pawstructions for pets in your care, and for households you belong to.
        </TrustBullet>
        <TrustBullet>
          Do not enter someone else’s personal information, such as a sitter’s phone number or a
          neighbor’s address, without their agreement.
        </TrustBullet>
        <TrustBullet>
          Do not use Pawstructions for anything unlawful, or to store material you have no right
          to store.
        </TrustBullet>
        <TrustBullet>
          Do not try to reach another household’s data, probe or overload the service, or work
          around the limits of your plan.
        </TrustBullet>
        <TrustBullet>
          Do not resell, rebrand or redistribute Pawstructions as your own service.
        </TrustBullet>
      </TrustSection>

      <TrustSection heading="Plans and payment">
        <TrustText>
          Pawstructions is free for pet owners. The free tier includes the live sitter features
          for 2 trips each calendar year.
        </TrustText>
        <TrustText>
          Pawstructions Plus costs $3 a month or $24 a year (USD) and covers one household, so
          everyone in it benefits. It renews until you cancel. You can cancel any time from the
          billing page: Plus continues to the end of the period you have already paid for, then
          the household returns to the free tier. Nothing is deleted.
        </TrustText>
        <TrustText>
          Pro is for independent sitters who bring in their own clients. It starts with a 30-day
          free trial: you enter a card when you start, and if you cancel during the trial you are
          never charged. After that it costs $9 a month or $79 a year (USD) and renews until you
          cancel. Canceling keeps Pro until the end of the period you have already paid for.
          Sitters invited by a pet owner are always free.
        </TrustText>
        <TrustText>
          Promotion codes can be entered at checkout on the monthly plans. Payments are processed
          by Stripe, and your card details never touch Pawstructions.
        </TrustText>
        <TrustText>
          Every guide you write gets one free AI cheat sheet on the free tier, shown with a
          PREVIEW watermark. A duplicate is a new guide, so it gets its own free sheet; to keep
          that from being abused, free sheets are rate-limited per account rather than per guide.
          The watermark marks the state of the feature, not the quality of the content: the
          instructions on a preview sheet are your real instructions. Refunds are covered by our
          refund policy.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Availability, and no warranty">
        <TrustText>
          Pawstructions is provided as it is, without warranties of any kind. We work hard to
          keep it running, but we do not promise it will always be available, always error-free,
          or that a guide will load at the exact moment a sitter needs it, networks and phones
          being what they are.
        </TrustText>
        <TrustText>
          Keep your own copy of anything critical. Settings → Export Data gives you the lot as a
          file, and every guide can be printed as a PDF and left in the kitchen, which works with
          no battery at all.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Limits on our liability">
        <TrustText>
          To the fullest extent the law allows, we are not liable for indirect, incidental or
          consequential losses arising from your use of Pawstructions, and our total liability to
          you is limited to what you have actually paid us, which for most people is nothing.
          Some places do not allow limits like these; where that is the case,
          they do not apply to you.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Ending it">
        <TrustText>
          You can stop using Pawstructions whenever you like, export your data, and ask us to
          delete your account by emailing support@pawstructions.com.
        </TrustText>
        <TrustText>
          We may suspend or close an account that breaks these terms or puts other people’s data
          at risk. Where we reasonably can, we will tell you why and give you a chance to get
          your data out first.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Changes, and how to reach us">
        <TrustText>
          If these terms change we will update the date at the top of this page, and we will tell
          you in the app or by email if the change is significant. Continuing to use
          Pawstructions after a change means you accept the updated terms.
        </TrustText>
        <TrustText>Questions about any of this: support@pawstructions.com.</TrustText>
      </TrustSection>
    </TrustPage>
  );
}
