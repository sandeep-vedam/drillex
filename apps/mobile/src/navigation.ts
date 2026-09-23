import type { RoleRow } from './screens/RolesScreen';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Outbox: undefined;
  Notifications: undefined;
  Reports: undefined;
  History: undefined;
  Parts: undefined;
  AssetNew: undefined;
  Maintenance: undefined;
  JobCards: undefined;
  JobCardNew: { assetId?: string };
  DailyReading: { assetId: string; assetNumber: string; assetName: string };
  ShiftReport: { assetId: string; assetNumber: string; assetName: string; siteId: string };
  Roles: undefined;
  RoleForm: { role?: RoleRow };
  Users: undefined;
  UserNew: undefined;
  UserRole: { userId: string; employeeId: string; currentRole: string };
  Devices: undefined;
  TwoFaSettings: undefined;
  SyncConflicts: undefined;
};
