import { View, Animated, Platform } from 'react-native';
import { useEffect, useRef } from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  className = '',
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  if (Platform.OS === 'web') {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: '#D4C4A8',
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
    );
  }

  return (
    <Animated.View
      className={className}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#D4C4A8',
        opacity,
      }}
    />
  );
}

// Card skeleton for pet or guide cards
export function CardSkeleton() {
  return (
    <View className="bg-cream-50 rounded-xl p-4 mb-3 border border-tan-200">
      <View className="flex-row items-center">
        <Skeleton width={56} height={56} borderRadius={28} className="mr-3" />
        <View className="flex-1">
          <Skeleton width="60%" height={18} className="mb-2" />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
    </View>
  );
}

// List skeleton showing multiple card skeletons
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

// Detail screen skeleton
export function DetailSkeleton() {
  return (
    <View className="p-4">
      {/* Header */}
      <View className="items-center mb-6">
        <Skeleton width={100} height={100} borderRadius={50} className="mb-4" />
        <Skeleton width={200} height={24} className="mb-2" />
        <Skeleton width={120} height={16} />
      </View>

      {/* Sections */}
      {[1, 2, 3].map((i) => (
        <View key={i} className="bg-cream-50 rounded-xl p-4 mb-4 border border-tan-200">
          <Skeleton width={140} height={18} className="mb-4" />
          <Skeleton width="100%" height={14} className="mb-2" />
          <Skeleton width="80%" height={14} className="mb-2" />
          <Skeleton width="60%" height={14} />
        </View>
      ))}
    </View>
  );
}

// Form skeleton
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <View className="p-4">
      {Array.from({ length: fields }).map((_, i) => (
        <View key={i} className="mb-4">
          <Skeleton width={80} height={14} className="mb-2" />
          <Skeleton width="100%" height={44} borderRadius={8} />
        </View>
      ))}
    </View>
  );
}
