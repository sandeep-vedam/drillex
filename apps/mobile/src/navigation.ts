export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Outbox: undefined;
  Maintenance: undefined;
  DailyReading: { assetId: string; assetNumber: string; assetName: string };
  ShiftReport: { assetId: string; assetNumber: string; assetName: string; siteId: string };
};
