export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  DailyReading: { assetId: string; assetNumber: string; assetName: string };
  ShiftReport: { assetId: string; assetNumber: string; assetName: string; siteId: string };
};
