import { View, Text, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, CheatSheetView, ScreenContainer } from '../components';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'SampleCheatSheet'>;

/**
 * A static, pre-filled sample of what Crown generates, shown to
 * pre-purchase users. The content is final display text: it contains NO
 * [[TOKEN]] placeholders and every "sensitive" value is obviously fake,
 * so it renders identically with no homeInfo. The format mirrors the
 * generate-cheat-sheet Edge Function's contract exactly ("## emoji
 * Section" headings, "**Label:** value" lines, "- " bullets).
 */
const SAMPLE_CONTENT = `## ⏰ Daily Schedule

**Banjo** (beagle mix, 6)
- **7:00 AM:** Breakfast — 1 cup of kibble from the bin by the pantry
- **7:30 AM:** Morning walk, about 20 minutes — use the front-clip harness hanging by the door
- **5:30 PM:** Dinner — 1 cup of kibble
- **After dinner:** One joint chew from the jar on the counter
- **9:30 PM:** Last backyard break before bed

**Marmalade** (orange tabby, 4)
- **7:00 AM:** Half a can of wet food on the kitchen windowsill
- **6:00 PM:** Half a can of wet food — she starts campaigning at 5:45; this is normal
- **Daily:** Scoop the litter box in the laundry room and refresh the water fountain

**Tortellini** (red-eared slider turtle, 12)
- **Weekday mornings:** 4–5 turtle pellets dropped into the tank
- **Mon & Thu:** A pinch of chopped greens (romaine bag in the fridge, bottom drawer)
- **8:00 AM:** UVB lamp ON — switch on the power strip behind the tank
- **8:00 PM:** UVB lamp OFF
- **Sunday:** Top up the tank to the fill line with the jug beside it

## 💊 Medications

- **Banjo — joint chew:** 1 chew every evening with dinner (jar on the kitchen counter)
- **Marmalade — hairball paste:** Mon / Wed / Fri, a pea-sized dab on her front paw — she licks it clean
- **Tortellini:** No medications — just wash your hands after handling him

## 🚨 Emergency Contacts

- **Sam & Jordan (Owners):** 555-0163 — call or text anytime, day or night
- **Alex Rivera (Neighbor):** 555-0142 — two doors down, has a spare key, knows all three pets
- **Harborview Animal Clinic (Vet):** 555-0198 — all three pets are on file
- **If a pet seems sick or hurt:** Call the vet first, then text us — do not wait for a reply

## 🔑 Home Access

- **Address:** 12 Sandcastle Court
- **Front door code:** 4281
- **WiFi:** CastleNet — password: DrawbridgeUp!
- **Spare key:** Under the blue planter to the left of the front steps

## ⚠️ Important Reminders

- Marmalade hides under the guest bed when new people arrive — leave that door open and she will appear by dinnertime
- Keep Banjo leashed for the whole walk; squirrels override all of his training
- Always wash your hands after feeding or handling Tortellini, or touching his tank water
- Banjo is not allowed on the couch, no matter what face he makes
- Please keep toilet lids down — Marmalade is curious and Banjo is thirsty`;

export function SampleCheatSheetScreen({ navigation }: Props) {
  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">👀 Sample Cheat Sheet</Text>
            <Text className="text-tan-500">What Crown writes for your sitter</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
          {/* Sample banner */}
          <Card className="mb-4 bg-warm-50 border-warm-300">
            <Text
              className="text-brown-800 font-bold text-xs mb-1"
              style={{ letterSpacing: 2 }}
            >
              SAMPLE
            </Text>
            <Text className="text-brown-600 text-sm">
              A made-up household, so you can see the shape of a real sheet.
              Crown writes yours from your own guide.
            </Text>
          </Card>

          <CheatSheetView content={SAMPLE_CONTENT} />

          <Text className="text-tan-500 text-sm text-center mb-8">
            Pawstructions Crown — coming soon.
          </Text>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
