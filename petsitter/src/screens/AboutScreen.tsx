import { View, Text } from 'react-native';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { TrustPage, TrustSection, TrustText, TrustBullet } from '../components/TrustPage';
import type { AboutScreenProps } from '../navigation/types';

// Bump when the wording below changes.
const LAST_UPDATED = '2026-09-07';

/**
 * The staff are real — two dogs and two people — and the titles are the ones
 * they actually answer to around here. No photos exist yet, so each one gets
 * an icon from the commissioned set rather than a stock headshot of somebody
 * else's dog.
 */
const STAFF: { icon: IconName; name: string; title: string; bio: string }[] = [
  {
    icon: 'avatar-dog',
    name: 'Clark',
    title: 'Chief Executive Pawficer',
    bio:
      'Clark sets strategy from the sunniest square of carpet in the building. Every feature has to pass the Clark test: would this actually help someone look after him properly while his people are away? He is the reason the app asks so many questions about medication times.',
  },
  {
    icon: 'avatar-dog',
    name: 'Lillee',
    title: 'Marketing Megamut',
    bio:
      'Lillee greets everyone, whether they asked to be greeted or not. She owns first impressions, enthusiasm, and reminding the rest of the team what the whole thing is for: the moment you get home and everybody is fine.',
  },
  {
    icon: 'feeding',
    name: 'Dana',
    title: 'Head Caretaker',
    bio:
      'Dana is the one who knows when the meds are due, which bowl belongs to whom, and what the vet said last spring. Pawstructions exists because handing all of that to a sitter used to mean a page of scribbled notes and a hopeful text message from the airport.',
  },
  {
    icon: 'guide',
    name: 'Tim',
    title: 'Technical Orchestrator',
    bio:
      'Tim builds and runs the software: the app, the database rules that keep a household’s information inside that household, and the safeguards that keep your door codes away from the AI. When something breaks, he is the one fixing it.',
  },
];

function StaffCard({ icon, name, title, bio }: (typeof STAFF)[number]) {
  return (
    <Card className="mb-3">
      <View className="flex-row items-start">
        <View className="w-14 h-14 rounded-xl bg-primary-50 items-center justify-center mr-4">
          <Icon name={icon} size={36} />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-brown-800">{name}</Text>
          <Text className="text-primary-600 text-sm font-semibold mb-1">{title}</Text>
          <Text className="text-brown-700 leading-6">{bio}</Text>
        </View>
      </View>
    </Card>
  );
}

export function AboutScreen(_props: AboutScreenProps) {
  return (
    <TrustPage
      route="About"
      title="About Pawstructions"
      lastUpdated={LAST_UPDATED}
      intro="Pawstructions turns everything you know about looking after your pets into one guide you can hand to whoever is looking after them next."
    >
      <TrustSection heading="What Pawstructions is">
        <TrustText>
          Pawstructions is a web app for pet owners, at pawstructions.com. You enter your pets’
          details (feeding, medication, vet, routines, the small habits nobody thinks to write
          down) along with the practical facts about your home, and Pawstructions turns them
          into a care guide you can share.
        </TrustText>
        <TrustText>
          You can send that guide to a sitter as a link they open in any browser without making
          an account, or print it as a PDF and leave it on the counter. It runs in every modern
          browser and installs to a phone home screen like an app, with no app store involved.
        </TrustText>
      </TrustSection>

      <TrustSection heading="What it costs">
        <TrustText>
          Almost all of it is free: unlimited pets, unlimited guides, sharing, PDF export,
          checklists, and inviting the rest of your household so everyone works from the same
          information. Free households also get the live sitter features (a sitter with their own
          account, the Today checklist, check-ins and photos) for 2 trips each calendar year. There
          are two paid plans, one for owners and one for independent sitters.
        </TrustText>
        <TrustText>
          Plus is $3 (USD) a month or $24 a year for a whole household. It removes the 2-trip limit
          and gives you unlimited AI cheat sheets (the one-page summary a sitter keeps on the
          fridge) with no watermark. There is no free trial, because the free tier is the trial.
          Every guide gets one free cheat sheet, marked PREVIEW, so you can see it first.
        </TrustText>
        <TrustText>
          Pro is for independent sitters who bring in their own clients. The first month is free,
          then it is $9 a month or $79 a year. Friends and family who sit because an owner invited
          them are always free. If you are a pet owner, Pro will never apply to you.
        </TrustText>
      </TrustSection>

      <TrustSection heading="Who runs it">
        <TrustText>
          Pawstructions is an independent product built and run by a small family team. There is
          no advertising, no analytics scripts following you around, and nobody buying your pets’
          data. The software is paid for by Plus and Pro subscriptions, and that is the whole
          business model.
        </TrustText>
        <TrustText>
          For anything at all, whether a question, a bug, a refund or deleting your account, email
          support@pawstructions.com and a person will read it.
        </TrustText>
      </TrustSection>

      <TrustSection heading="The team">
        <TrustText>
          Photos are coming. Clark and Lillee are notoriously difficult to schedule.
        </TrustText>
        {STAFF.map((member) => (
          <StaffCard key={member.name} {...member} />
        ))}
      </TrustSection>

      <TrustSection heading="What we care about">
        <TrustBullet>
          A sitter should never have to guess. If it matters, it should be on the sheet in front
          of them.
        </TrustBullet>
        <TrustBullet>
          Your door codes and wifi password are yours. They are never sent to an AI provider.
          Our privacy policy explains exactly how that works.
        </TrustBullet>
        <TrustBullet>
          Your data should be easy to take with you. Settings has a one-tap export of everything.
        </TrustBullet>
      </TrustSection>
    </TrustPage>
  );
}
