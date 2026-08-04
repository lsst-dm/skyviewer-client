/**
 * Data for the Earth-scale comparison: if the current patch of sky were
 * scaled onto the Earth's surface, it would cover roughly the area of one of
 * these. The ladder spans city block to whole planet, matching the viewer's
 * zoom range (~0.003° covers ~0.1 km²; the whole celestial sphere maps to the
 * whole surface of Earth).
 */
export const EARTH_SURFACE_KM2 = 510_072_000;

export interface EarthRegion {
  /** display name; also the i18n fallback */
  name: string;
  areaKm2: number;
}

/** familiar areas used for the caption, smallest to largest */
export const earthRegions: Array<EarthRegion> = [
  { name: "Vatican City", areaKm2: 0.49 },
  { name: "Central Park, New York", areaKm2: 3.4 },
  { name: "Manhattan", areaKm2: 59 },
  { name: "San Francisco", areaKm2: 121 },
  { name: "the Isle of Wight", areaKm2: 380 },
  { name: "Greater London", areaKm2: 1572 },
  { name: "Rhode Island", areaKm2: 3144 },
  { name: "Yellowstone National Park", areaKm2: 8983 },
  { name: "Wales", areaKm2: 20779 },
  { name: "Switzerland", areaKm2: 41285 },
  { name: "Iceland", areaKm2: 103000 },
  { name: "Great Britain", areaKm2: 209331 },
  { name: "Spain", areaKm2: 505990 },
  { name: "Texas", areaKm2: 695662 },
  { name: "Greenland", areaKm2: 2166086 },
  { name: "India", areaKm2: 3287263 },
  { name: "the United States", areaKm2: 9833517 },
  { name: "South America", areaKm2: 17840000 },
  { name: "Africa", areaKm2: 30370000 },
  { name: "Asia", areaKm2: 44579000 },
  { name: "all land on Earth", areaKm2: 148940000 },
  { name: "the entire surface of Earth", areaKm2: EARTH_SURFACE_KM2 },
];

/**
 * CDS's HiPS of NASA's Blue Marble Next Generation, which Aladin Lite renders
 * natively. A second Aladin instance showing it at the sky view's own field of
 * view and projection curves exactly as the sky does, so a globe of sky can be
 * held against a globe of Earth.
 *
 * It tops out at order 5, about 400 m per pixel, so it has nothing to say
 * about a city block; the flat street map stays in charge of the narrow fields
 * of view, where the sky is flat anyway and the street detail is the point.
 */
export const earthHiPS = {
  url: "https://alasky.cds.unistra.fr/Planets/CDS_P_Earth_BlueMarble",
  credit: "Blue Marble: Next Generation, NASA Earth Observatory / CDS",
};

export interface EarthCenter {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * The map stays anchored on one of these while zooming, so the sense of
 * scale builds around a single familiar place; the user picks which one.
 */
export const earthCenters: Array<EarthCenter> = [
  { id: "manhattan", name: "Manhattan", lat: 40.7831, lon: -73.9712 },
  { id: "mumbai", name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { id: "la-serena", name: "La Serena", lat: -29.9027, lon: -71.2519 },
];
