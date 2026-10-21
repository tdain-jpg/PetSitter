import { View, Text } from 'react-native';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { FAQScreenProps } from '../navigation/types';

/**
 * A question and its answer.
 *
 * The first draft set the question as a TrustText nested inside another
 * TrustText, meaning to make it bold. Nested Text does not bold anything — it
 * would have rendered as one run-on paragraph carrying a stray bottom margin
 * in the middle of itself. A question that does not look like a question is
 * the one formatting mistake a FAQ cannot afford, since scanning for your own
 * question is the only way anybody reads one of these.
 */
function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-brown-800 font-semibold leading-6 mb-1">{q}</Text>
      <Text className="text-brown-700 leading-6">{children}</Text>
    </View>
  );
}

// Bump when the wording below changes.
const LAST_UPDATED = '2026-10-21';

/**
 * What the app actually does, in the questions people actually ask.
 *
 * It sits with the trust pages rather than in the marketing stack because it
 * has to answer for a signed-out visitor: the landing page sells, and this
 * page is where someone goes when selling is not what they want. It is also
 * the honest place to state the two prices in one view, which no other page
 * does — the landing page mentions Crown, and Sitter plans is only reachable
 * once you are already a sitter.
 *
 * House rule for this page: every answer describes something that EXISTS. No
 * "coming soon", no roadmap. A FAQ that describes intentions is a sales page
 * wearing a lab coat, and the moment one answer turns out to be aspirational
 * the reader stops trusting the other nineteen.
 */
export function FAQScreen(_props: FAQScreenProps) {
  return (
    <TrustPage
      route="FAQ"
      title="Questions & Answers"
      lastUpdated={LAST_UPDATED}
      intro="What Pawstructions does, what it costs, and what happens to your information."
    >
      <TrustSection heading="The basics">
        <QA q="What is it for?">
          Everything you know about looking after your
          pets lives in your head. Pawstructions gets it out of your head and into one guide you
          can hand to whoever is looking after them next: a sitter, a neighbor, your mother.
        </QA>
        <QA q="Do I need to install anything?">
          No. It runs in any modern browser
          at pawstructions.com. You can add it to a phone home screen so it opens like an app,
          with no app store involved.
        </QA>
        <QA q="Does my sitter need an account?">
          Not to read a guide. You can
          send a share link that opens in any browser with no sign-up at all. An account is only
          needed if they want the sitter side: their own list of clients, and the ability to
          tick off tasks as they go.
        </QA>
      </TrustSection>

      <TrustSection heading="What it costs">
        <QA q="Is it free for pet owners?">
          Yes. Unlimited pets, unlimited guides, share links (your sitter needs no account), PDF
          export, Home details, and inviting the rest of your household so you all work from the
          same information. All free, with no limit. Free households also get the live sitter
          features for 2 trips each calendar year: a sitter with their own account, the Today
          checklist, check-ins, photos, visit history, and asking a sitter to take a trip. Every
          guide also gets one free AI cheat sheet, marked PREVIEW.
        </QA>
        <QA q="Pawstructions Plus: $3 a month or $24 a year, for pet owners.">
          Plus covers your whole household, so everyone in it benefits. You get unlimited trips
          with live sitter features, and unlimited AI cheat sheets (the one-page summary a sitter
          keeps on the fridge) with no watermark, rewritten whenever you like. There is no free
          trial, because the free tier is the trial. Cancel any time from the billing page: Plus
          continues to the end of the period you have paid for, then the household returns to the
          free tier. Nothing is deleted.
        </QA>
        <QA q="Do friends and family who sit for me pay anything?">
          No. A sitter you invite is always free, with no limit, and is never asked to pay.
        </QA>
        <QA q="Pro: $9 a month or $79 a year, for independent sitters.">
          Pro is for sitters who bring in their own clients. The first month is free: you enter a
          card when you start, and if you cancel during the 30-day trial you are never charged.
          Stripe emails you a reminder 7 days before the trial ends. Cancel any time, and you keep
          Pro until the end of the period you have paid for.
        </QA>
        <TrustText>
          Nobody is ever disconnected from a household they already look after. Existing client
          connections are never cut off.
        </TrustText>
        <TrustText>
          Promotion codes can be entered at checkout on the monthly plans.
        </TrustText>
      </TrustSection>

      <TrustSection heading="For pet owners">
        <TrustBullet>
          Add each pet once: feeding, medication, vet details, health notes, the small habits
          nobody thinks to write down.
        </TrustBullet>
        <TrustBullet>
          Build a guide for a trip: which pets, home information, emergency contacts, WiFi, door
          codes, travel dates. There is a four-step Quick Trip Setup if you would rather be
          walked through it.
        </TrustBullet>
        <TrustBullet>
          Share it as a read-only link, or export a PDF to print and leave on the counter.
        </TrustBullet>
        <TrustBullet>
          Invite family to your household: full, permanent access to everything, for a partner
          or housemate. That is a different thing from inviting a sitter, which is read-only and
          you can take it back at any time.
        </TrustBullet>
        <TrustBullet>
          A daily checklist organized by time of day, which shows you who ticked off what, and
          when.
        </TrustBullet>
        <TrustBullet>
          A memorial space for pets who have died, so their records are kept rather than deleted.
        </TrustBullet>
      </TrustSection>

      <TrustSection heading="For sitters">
        <TrustBullet>
          Your own list of clients. Each household you are connected to, with its pets, guides
          and routines.
        </TrustBullet>
        <TrustBullet>
          The owner&apos;s phone number is on the pet&apos;s page, because the person you most
          need to reach at 9pm is the one whose animal it is.
        </TrustBullet>
        <TrustBullet>
          Tick tasks off as you do them. The owner sees what has been done without having to ask,
          which is usually the text message neither of you wanted to send.
        </TrustBullet>
        <TrustBullet>
          Read the cheat sheet and export the guide as a PDF. You cannot edit an owner&apos;s
          guide, delete anything, or create share links. That is the owner&apos;s to control.
        </TrustBullet>
        <TrustBullet>
          Sitting for friends and family who invite you is always free. Independent sitters who
          bring in their own clients use Pro: first month free, then $9 a month or $79 a year.
        </TrustBullet>
      </TrustSection>

      <TrustSection heading="Privacy and safety">
        <QA q="Who can see my information?">
          Your household, and anyone you
          deliberately share with. Household separation is enforced by the database itself, not
          just by the screens: the rules live below the app, so a bug in a screen cannot leak one
          household&apos;s information to another.
        </QA>
        <QA q="What about door codes and WiFi passwords?">
          They are masked on
          screen behind a tap, including on public share links, and the mask is a fixed width so
          it does not reveal how long the real value is. Take particular care with share links:
          anyone holding the link can open it, so revoke it when the trip is over.
        </QA>
        <QA q="Does the AI see my door codes?">
          No. Cheat sheets are generated
          with placeholders in place of your sensitive values, and the real values are filled in
          afterwards, on your device. The codes never reach the AI.
        </QA>
        <QA q="Is my data sold or tracked?">
          No. There is no advertising and no
          analytics following you around. The product is paid for by Plus and Pro subscriptions,
          and that is the entire business model.
        </QA>
      </TrustSection>

      <TrustSection heading="Billing">
        <TrustText>
          Payments are handled by Stripe. Pawstructions never sees or stores your card details.
        </TrustText>
        <TrustText>
          Plus and Pro are managed through Stripe&apos;s own billing portal, reachable from the
          billing page inside the app: update your card, or cancel there. To switch between monthly and yearly, email us and we will do it for you.
        </TrustText>
        <TrustText>
          If a subscription payment fails, nothing is switched off immediately. Everything stays
          working while the card is retried, and you are told what happened.
        </TrustText>
        <TrustText>Refunds are covered on the Refunds page.</TrustText>
      </TrustSection>
    </TrustPage>
  );
}
