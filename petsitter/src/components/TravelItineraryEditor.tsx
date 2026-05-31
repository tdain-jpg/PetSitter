import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Input } from './Input';
import { generateId } from '../services';
import type { TravelItinerary, FlightInfo, HotelInfo } from '../types';

interface TravelItineraryEditorProps {
  value: TravelItinerary | undefined;
  onChange: (value: TravelItinerary) => void;
}

export function TravelItineraryEditor({
  value,
  onChange,
}: TravelItineraryEditorProps) {
  const [showFlightForm, setShowFlightForm] = useState(false);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [flightForm, setFlightForm] = useState<Partial<FlightInfo>>({});

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
    setEditingFlightId(null);
    setShowFlightForm(true);
  };

  const handleEditFlight = (flight: FlightInfo) => {
    setFlightForm({ ...flight });
    setEditingFlightId(flight.id);
    setShowFlightForm(true);
  };

  const handleSaveFlight = () => {
    if (!flightForm.airline || !flightForm.flight_number) return;

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
        airline: flightForm.airline || '',
        flight_number: flightForm.flight_number || '',
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
      className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="font-medium text-gray-900">
            {flight.airline} {flight.flight_number}
          </Text>
          <Text className="text-gray-600 text-sm">
            {flight.departure_airport} → {flight.arrival_airport}
          </Text>
          {(flight.departure_time || flight.arrival_time) && (
            <Text className="text-gray-500 text-sm">
              {flight.departure_time} - {flight.arrival_time}
            </Text>
          )}
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => handleEditFlight(flight)}
            accessibilityRole="button"
            accessibilityLabel={`Edit flight ${flight.flight_number}`}
            className="px-2 py-1"
          >
            <Text className="text-primary-600 text-xs">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => handleDeleteFlight(flight.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove flight ${flight.flight_number}`}
            className="px-2 py-1 bg-red-50 rounded"
          >
            <Text className="text-red-600 text-xs">Remove</Text>
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

      <Input
        label="Contact While Away"
        placeholder="Phone, WhatsApp, or how to reach you"
        value={itinerary.contact_while_away || ''}
        onChangeText={(v) => updateItinerary({ contact_while_away: v || undefined })}
      />

      <Input
        label="Timezone Difference"
        placeholder="e.g., +6 hours, -3 hours"
        value={itinerary.timezone_difference || ''}
        onChangeText={(v) => updateItinerary({ timezone_difference: v || undefined })}
      />

      {/* Departure Flights */}
      <View className="mt-4 mb-2">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-gray-700 font-medium">Departure Flights</Text>
          <Pressable
            onPress={() => handleAddFlight('departure')}
            accessibilityRole="button"
            accessibilityLabel="Add departure flight"
            className="bg-primary-50 px-3 py-1 rounded"
          >
            <Text className="text-primary-600 text-sm">+ Add Flight</Text>
          </Pressable>
        </View>

        {departureFlights.length === 0 ? (
          <Text className="text-gray-400 text-sm">No departure flights added.</Text>
        ) : (
          departureFlights.map(renderFlightRow)
        )}
      </View>

      {/* Return Flights */}
      <View className="mt-4 mb-2">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-gray-700 font-medium">Return Flights</Text>
          <Pressable
            onPress={() => handleAddFlight('return')}
            accessibilityRole="button"
            accessibilityLabel="Add return flight"
            className="bg-primary-50 px-3 py-1 rounded"
          >
            <Text className="text-primary-600 text-sm">+ Add Flight</Text>
          </Pressable>
        </View>

        {returnFlights.length === 0 ? (
          <Text className="text-gray-400 text-sm">No return flights added.</Text>
        ) : (
          returnFlights.map(renderFlightRow)
        )}
      </View>

      {/* Flight Form */}
      {showFlightForm && (
        <View className="mt-4 p-4 bg-gray-100 rounded-lg">
          <Text className="font-semibold text-gray-900 mb-3">
            {editingFlightId ? 'Edit Flight' : `Add ${flightForm.type === 'departure' ? 'Departure' : 'Return'} Flight`}
          </Text>

          <Input
            label="Airline *"
            placeholder="e.g., United"
            value={flightForm.airline || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, airline: v }))}
          />
          <Input
            label="Flight Number *"
            placeholder="e.g., UA123"
            value={flightForm.flight_number || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, flight_number: v }))}
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
          <Input
            label="Departure Time"
            placeholder="e.g., 2025-01-15 08:30"
            value={flightForm.departure_time || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, departure_time: v }))}
          />
          <Input
            label="Arrival Time"
            placeholder="e.g., 2025-01-15 16:45"
            value={flightForm.arrival_time || ''}
            onChangeText={(v) => setFlightForm((prev) => ({ ...prev, arrival_time: v }))}
          />

          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={handleSaveFlight}
              accessibilityRole="button"
              accessibilityLabel="Save flight"
              className="px-4 py-2 bg-primary-600 rounded-lg"
            >
              <Text className="text-white font-medium">Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowFlightForm(false);
                setFlightForm({});
                setEditingFlightId(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="px-4 py-2 bg-gray-200 rounded-lg"
            >
              <Text className="text-gray-700 font-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Hotel Information */}
      <View className="mt-6">
        <Text className="text-gray-700 font-medium mb-2">Hotel / Accommodation</Text>
        <View className="bg-gray-50 rounded-lg p-4 border border-gray-100">
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
