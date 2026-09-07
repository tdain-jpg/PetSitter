import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { DateField } from './DateField';
import { generateId } from '../services';
import type { TravelItinerary, FlightInfo, HotelInfo } from '../types';

interface TravelItineraryEditorProps {
  value: TravelItinerary | undefined;
  onChange: (value: TravelItinerary) => void;
}

/**
 * Signed hour offsets between the owner and the sitter, as the OWNER would say
 * it: "I am 6 hours ahead of you". Stored as the signed number so it can be
 * computed with later; the label is what a person reads.
 *
 * Half-hour zones are real (India, parts of Australia, Newfoundland) and are
 * included rather than rounded away — an owner in Delhi telling their sitter
 * "+9" when it is +9:30 is the kind of small wrongness that erodes trust in
 * everything else on the page.
 */
const TIMEZONE_OFFSETS: { value: string; label: string }[] = [
  { value: '', label: 'Same time as my sitter' },
  ...[-12, -11, -10, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1].map((h) => ({
    value: String(h),
    label: `${h} hours (I'm behind my sitter)`,
  })),
  ...[1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 8.75, 9, 9.5, 10, 10.5, 11, 12, 12.75, 13, 14].map((h) => ({
    value: `+${h}`,
    label: `+${h} hours (I'm ahead of my sitter)`,
  })),
];

export function TravelItineraryEditor({
  value,
  onChange,
}: TravelItineraryEditorProps) {
  const [showFlightForm, setShowFlightForm] = useState(false);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [flightForm, setFlightForm] = useState<Partial<FlightInfo>>({});
  const [flightErrors, setFlightErrors] = useState<{ airline?: string; flight_number?: string }>({});

  // Initialize with defaults if no value
  const itinerary: TravelItinerary = value || {
    flights: [],
  };

  const updateItinerary = (updates: Partial<TravelItinerary>) => {
    onChange({ ...itinerary, ...updates });
  };

  const updateHotelInfo = (field: keyof HotelInfo, fieldValue: string) => {
    const currentHotel = itinerary.hotel_info || { name: '' };
    updateItinerary({
      hotel_info: { ...currentHotel, [field]: fieldValue || undefined },
    });
  };

  // Flight handlers
  const handleAddFlight = (type: 'departure' | 'return') => {
    setFlightForm({
      type,
      airline: '',
      flight_number: '',
      departure_airport: '',
      arrival_airport: '',
      departure_time: '',
      arrival_time: '',
    });
    setFlightErrors({});
    setEditingFlightId(null);
    setShowFlightForm(true);
  };

  const handleEditFlight = (flight: FlightInfo) => {
    setFlightForm({ ...flight });
    setFlightErrors({});
    setEditingFlightId(flight.id);
    setShowFlightForm(true);
  };

  const handleSaveFlight = () => {
    const airline = flightForm.airline;
    const flightNumber = flightForm.flight_number;
    if (!airline || !flightNumber) {
      setFlightErrors({
        airline: airline ? undefined : 'Airline is required',
        flight_number: flightNumber ? undefined : 'Flight number is required',
      });
      return;
    }
    setFlightErrors({});

    if (editingFlightId) {
      updateItinerary({
        flights: itinerary.flights.map((f) =>
          f.id === editingFlightId ? { ...f, ...flightForm } as FlightInfo : f
        ),
      });
    } else {
      const newFlight: FlightInfo = {
        id: generateId(),
        type: flightForm.type || 'departure',
        airline,
        flight_number: flightNumber,
        departure_airport: flightForm.departure_airport || '',
        arrival_airport: flightForm.arrival_airport || '',
        departure_time: flightForm.departure_time || '',
        arrival_time: flightForm.arrival_time || '',
      };
      updateItinerary({
        flights: [...itinerary.flights, newFlight],
      });
    }

    setShowFlightForm(false);
    setFlightForm({});
    setEditingFlightId(null);
  };

  const handleDeleteFlight = (flightId: string) => {
    updateItinerary({
      flights: itinerary.flights.filter((f) => f.id !== flightId),
    });
  };

  const departureFlights = itinerary.flights.filter(f => f.type === 'departure');
  const returnFlights = itinerary.flights.filter(f => f.type === 'return');

  const renderFlightRow = (flight: FlightInfo) => (
    <View
      key={flight.id}
      className="bg-cream-200 rounded-lg p-3 mb-2 border border-tan-200"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="font-medium text-brown-800">
            {flight.airline} {flight.flight_number}
          </Text>
          {/* No airports means no route line. Unguarded this rendered " → "
              on its own — no text-node error, because the arrow is a real
              string, which is why the console never caught it. */}
          {(flight.departure_airport || flight.arrival_airport) ? (
            <Text className="text-tan-600 text-sm">
              {flight.departure_airport} → {flight.arrival_airport}
            </Text>
          ) : null}
          {/* Ternary: both times are stored as empty strings when the flight
              form is left blank, and `'' && …` renders '' as a bare text node
              inside a View. Same shape already fixed in the share view. */}
          {(flight.departure_time || flight.arrival_time) ? (
            <Text className="text-tan-500 text-sm">
              {flight.departure_time} - {flight.arrival_time}
            </Text>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => handleEditFlight(flight)}
            accessibilityRole="button"
            accessibilityLabel={`Edit flight ${flight.flight_number}`}
            style={{ minHeight: 44, justifyContent: 'center' }}
            className="px-3"
          >
            <Text className="text-primary-600 text-xs">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => handleDeleteFlight(flight.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove flight ${flight.flight_number}`}
            style={{ minHeight: 44, justifyContent: 'center' }}
            className="px-3 bg-accent-50 rounded"
          >
            <Text className="text-accent-600 text-xs">Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View>
      {/* Destination & Contact */}
      <Input
        label="Destination"
        placeholder="e.g., Paris, France"
        value={itinerary.destination || ''}
        onChangeText={(v) => updateItinerary({ destination: v || undefined })}
      />

      {/* formatAsPhone like every other phone field in the app. This one was
          storing "6185200491" while the emergency contacts beside it stored
          "(618) 520-0491". A sitter reading them side by side should not have
          to work out that they are the same kind of thing. */}
      <Input
        label="Contact While Away"
        placeholder="Phone, WhatsApp, or how to reach you"
        value={itinerary.contact_while_away || ''}
        onChangeText={(v) => updateItinerary({ contact_while_away: v || undefined })}
        formatAsPhone
      />

      {/* A picker, not free text. "+1 Hour" typed by hand cannot be reasoned
          about — the app cannot tell whether the sitter's 8am is the owner's
          9am — and every user invents their own spelling. The stored value is
          a signed offset in hours, so a future "it's 3pm where they are"
          feature has something to compute with; the labels do the explaining. */}
      <Select
        label="Timezone Difference"
        value={itinerary.timezone_difference || ''}
        options={TIMEZONE_OFFSETS}
        onValueChange={(v) => updateItinerary({ timezone_difference: v || undefined })}
      />

      {/* Departure Flights */}
      <View className="mt-4 mb-2">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-brown-600 font-medium">Departure Flights</Text>
          <Pressable
            onPress={() => handleAddFlight('departure')}
            accessibilityRole="button"
            accessibilityLabel="Add departure flight"
            style={{ minHeight: 44, justifyContent: 'center' }}
            className="bg-primary-50 px-3 py-1 rounded"
          >
            <Text className="text-primary-600 text-sm">+ Add Flight</Text>
          </Pressable>
        </View>

        {departureFlights.length === 0 ? (
          <Text className="text-tan-500 text-sm">No departure flights added.</Text>
        ) : (
          departureFlights.map(renderFlightRow)
        )}
      </View>

      {/* Return Flights */}
      <View className="mt-4 mb-2">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-brown-600 font-medium">Return Flights</Text>
          <Pressable
            onPress={() => handleAddFlight('return')}
            accessibilityRole="button"
            accessibilityLabel="Add return flight"
            style={{ minHeight: 44, justifyContent: 'center' }}
            className="bg-primary-50 px-3 py-1 rounded"
          >
            <Text className="text-primary-600 text-sm">+ Add Flight</Text>
          </Pressable>
        </View>

        {returnFlights.length === 0 ? (
          <Text className="text-tan-500 text-sm">No return flights added.</Text>
        ) : (
          returnFlights.map(renderFlightRow)
        )}
      </View>

      {/* Flight Form */}
      {showFlightForm && (
        <View className="mt-4 p-4 bg-tan-100 rounded-lg">
          <Text className="font-semibold text-brown-800 mb-3">
            {editingFlightId ? 'Edit Flight' : `Add ${flightForm.type === 'departure' ? 'Departure' : 'Return'} Flight`}
          </Text>

          <Input
            label="Airline *"
            placeholder="e.g., United"
            value={flightForm.airline || ''}
            onChangeText={(v) => {
              setFlightForm((prev) => ({ ...prev, airline: v }));
              if (flightErrors.airline) {
                setFlightErrors((prev) => ({ ...prev, airline: undefined }));
              }
            }}
            error={flightErrors.airline}
          />
          <Input
            label="Flight Number *"
            placeholder="e.g., UA123"
            value={flightForm.flight_number || ''}
            onChangeText={(v) => {
              setFlightForm((prev) => ({ ...prev, flight_number: v }));
              if (flightErrors.flight_number) {
                setFlightErrors((prev) => ({ ...prev, flight_number: undefined }));
              }
            }}
            error={flightErrors.flight_number}
          />
          <Input
            label="Departure Airport"
            placeholder="e.g., LAX"
            value={flightForm.departure_airport || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, departure_airport: v }))}
          />
          <Input
            label="Arrival Airport"
            placeholder="e.g., JFK"
            value={flightForm.arrival_airport || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, arrival_airport: v }))}
          />
          <DateField
            label="Departure Time"
            mode="datetime"
            value={flightForm.departure_time || ''}
            onChange={(v) => setFlightForm((prev) => ({ ...prev, departure_time: v }))}
          />
          <DateField
            label="Arrival Time"
            mode="datetime"
            value={flightForm.arrival_time || ''}
            onChange={(v) => setFlightForm((prev) => ({ ...prev, arrival_time: v }))}
          />

          <View className="flex-row gap-2 mt-4">
            <Button title="Save" onPress={handleSaveFlight} variant="primary" />
            <Button
              title="Cancel"
              onPress={() => {
                setShowFlightForm(false);
                setFlightForm({});
                setFlightErrors({});
                setEditingFlightId(null);
              }}
              variant="outline"
            />
          </View>
        </View>
      )}

      {/* Hotel Information */}
      <View className="mt-6">
        <Text className="text-brown-600 font-medium mb-2">Hotel / Accommodation</Text>
        <View className="bg-cream-200 rounded-lg p-4 border border-tan-200">
          <Input
            label="Hotel Name"
            placeholder="e.g., Grand Hotel Paris"
            value={itinerary.hotel_info?.name || ''}
            onChangeText={(v) => updateHotelInfo('name', v)}
          />

          <Input
            label="Address"
            placeholder="Hotel address"
            value={itinerary.hotel_info?.address || ''}
            onChangeText={(v) => updateHotelInfo('address', v)}
          />

          <Input
            label="Phone"
            placeholder="Hotel phone"
            value={itinerary.hotel_info?.phone || ''}
            onChangeText={(v) => updateHotelInfo('phone', v)}
            formatAsPhone
          />
          <Input
            label="Confirmation #"
            placeholder="Booking confirmation"
            value={itinerary.hotel_info?.confirmation_number || ''}
            onChangeText={(v) => updateHotelInfo('confirmation_number', v)}
          />
        </View>
      </View>

      {/* Additional Notes */}
      <View className="mt-4">
        <Input
          label="Travel Notes"
          placeholder="Any additional travel details, layovers, car rentals, etc."
          value={itinerary.notes || ''}
          onChangeText={(v) => updateItinerary({ notes: v || undefined })}
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );
}
