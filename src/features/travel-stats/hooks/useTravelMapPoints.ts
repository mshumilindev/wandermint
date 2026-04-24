import { useEffect, useMemo, useState } from "react";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { createTravelMapPoints, type TravelMapPoint } from "../services/travelMapService";

const memoryLocationKey = (memory: TravelMemory): string => `${memory.city.trim()}, ${memory.country.trim()}`;

export const useTravelMapPoints = (
  memories: TravelMemory[],
): { points: TravelMapPoint[]; isResolving: boolean; unresolvedCount: number } => {
  const [resolvedCoordinates, setResolvedCoordinates] = useState<Record<string, { latitude: number; longitude: number; geoLabel: string }>>({});
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [failedKeys, setFailedKeys] = useState<string[]>([]);

  useEffect(() => {
    const allMissingKeys = Array.from(
      new Set(
        memories
          .filter((memory) => memory.latitude === undefined || memory.longitude === undefined)
          .map(memoryLocationKey),
      ),
    );
    const unresolvedKeys = allMissingKeys
      .filter((key) => resolvedCoordinates[key] === undefined && !failedKeys.includes(key))
      .slice(0, 12);

    if (unresolvedKeys.length === 0) {
      return;
    }

    let isActive = true;
    setPendingKeys(unresolvedKeys);

    const resolveCoordinates = async (): Promise<void> => {
      const results = await Promise.all(
        unresolvedKeys.map(async (key) => {
          try {
            const point = await publicGeoProvider.geocode(key);
            return { key, point };
          } catch {
            return { key, point: null };
          }
        }),
      );

      if (!isActive) {
        return;
      }

      setResolvedCoordinates((current) => {
        const next = { ...current };
        const nextFailedKeys: string[] = [];
        results.forEach((result) => {
          if (result.point) {
            next[result.key] = {
              latitude: result.point.latitude,
              longitude: result.point.longitude,
              geoLabel: result.point.label,
            };
          } else {
            nextFailedKeys.push(result.key);
          }
        });
        if (nextFailedKeys.length > 0) {
          setFailedKeys((currentFailed) => [...new Set([...currentFailed, ...nextFailedKeys.filter(Boolean)])]);
        }
        return next;
      });
      setPendingKeys([]);
    };

    void resolveCoordinates();

    return () => {
      isActive = false;
    };
  }, [failedKeys, memories, resolvedCoordinates]);

  const enrichedMemories = useMemo(
    () => memories.map((memory) => {
      if (memory.latitude !== undefined && memory.longitude !== undefined) {
        return memory;
      }

      const resolved = resolvedCoordinates[memoryLocationKey(memory)];
      return resolved ? { ...memory, ...resolved } : memory;
    }),
    [memories, resolvedCoordinates],
  );

  const unresolvedCount = useMemo(
    () =>
      Array.from(
        new Set(
          memories
            .filter((memory) => memory.latitude === undefined || memory.longitude === undefined)
            .map(memoryLocationKey)
            .filter((key) => resolvedCoordinates[key] === undefined),
        ),
      ).length,
    [memories, resolvedCoordinates],
  );

  return {
    points: useMemo(() => createTravelMapPoints(enrichedMemories), [enrichedMemories]),
    isResolving: pendingKeys.length > 0,
    unresolvedCount,
  };
};
