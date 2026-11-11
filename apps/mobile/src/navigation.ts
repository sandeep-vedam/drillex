import type { RoleRow } from './screens/RolesScreen';
import type { Asset as AssetRow } from './screens/AssetsScreen';
import type { DaysWorked, Deployment, Payment } from './lib/finance';

export type RootStackParamList = {
  Login: undefined;
  ChangePassword: { forced?: boolean } | undefined;
  TwoFaEnrol: { employeeId: string; password: string };
  Home: undefined;
  More: undefined;
  Outbox: undefined;
  Notifications: undefined;
  Reports: undefined;
  ShiftReports: undefined;
  Readings: undefined;
  Assets: undefined;
  AssetDetail: { asset: AssetRow };
  History: undefined;
  Parts: undefined;
  AssetNew: undefined;
  Maintenance: undefined;
  JobCards: undefined;
  JobCardNew: { assetId?: string };
  /** `category` picks the form: drilling rigs get the rig condition check, everything else the plant machine readings. */
  DailyReading: { assetId: string; assetNumber: string; assetName: string; category?: string };

  ShiftReport: { assetId: string; assetNumber: string; assetName: string; siteId: string; correctId?: string };
  Roles: undefined;
  RoleForm: { role?: RoleRow };
  Users: undefined;
  UserNew: undefined;
  UserRole: { userId: string; employeeId: string; currentRole: string };
  Devices: undefined;
  TwoFaSettings: undefined;
  OperationsSettings: undefined;
  Chemicals: undefined;
  SyncConflicts: undefined;
  // Requests (client spec §4A tab 7) and the Location / Client Tracker tab (§4A tabs 4–5)
  Requests: undefined;
  RequestNew: undefined;
  RequestDetail: { id: string };
  Site: undefined;
  // Finance Manager (client spec §6) and Plant Hire Supervisor (§11) modules
  Finance: undefined;
  PlantHire: undefined;
  DeploymentForm: { initial?: Deployment };
  DaysWorkedForm: { initial?: DaysWorked };
  PaymentForm: { initial?: Payment; preset?: { clientId: string; deploymentId?: string } };
};
