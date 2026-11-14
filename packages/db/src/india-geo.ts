// Just enough geography to answer one question: which of our clinics is
// nearest to this lead?
//
// Ads are targeted around each clinic (Delhi NCR, Kolkata), but some leads
// come from further away — a Mumbai or Patna lead still has to land with
// somebody. Coordinates are approximate (city centre, or a state's rough
// middle); they only ever decide between clinics hundreds of km apart, so a
// few km of error never changes the answer.
//
// Pure data and functions — safe to import from a client component.

export interface GeoPoint {
  label: string;
  lat: number;
  lng: number;
}

type Place = [label: string, lat: number, lng: number, aliases?: string[]];

// Cities, plus the NCR / Kolkata-area towns a form is likely to name.
const CITIES: Place[] = [
  // Delhi NCR and around
  ["Delhi", 28.61, 77.21, ["new delhi", "dilli", "ncr", "delhi ncr"]],
  ["Noida", 28.54, 77.39],
  ["Greater Noida", 28.47, 77.5],
  ["Gurugram", 28.46, 77.03, ["gurgaon"]],
  ["Ghaziabad", 28.67, 77.45, ["indirapuram"]],
  ["Faridabad", 28.41, 77.32],
  ["Sonipat", 28.99, 77.02, ["sonepat"]],
  ["Panipat", 29.39, 76.97],
  ["Karnal", 29.69, 76.99],
  ["Rohtak", 28.9, 76.61],
  ["Bahadurgarh", 28.69, 76.92],
  ["Rewari", 28.2, 76.62],
  ["Palwal", 28.14, 77.33],
  ["Meerut", 28.98, 77.71],
  ["Hapur", 28.73, 77.78],
  ["Bulandshahr", 28.4, 77.85],
  ["Muzaffarnagar", 29.47, 77.7],
  ["Saharanpur", 29.97, 77.55],
  ["Mathura", 27.49, 77.67, ["vrindavan"]],
  ["Agra", 27.18, 78.01],
  ["Aligarh", 27.88, 78.08],
  ["Dehradun", 30.32, 78.03],
  ["Haridwar", 29.95, 78.16, ["rishikesh"]],
  ["Chandigarh", 30.73, 76.78],
  ["Mohali", 30.7, 76.72],
  ["Panchkula", 30.69, 76.86],
  ["Ambala", 30.38, 76.78],
  ["Ludhiana", 30.9, 75.85],
  ["Amritsar", 31.63, 74.87],
  ["Jalandhar", 31.33, 75.58],
  ["Patiala", 30.34, 76.39],
  ["Shimla", 31.1, 77.17],
  ["Jammu", 32.73, 74.86],
  ["Srinagar", 34.08, 74.8],
  ["Jaipur", 26.91, 75.79],
  ["Alwar", 27.55, 76.6],
  ["Ajmer", 26.45, 74.64],
  ["Jodhpur", 26.24, 73.02],
  ["Udaipur", 24.58, 73.71],
  ["Kota", 25.18, 75.83],
  ["Bikaner", 28.02, 73.31],
  ["Lucknow", 26.85, 80.95],
  ["Kanpur", 26.45, 80.33],
  ["Bareilly", 28.37, 79.43],
  ["Moradabad", 28.84, 78.77],
  ["Jhansi", 25.45, 78.57],
  ["Varanasi", 25.32, 82.97, ["banaras", "benaras", "kashi"]],
  ["Prayagraj", 25.44, 81.85, ["allahabad"]],
  ["Gorakhpur", 26.76, 83.37],
  ["Gwalior", 26.22, 78.18],
  ["Bhopal", 23.26, 77.41],
  ["Indore", 22.72, 75.86],
  ["Jabalpur", 23.18, 79.99],
  ["Ujjain", 23.18, 75.78],
  ["Raipur", 21.25, 81.63],
  ["Bilaspur", 22.08, 82.14],
  ["Nagpur", 21.15, 79.09],
  // West and South
  ["Mumbai", 19.08, 72.88, ["bombay"]],
  ["Navi Mumbai", 19.03, 73.03],
  ["Thane", 19.22, 72.98],
  ["Pune", 18.52, 73.86],
  ["Nashik", 20.0, 73.79],
  ["Aurangabad", 19.88, 75.34, ["chhatrapati sambhajinagar"]],
  ["Ahmedabad", 23.02, 72.57],
  ["Surat", 21.17, 72.83],
  ["Vadodara", 22.31, 73.18, ["baroda"]],
  ["Rajkot", 22.3, 70.8],
  ["Panaji", 15.5, 73.83, ["panjim"]],
  ["Bengaluru", 12.97, 77.59, ["bangalore"]],
  ["Mysuru", 12.3, 76.64, ["mysore"]],
  ["Mangaluru", 12.91, 74.86, ["mangalore"]],
  ["Hubballi", 15.36, 75.12, ["hubli", "dharwad"]],
  ["Hyderabad", 17.39, 78.49, ["secunderabad"]],
  ["Visakhapatnam", 17.69, 83.22, ["vizag"]],
  ["Vijayawada", 16.51, 80.65],
  ["Chennai", 13.08, 80.27, ["madras"]],
  ["Coimbatore", 11.02, 76.96],
  ["Madurai", 9.93, 78.12],
  ["Kochi", 9.93, 76.27, ["cochin", "ernakulam"]],
  ["Thiruvananthapuram", 8.52, 76.94, ["trivandrum"]],
  ["Kozhikode", 11.26, 75.78, ["calicut"]],
  // Kolkata and around, East, North-East
  ["Kolkata", 22.57, 88.36, ["calcutta"]],
  ["Howrah", 22.59, 88.26],
  ["Salt Lake", 22.58, 88.42, ["bidhannagar"]],
  ["New Town", 22.59, 88.48, ["rajarhat"]],
  ["Barasat", 22.72, 88.48],
  ["Barrackpore", 22.76, 88.37],
  ["Dum Dum", 22.63, 88.42],
  ["Kalyani", 22.98, 88.43],
  ["Serampore", 22.75, 88.34, ["srirampur"]],
  ["Hooghly", 22.9, 88.39, ["chinsurah", "chandannagar"]],
  ["Durgapur", 23.52, 87.31],
  ["Asansol", 23.68, 86.98],
  ["Bardhaman", 23.23, 87.86, ["burdwan"]],
  ["Kharagpur", 22.35, 87.23],
  ["Haldia", 22.06, 88.07],
  ["Krishnanagar", 23.4, 88.5],
  ["Siliguri", 26.73, 88.4],
  ["Bhubaneswar", 20.3, 85.82],
  ["Cuttack", 20.46, 85.88],
  ["Puri", 19.81, 85.83],
  ["Rourkela", 22.26, 84.85],
  ["Balasore", 21.49, 86.93],
  ["Ranchi", 23.34, 85.31],
  ["Jamshedpur", 22.8, 86.2],
  ["Dhanbad", 23.8, 86.43],
  ["Bokaro", 23.67, 86.15],
  ["Patna", 25.59, 85.14],
  ["Gaya", 24.79, 85.0],
  ["Muzaffarpur", 26.12, 85.39],
  ["Bhagalpur", 25.24, 86.98],
  ["Guwahati", 26.14, 91.74],
  ["Shillong", 25.58, 91.89],
  ["Agartala", 23.83, 91.29],
  ["Imphal", 24.82, 93.94],
  ["Gangtok", 27.33, 88.61],
  ["Port Blair", 11.62, 92.73],
];

// Rough middles, for when a form gives only the state.
const STATES: Place[] = [
  ["Andhra Pradesh", 15.9, 79.7, ["ap"]],
  ["Arunachal Pradesh", 28.2, 94.7],
  ["Assam", 26.2, 92.9],
  ["Bihar", 25.6, 85.5],
  ["Chhattisgarh", 21.3, 81.9],
  ["Goa", 15.4, 74.0],
  ["Gujarat", 22.7, 71.6],
  ["Haryana", 29.1, 76.1],
  ["Himachal Pradesh", 31.9, 77.1, ["hp"]],
  ["Jharkhand", 23.6, 85.3],
  ["Karnataka", 15.3, 75.7],
  ["Kerala", 10.5, 76.3],
  ["Madhya Pradesh", 23.5, 77.9, ["mp"]],
  ["Maharashtra", 19.4, 75.7],
  ["Manipur", 24.8, 93.9],
  ["Meghalaya", 25.5, 91.4],
  ["Mizoram", 23.2, 92.9],
  ["Nagaland", 26.1, 94.5],
  ["Odisha", 20.5, 84.4, ["orissa"]],
  ["Punjab", 30.9, 75.4],
  ["Rajasthan", 26.9, 73.8],
  ["Sikkim", 27.5, 88.5],
  ["Tamil Nadu", 11.1, 78.7, ["tn"]],
  ["Telangana", 17.9, 79.0],
  ["Tripura", 23.8, 91.3],
  ["Uttar Pradesh", 26.8, 80.9, ["up"]],
  ["Uttarakhand", 30.1, 79.0, ["uttaranchal"]],
  ["West Bengal", 23.0, 87.9, ["wb", "bengal"]],
  ["Jammu and Kashmir", 33.8, 75.0, ["jammu & kashmir", "j&k"]],
  ["Ladakh", 34.2, 77.6],
  ["Puducherry", 11.94, 79.81, ["pondicherry"]],
  ["Andaman and Nicobar Islands", 11.7, 92.7],
  ["Lakshadweep", 10.6, 72.6],
  ["Dadra and Nagar Haveli and Daman and Diu", 20.4, 73.0],
];

const byLabel = new Map<string, Place>([...CITIES, ...STATES].map((p) => [p[0].toLowerCase(), p]));
const point = (label: string): GeoPoint | null => {
  const p = byLabel.get(label.toLowerCase());
  return p ? { label: p[0], lat: p[1], lng: p[2] } : null;
};

// PIN code -> place. Three-digit prefixes where a state is too big to be one
// point (NCR vs the rest of UP, Kolkata vs the rest of Bengal); otherwise the
// two-digit postal region.
const PIN3: Record<string, string> = {
  "110": "Delhi", "121": "Faridabad", "122": "Gurugram", "124": "Rohtak", "131": "Sonipat", "132": "Karnal",
  "160": "Chandigarh", "201": "Noida", "202": "Aligarh", "203": "Bulandshahr", "245": "Hapur", "250": "Meerut",
  "281": "Mathura", "282": "Agra", "226": "Lucknow", "208": "Kanpur", "221": "Varanasi", "211": "Prayagraj",
  "273": "Gorakhpur", "243": "Bareilly", "244": "Moradabad", "246": "Uttarakhand", "247": "Saharanpur",
  "248": "Dehradun", "249": "Haridwar", "262": "Uttarakhand", "263": "Uttarakhand", "302": "Jaipur",
  "400": "Mumbai", "401": "Thane", "411": "Pune", "403": "Goa", "380": "Ahmedabad", "395": "Surat",
  "560": "Bengaluru", "500": "Hyderabad", "600": "Chennai", "605": "Puducherry", "682": "Kochi",
  "700": "Kolkata", "711": "Howrah", "712": "Hooghly", "713": "Bardhaman", "721": "Kharagpur",
  "734": "Siliguri", "737": "Sikkim", "744": "Andaman and Nicobar Islands", "751": "Bhubaneswar",
  "753": "Cuttack", "800": "Patna", "834": "Ranchi", "831": "Jamshedpur", "826": "Dhanbad",
  "781": "Guwahati", "790": "Arunachal Pradesh", "791": "Arunachal Pradesh", "792": "Arunachal Pradesh",
  "793": "Meghalaya", "794": "Meghalaya", "795": "Manipur", "796": "Mizoram", "797": "Nagaland",
  "798": "Nagaland", "799": "Tripura",
};
const PIN2: Record<string, string> = {
  "11": "Delhi", "12": "Haryana", "13": "Haryana", "14": "Punjab", "15": "Punjab", "16": "Punjab",
  "17": "Himachal Pradesh", "18": "Jammu and Kashmir", "19": "Jammu and Kashmir",
  "20": "Uttar Pradesh", "21": "Uttar Pradesh", "22": "Uttar Pradesh", "23": "Uttar Pradesh",
  "24": "Uttar Pradesh", "25": "Uttar Pradesh", "26": "Uttar Pradesh", "27": "Uttar Pradesh", "28": "Uttar Pradesh",
  "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan",
  "36": "Gujarat", "37": "Gujarat", "38": "Gujarat", "39": "Gujarat",
  "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra", "44": "Maharashtra",
  "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh",
  "49": "Chhattisgarh", "50": "Telangana", "51": "Andhra Pradesh", "52": "Andhra Pradesh", "53": "Andhra Pradesh",
  "56": "Karnataka", "57": "Karnataka", "58": "Karnataka", "59": "Karnataka",
  "60": "Tamil Nadu", "61": "Tamil Nadu", "62": "Tamil Nadu", "63": "Tamil Nadu", "64": "Tamil Nadu",
  "67": "Kerala", "68": "Kerala", "69": "Kerala",
  "70": "West Bengal", "71": "West Bengal", "72": "West Bengal", "73": "West Bengal", "74": "West Bengal",
  "75": "Odisha", "76": "Odisha", "77": "Odisha", "78": "Assam", "79": "Assam",
  "80": "Bihar", "81": "Jharkhand", "82": "Jharkhand", "83": "Jharkhand", "84": "Bihar", "85": "Bihar",
};

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim()} `;
}

// Longest names first, so "navi mumbai" wins over "mumbai" and "new town"
// is not read as anything shorter.
const needles = (places: Place[]) =>
  places
    .flatMap(([label, , , aliases]) => [label, ...(aliases ?? [])].map((n) => ({ needle: normalize(n), label })))
    .sort((a, b) => b.needle.length - a.needle.length);
const NAMED = needles([...CITIES, ...STATES]);
// Ad names are full of short codes ("UP", "MP", "AP" mean other things
// there), so only city names count when reading them.
const NAMED_CITIES = needles(CITIES);

/** A place named anywhere in the text (whole words only), or null. */
export function placeInText(text: string | null | undefined, citiesOnly = false): GeoPoint | null {
  if (!text) return null;
  const hay = normalize(text);
  for (const { needle, label } of citiesOnly ? NAMED_CITIES : NAMED) {
    if (hay.includes(needle)) return point(label);
  }
  return null;
}

/** A 6-digit Indian PIN code anywhere in the text -> its area. */
export function placeForPincode(text: string | null | undefined): GeoPoint | null {
  const pin = text?.match(/\b[1-9]\d{5}\b/)?.[0];
  if (!pin) return null;
  const label = PIN3[pin.slice(0, 3)] ?? PIN2[pin.slice(0, 2)];
  return label ? point(label) : null;
}

export interface LocationFacts {
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  /** Ad set / campaign / form names — a last resort, e.g. "Kolkata | Knee | 35+". */
  otherText?: (string | null | undefined)[];
}

/**
 * Best guess at where a lead is, most specific evidence first: the city they
 * typed, their PIN code, their state, then a place named in the ad set.
 */
export function locateLead(f: LocationFacts): (GeoPoint & { from: string }) | null {
  const tries: [string, GeoPoint | null][] = [
    ["city", placeInText(f.city)],
    ["pincode", placeForPincode(f.pincode) ?? placeForPincode(f.city)],
    ["state", placeInText(f.state)],
    ["ad", placeInText((f.otherText ?? []).filter(Boolean).join(" "), true)],
  ];
  for (const [from, p] of tries) if (p) return { ...p, from };
  return null;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Cities a clinic can be placed at, for the rule editor. */
export const CLINIC_PLACES: GeoPoint[] = CITIES.map(([label, lat, lng]) => ({ label, lat, lng })).sort((a, b) =>
  a.label.localeCompare(b.label),
);

/** "Which city / state / pincode?" style answers pulled out of a form. */
export function locationFromAnswers(answers: Record<string, string>): { city: string | null; state: string | null; pincode: string | null } {
  let city: string | null = null;
  let state: string | null = null;
  let pincode: string | null = null;
  for (const [label, value] of Object.entries(answers)) {
    if (!value) continue;
    const l = label.toLowerCase();
    // Word-start matches: "spine" must not read as a PIN, nor "estate" as a state.
    if (!pincode && /(^|[^a-z])(pin|zip|postal|post_code)/.test(l)) pincode = value.trim();
    else if (!state && /(^|[^a-z])(state|province)/.test(l)) state = value.trim();
    else if (!city && /(^|[^a-z])(city|location|town|shahar|locality)/.test(l)) city = value.trim();
  }
  return { city, state, pincode };
}

/**
 * Every place name (and alias), lower-cased, within `km` of a point — for
 * matching a free-text city in SQL, e.g. "is this lead in the Kolkata area".
 * States are left out: a state's centre says nothing about its towns.
 */
export function placeNamesNear(center: { lat: number; lng: number }, km: number): string[] {
  const states = new Set(Object.values(PIN2));
  return CITIES.filter(([label, lat, lng]) => !states.has(label) && distanceKm(center, { lat, lng }) <= km).flatMap(
    ([label, , , aliases]) => [label, ...(aliases ?? [])].map((n) => n.toLowerCase()),
  );
}
