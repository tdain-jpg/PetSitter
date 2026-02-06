import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Input } from './Input';
import { Select } from './Select';
import { generateId } from '../services';
import type { TravelItinerary, FlightInfo, HotelInfo } from '../types';

interface TravelItineraryEditorProps {
  value: TravelItinerary | undefined;
  onChange: (value: TravelItinerary) => void;
}

const transportModeOptions = [
  { label: 'Flight', value: 'flight' },
  { label: 'Cruise', value: 'cruise' },
  { label: 'Train', value: 'train' },
  { label: 'Driving', value: 'driving' },
  { label: 'Other', value: 'other' },
];

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

  const buttonStyle = Platform.OS === 'web'
    ? {
        padding: '8px 16px',
        backgroundColor: '#eff6ff',
        color: '#2563eb',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
      }
    : undefined;

  const removeButtonStyle = Platform.OS === 'web'
    ? {
        padding: '4px 8px',
        backgroundColor: '#fee2e2',
        color: '#dc2626',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
      }
    : undefined;

  const departureFlights = itinerary.flights.filter(f => f.type === 'departure');
  const returnFlights = itinerary.flights.filter(f => f.type === 'return');

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
          {Platform.OS === 'web' ? (
            <button
              onClick={() => handleAddFlight('departure')}
              style={{
                ...buttonStyle,
                padding: '4px 12px',
                fontSize: 12,
              }}
            >
              + Add Flight
            </button>
          ) : (
            <Pressable
              onPress={() => handleAddFlight('departure')}
              className="bg-primary-50 px-3 py-1 rounded"
            >
              <Text className="text-primary-600 text-sm">+ Add Flight</Text>
            </Pressable>
          )}
        </View>

        {departureFlights.length === 0 ? (
          <Text className="text-gray-400 text-sm">No departure flights added.</Text>
        ) : (
          departureFlights.map((flight) => (
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
                  {Platform.OS === 'web' ? (
                    <>
                      <button
                        onClick={() => handleEditFlight(flight)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'transparent',
                          color: '#2563eb',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteFlight(flight.id)}
                        style={removeButtonStyle}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Pressable onPress={() => handleEditFlight(flight)} className="px-2 py-1">
                        <Text className="text-primary-600 text-xs">Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteFlight(flight.id)} className="px-2 py-1 bg-red-50 rounded">
                        <Text className="text-red-600 text-xs">Remove</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Return Flights */}
      <View className="mt-4 mb-2">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-gray-700 font-medium">Return Flights</Text>
          {Platform.OS === 'web' ? (
            <button
              onClick={() => handleAddFlight('return')}
              style={{
                ...buttonStyle,
                padding: '4px 12px',
                fontSize: 12,
              }}
            >
              + Add Flight
            </button>
          ) : (
            <Pressable
              onPress={() => handleAddFlight('return')}
              className="bg-primary-50 px-3 py-1 rounded"
            >
              <Text className="text-primary-600 text-sm">+ Add Flight</Text>
            </Pressable>
          )}
        </View>

        {returnFlights.length === 0 ? (
          <Text className="text-gray-400 text-sm">No return flights added.</Text>
        ) : (
          returnFlights.map((flight) => (
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
                  {Platform.OS === 'web' ? (
                    <>
                      <button
                        onClick={() => handleEditFlight(flight)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'transparent',
                          color: '#2563eb',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteFlight(flight.id)}
                        style={removeButtonStyle}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Pressable onPress={() => handleEditFlight(flight)} className="px-2 py-1">
                        <Text className="text-primary-600 text-xs">Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteFlight(flight.id)} className="px-2 py-1 bg-red-50 rounded">
                        <Text className="text-red-600 text-xs">Remove</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Flight Form */}
      {showFlightForm && (
        <View className="mt-4 p-4 bg-gray-100 rounded-lg">
          <Text className="font-semibold text-gray-900 mb-3">
            {editingFlightId ? 'Edit Flight' : `Add ${flightForm.type === 'departure' ? 'Departure' : 'Return'} Flight`}
          </Text>

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            </div>
          ) : (
            <>
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
            </>
          )}

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            </div>
          ) : (
            <>
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
            </>
          )}

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                  Departure Time
                </label>
                <input
                  type="datetime-local"
                  value={flightForm.departure_time || ''}
                  onChange={(e) => setFlightForm((prev) => ({ ...prev, departure_time: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                  Arrival Time
                </label>
                <input
                  type="datetime-local"
                  value={flightForm.arrival_time || ''}
                  onChange={(e) => setFlightForm((prev) => ({ ...prev, arrival_time: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          {Platform.OS === 'web' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={handleSaveFlight}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#2563eb',
                  color: 'white',
                }}
              >
                Save Flight
              </button>
              <button
                onClick={() => {
                  setShowFlightForm(false);
                  setFlightForm({});
                  setEditingFlightId(null);
                }}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <View className="flex-row gap-2 mt-4">
              <Pressable
                onPress={handleSaveFlight}
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
                className="px-4 py-2 bg-gray-200 rounded-lg"
              >
                <Text className="text-gray-700 font-medium">Cancel</Text>
              </Pressable>
            </View>
          )}
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

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            </div>
          ) : (
            <>
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
            </>
          )}
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
