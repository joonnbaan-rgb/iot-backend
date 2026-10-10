export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type DevicesStackParamList = {
  DevicesList: undefined;
  DeviceDetail: { deviceId: string; deviceName: string };
  AddDevice: undefined;
  EditDevice: { deviceId: string };
  Groups: undefined;
  GroupEdit: { groupId?: string };
  FloorPlan: undefined;
  Sites: undefined;
  SiteDetail: { siteId: string };
  Sharing: undefined;
  ShareCreate: { deviceId?: string; groupId?: string } | undefined;
};

export type RootTabParamList = {
  DevicesTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};
