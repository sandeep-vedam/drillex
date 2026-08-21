export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Outbox: undefined;
  Notifications: undefined;
  Reports: undefined;
  Maintenance: undefined;
  JobCards: undefined;
  JobCardNew: { assetId?: string };
  DailyReading: { assetId: string; assetNumber: string; assetName: string };
  ShiftReport: { assetId: string; assetNumber: string; assetName: string; siteId: string };
};
