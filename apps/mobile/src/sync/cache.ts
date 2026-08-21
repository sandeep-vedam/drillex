import AsyncStorage from '@react-native-async-storage/async-storage';
/** Reference data cache so Home and forms work offline (assets, chemicals, summary). */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; fromCache: boolean }> {
  try { const data = await fetcher(); await AsyncStorage.setItem(`cache.${key}`, JSON.stringify(data)); return { data, fromCache: false }; }
  catch (e) { const raw = await AsyncStorage.getItem(`cache.${key}`); if (raw) return { data: JSON.parse(raw) as T, fromCache: true }; throw e; }
}
