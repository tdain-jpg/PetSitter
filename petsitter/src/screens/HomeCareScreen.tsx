import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, Select, SectionHeader } from '../components';
import { useData } from '../contexts';
import { generateId } from '../services';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type {
  Guide,
  HomeCare,
  HomeSystem,
  HomeTask,
  Supply,
  Appliance,
  GuestAmenity,
  HomeSystemType,
  TaskFrequency,
  SupplyCategory,
  HomeTaskCategory,
} from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'HomeCare'>;

const SYSTEM_TYPES: { label: string; value: HomeSystemType }[] = [
  { label: 'HVAC', value: 'hvac' },
  { label: 'Water Heater', value: 'water_heater' },
  { label: 'Security', value: 'security' },
  { label: 'Sprinkler', value: 'sprinkler' },
  { label: 'Pool', value: 'pool' },
  { label: 'Fireplace', value: 'fireplace' },
  { label: 'Other', value: 'other' },
];

const TASK_FREQUENCIES: { label: string; value: TaskFrequency }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'As Needed', value: 'as_needed' },
];

const TASK_CATEGORIES: { label: string; value: HomeTaskCategory }[] = [
  { label: 'Plants', value: 'plants' },
  { label: 'Mail', value: 'mail' },
  { label: 'Trash', value: 'trash' },
  { label: 'Cleaning', value: 'cleaning' },
  { label: 'Other', value: 'other' },
];

const SUPPLY_CATEGORIES: { label: string; value: SupplyCategory }[] = [
  { label: 'Pet Food', value: 'pet_food' },
  { label: 'Pet Supplies', value: 'pet_supplies' },
  { label: 'Cleaning', value: 'cleaning' },
  { label: 'Household', value: 'household' },
  { label: 'Other', value: 'other' },
];

export function HomeCareScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, updateGuide } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [homeCare, setHomeCare] = useState<HomeCare | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [showSystemForm, setShowSystemForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showSupplyForm, setShowSupplyForm] = useState(false);
  const [showApplianceForm, setShowApplianceForm] = useState(false);
  const [showAmenityForm, setShowAmenityForm] = useState(false);

  const [editingItem, setEditingItem] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [guideId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
        setHomeCare(
          foundGuide.home_care || {
            id: generateId(),
            guide_id: guideId,
            systems: [],
            tasks: [],
            supplies: [],
            appliances: [],
            guest_amenities: [],
          }
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const saveHomeCare = async (updated: HomeCare) => {
    if (!guide) return;
    setSaving(true);
    try {
      await updateGuide(guideId, { home_care: updated });
      setHomeCare(updated);
    } catch (error: any) {
      const message = error.message || 'Failed to save';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setSaving(false);
    }
  };

  // System handlers
  const handleAddSystem = (system: Omit<HomeSystem, 'id'>) => {
    if (!homeCare) return;
    const newSystem: HomeSystem = { ...system, id: generateId() };
    const updated = { ...homeCare, systems: [...homeCare.systems, newSystem] };
    saveHomeCare(updated);
    setShowSystemForm(false);
    setEditingItem(null);
  };

  const handleDeleteSystem = (id: string) => {
    if (!homeCare) return;
    const updated = {
      ...homeCare,
      systems: homeCare.systems.filter((s) => s.id !== id),
    };
    saveHomeCare(updated);
  };

  // Task handlers
  const handleAddTask = (task: Omit<HomeTask, 'id'>) => {
    if (!homeCare) return;
    const newTask: HomeTask = { ...task, id: generateId() };
    const updated = { ...homeCare, tasks: [...homeCare.tasks, newTask] };
    saveHomeCare(updated);
    setShowTaskForm(false);
    setEditingItem(null);
  };

  const handleDeleteTask = (id: string) => {
    if (!homeCare) return;
    const updated = {
      ...homeCare,
      tasks: homeCare.tasks.filter((t) => t.id !== id),
    };
    saveHomeCare(updated);
  };

  // Supply handlers
  const handleAddSupply = (supply: Omit<Supply, 'id'>) => {
    if (!homeCare) return;
    const newSupply: Supply = { ...supply, id: generateId() };
    const updated = { ...homeCare, supplies: [...homeCare.supplies, newSupply] };
    saveHomeCare(updated);
    setShowSupplyForm(false);
    setEditingItem(null);
  };

  const handleDeleteSupply = (id: string) => {
    if (!homeCare) return;
    const updated = {
      ...homeCare,
      supplies: homeCare.supplies.filter((s) => s.id !== id),
    };
    saveHomeCare(updated);
  };

  // Appliance handlers
  const handleAddAppliance = (appliance: Omit<Appliance, 'id'>) => {
    if (!homeCare) return;
    const newAppliance: Appliance = { ...appliance, id: generateId() };
    const updated = { ...homeCare, appliances: [...homeCare.appliances, newAppliance] };
    saveHomeCare(updated);
    setShowApplianceForm(false);
    setEditingItem(null);
  };

  const handleDeleteAppliance = (id: string) => {
    if (!homeCare) return;
    const updated = {
      ...homeCare,
      appliances: homeCare.appliances.filter((a) => a.id !== id),
    };
    saveHomeCare(updated);
  };

  // Amenity handlers
  const handleAddAmenity = (amenity: Omit<GuestAmenity, 'id'>) => {
    if (!homeCare) return;
    const newAmenity: GuestAmenity = { ...amenity, id: generateId() };
    const updated = { ...homeCare, guest_amenities: [...homeCare.guest_amenities, newAmenity] };
    saveHomeCare(updated);
    setShowAmenityForm(false);
    setEditingItem(null);
  };

  const handleDeleteAmenity = (id: string) => {
    if (!homeCare) return;
    const updated = {
      ...homeCare,
      guest_amenities: homeCare.guest_amenities.filter((a) => a.id !== id),
    };
    saveHomeCare(updated);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!guide || !homeCare) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-xl text-gray-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#2563eb',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          )}
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-gray-900">🏠 Home Care</Text>
          <Text className="text-gray-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Home Systems */}
        <SectionHeader
          title={`Home Systems (${homeCare.systems.length})`}
          rightAction={{ label: '+ Add', onPress: () => setShowSystemForm(true) }}
        >
          {homeCare.systems.length === 0 ? (
            <Text className="text-gray-500">No home systems added.</Text>
          ) : (
            homeCare.systems.map((system) => (
              <View key={system.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{system.name}</Text>
                    <Text className="text-gray-500 text-sm capitalize">{system.type.replace('_', ' ')}</Text>
                    {system.location && <Text className="text-gray-400 text-sm">📍 {system.location}</Text>}
                    {system.instructions && <Text className="text-gray-600 text-sm mt-1">{system.instructions}</Text>}
                  </View>
                  <Pressable onPress={() => handleDeleteSystem(system.id)} className="px-2 py-1">
                    <Text className="text-red-500 text-sm">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {showSystemForm && (
            <SystemForm
              onSave={handleAddSystem}
              onCancel={() => {
                setShowSystemForm(false);
                setEditingItem(null);
              }}
            />
          )}
        </SectionHeader>

        {/* Home Tasks */}
        <SectionHeader
          title={`Home Tasks (${homeCare.tasks.length})`}
          rightAction={{ label: '+ Add', onPress: () => setShowTaskForm(true) }}
        >
          {homeCare.tasks.length === 0 ? (
            <Text className="text-gray-500">No home tasks added.</Text>
          ) : (
            homeCare.tasks.map((task) => (
              <View key={task.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{task.title}</Text>
                    <Text className="text-gray-500 text-sm capitalize">{task.frequency} • {task.category}</Text>
                    {task.instructions && <Text className="text-gray-600 text-sm mt-1">{task.instructions}</Text>}
                  </View>
                  <Pressable onPress={() => handleDeleteTask(task.id)} className="px-2 py-1">
                    <Text className="text-red-500 text-sm">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {showTaskForm && (
            <TaskForm
              onSave={handleAddTask}
              onCancel={() => {
                setShowTaskForm(false);
                setEditingItem(null);
              }}
            />
          )}
        </SectionHeader>

        {/* Supplies */}
        <SectionHeader
          title={`Supplies (${homeCare.supplies.length})`}
          rightAction={{ label: '+ Add', onPress: () => setShowSupplyForm(true) }}
        >
          {homeCare.supplies.length === 0 ? (
            <Text className="text-gray-500">No supplies added.</Text>
          ) : (
            homeCare.supplies.map((supply) => (
              <View key={supply.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{supply.name}</Text>
                    <Text className="text-gray-500 text-sm">📍 {supply.location}</Text>
                    {supply.quantity && <Text className="text-gray-400 text-sm">Qty: {supply.quantity}</Text>}
                  </View>
                  <Pressable onPress={() => handleDeleteSupply(supply.id)} className="px-2 py-1">
                    <Text className="text-red-500 text-sm">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {showSupplyForm && (
            <SupplyForm
              onSave={handleAddSupply}
              onCancel={() => {
                setShowSupplyForm(false);
                setEditingItem(null);
              }}
            />
          )}
        </SectionHeader>

        {/* Appliances */}
        <SectionHeader
          title={`Appliances (${homeCare.appliances.length})`}
          rightAction={{ label: '+ Add', onPress: () => setShowApplianceForm(true) }}
        >
          {homeCare.appliances.length === 0 ? (
            <Text className="text-gray-500">No appliances added.</Text>
          ) : (
            homeCare.appliances.map((appliance) => (
              <View key={appliance.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{appliance.name}</Text>
                    {appliance.location && <Text className="text-gray-500 text-sm">📍 {appliance.location}</Text>}
                    {appliance.instructions && <Text className="text-gray-600 text-sm mt-1">{appliance.instructions}</Text>}
                  </View>
                  <Pressable onPress={() => handleDeleteAppliance(appliance.id)} className="px-2 py-1">
                    <Text className="text-red-500 text-sm">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {showApplianceForm && (
            <ApplianceForm
              onSave={handleAddAppliance}
              onCancel={() => {
                setShowApplianceForm(false);
                setEditingItem(null);
              }}
            />
          )}
        </SectionHeader>

        {/* Guest Amenities */}
        <SectionHeader
          title={`Guest Amenities (${homeCare.guest_amenities.length})`}
          rightAction={{ label: '+ Add', onPress: () => setShowAmenityForm(true) }}
        >
          {homeCare.guest_amenities.length === 0 ? (
            <Text className="text-gray-500">No guest amenities added.</Text>
          ) : (
            homeCare.guest_amenities.map((amenity) => (
              <View key={amenity.id} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{amenity.name}</Text>
                    {amenity.location && <Text className="text-gray-500 text-sm">📍 {amenity.location}</Text>}
                    {amenity.password && <Text className="text-gray-400 text-sm">🔑 {amenity.password}</Text>}
                    {amenity.instructions && <Text className="text-gray-600 text-sm mt-1">{amenity.instructions}</Text>}
                  </View>
                  <Pressable onPress={() => handleDeleteAmenity(amenity.id)} className="px-2 py-1">
                    <Text className="text-red-500 text-sm">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {showAmenityForm && (
            <AmenityForm
              onSave={handleAddAmenity}
              onCancel={() => {
                setShowAmenityForm(false);
                setEditingItem(null);
              }}
            />
          )}
        </SectionHeader>
      </ScrollView>
    </View>
  );
}

// Inline form components
function SystemForm({
  onSave,
  onCancel,
}: {
  onSave: (system: Omit<HomeSystem, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<HomeSystemType>('other');
  const [location, setLocation] = useState('');
  const [instructions, setInstructions] = useState('');

  return (
    <View className="bg-gray-100 rounded-lg p-4 mt-3">
      <Text className="font-semibold text-gray-900 mb-3">Add System</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g., Central AC" />
      <Select label="Type" value={type} options={SYSTEM_TYPES} onValueChange={(v) => setType(v as HomeSystemType)} />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="e.g., Basement" />
      <Input label="Instructions" value={instructions} onChangeText={setInstructions} multiline placeholder="How to operate" />
      <View className="flex-row gap-2 mt-2">
        <Button title="Save" onPress={() => onSave({ name, type, location, instructions })} variant="primary" />
        <Button title="Cancel" onPress={onCancel} variant="outline" />
      </View>
    </View>
  );
}

function TaskForm({
  onSave,
  onCancel,
}: {
  onSave: (task: Omit<HomeTask, 'id'>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<TaskFrequency>('daily');
  const [category, setCategory] = useState<HomeTaskCategory>('other');
  const [instructions, setInstructions] = useState('');

  return (
    <View className="bg-gray-100 rounded-lg p-4 mt-3">
      <Text className="font-semibold text-gray-900 mb-3">Add Task</Text>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g., Water plants" />
      <Select label="Frequency" value={frequency} options={TASK_FREQUENCIES} onValueChange={(v) => setFrequency(v as TaskFrequency)} />
      <Select label="Category" value={category} options={TASK_CATEGORIES} onValueChange={(v) => setCategory(v as HomeTaskCategory)} />
      <Input label="Instructions" value={instructions} onChangeText={setInstructions} multiline placeholder="How to do it" />
      <View className="flex-row gap-2 mt-2">
        <Button title="Save" onPress={() => onSave({ title, frequency, category, instructions })} variant="primary" />
        <Button title="Cancel" onPress={onCancel} variant="outline" />
      </View>
    </View>
  );
}

function SupplyForm({
  onSave,
  onCancel,
}: {
  onSave: (supply: Omit<Supply, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState<SupplyCategory>('other');

  return (
    <View className="bg-gray-100 rounded-lg p-4 mt-3">
      <Text className="font-semibold text-gray-900 mb-3">Add Supply</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g., Dog food" />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="e.g., Pantry" />
      <Input label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="e.g., 2 bags" />
      <Select label="Category" value={category} options={SUPPLY_CATEGORIES} onValueChange={(v) => setCategory(v as SupplyCategory)} />
      <View className="flex-row gap-2 mt-2">
        <Button title="Save" onPress={() => onSave({ name, location, quantity, category })} variant="primary" />
        <Button title="Cancel" onPress={onCancel} variant="outline" />
      </View>
    </View>
  );
}

function ApplianceForm({
  onSave,
  onCancel,
}: {
  onSave: (appliance: Omit<Appliance, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [instructions, setInstructions] = useState('');

  return (
    <View className="bg-gray-100 rounded-lg p-4 mt-3">
      <Text className="font-semibold text-gray-900 mb-3">Add Appliance</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g., Dishwasher" />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="e.g., Kitchen" />
      <Input label="Instructions" value={instructions} onChangeText={setInstructions} multiline placeholder="How to use" />
      <View className="flex-row gap-2 mt-2">
        <Button title="Save" onPress={() => onSave({ name, location, instructions })} variant="primary" />
        <Button title="Cancel" onPress={onCancel} variant="outline" />
      </View>
    </View>
  );
}

function AmenityForm({
  onSave,
  onCancel,
}: {
  onSave: (amenity: Omit<GuestAmenity, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [instructions, setInstructions] = useState('');

  return (
    <View className="bg-gray-100 rounded-lg p-4 mt-3">
      <Text className="font-semibold text-gray-900 mb-3">Add Amenity</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g., Smart TV" />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="e.g., Living room" />
      <Input label="Password/Code" value={password} onChangeText={setPassword} placeholder="e.g., Netflix password" />
      <Input label="Instructions" value={instructions} onChangeText={setInstructions} multiline placeholder="How to use" />
      <View className="flex-row gap-2 mt-2">
        <Button title="Save" onPress={() => onSave({ name, location, password, instructions })} variant="primary" />
        <Button title="Cancel" onPress={onCancel} variant="outline" />
      </View>
    </View>
  );
}
