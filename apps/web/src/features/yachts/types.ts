export type Coordinates = { lat: number; lng: number };

export type Marina = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  coordinates: Coordinates;
  mapImageUrl?: string;
};
