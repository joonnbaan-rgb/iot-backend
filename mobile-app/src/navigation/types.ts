export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type DevicesStackParamList = {
  DevicesList: undefined;
  DeviceDetail: { deviceId: string; deviceName: string };
  AddDevice: undefined;
  EditDevice: { deviceId: string };
};

export type RootTabParamList = {
  DevicesTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};
