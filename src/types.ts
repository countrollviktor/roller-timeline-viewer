// Event types from the Countroll API
export type EventType =
  | 'RECOVERED'
  | 'REGRINDED'
  | 'PICTURE'
  | 'ENGRAVED'
  | 'INITIALIZED'
  | 'UNINITIALIZED'
  | 'LINKED'
  | 'UNLINKED'
  | 'ROLLER_LINKED_TO_WO';

export type EventState = 'VISIBLE' | 'HIDDEN';

export interface AssetEvent {
  id: string;
  idx: number;
  type: EventType;
  state: EventState;
  creationType: string;
  creationDateTime: string;
  lastUpdatedDateTime: string;
  createdByUserId: string;
  lastUpdatedByUserId: string;
  createdByThirdPartyId: string;
  // Optional fields
  title?: string;
  description?: string;
  who?: string;
  publicEvent?: boolean;
  reference?: string;
  diameter?: number;
  thingId?: string;
  deviceId?: string;
  deviceType?: string;
  gpsCoordinates?: string;
  assetPositionId?: string;
  positionEventType?: string;
  // Order/invoice fields (on RECOVERED/REGRINDED)
  manufacturerSalesOrder?: string;
  customerSalesOrder?: string;
  deliveryNumber?: string;
  invoiceNumber?: string;
  coverMaterial?: string;
  coverHardness?: string;
  coverColor?: string;
  inProgress?: boolean;
  productionProductCode?: string;
  productionProductID?: string;
}

export interface AssetPosition {
  id: string;
  thirdPartyId: string;
  name: string;
  type: string;
}

export interface Asset {
  id: string;
  type: string;
  preferredLabel: string;
  description: string;
  status: string;
  creationDateTime: string;
  lastUpdatedDateTime: string;
  currentPosition?: AssetPosition;
  events: AssetEvent[];
  // Dimensions
  diameterCore?: number;
  length?: number;
  nominalCoverDiameter?: number;
  nominalCoverLength?: number;
  // Other
  engraved?: boolean;
  temporary?: boolean;
  customType?: string;
}

// Pictures API types
export interface Picture {
  fileName: string;
  downloadUrl: string;
  createdOn: string;
  updatedOn: string;
  contentType: string;
}

export interface PictureEvent {
  url: string; // Deep link to Countroll web app
  numberOfPictures: number;
  pictures: Picture[];
}

export interface PicturesResponse {
  pictureEvents: PictureEvent[];
}
