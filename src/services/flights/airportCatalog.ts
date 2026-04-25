import type { Airport } from "./flightTypes";

/** Curated IATA rows for wizard lookup + surface-time estimates (not a full global DB). */
export const AIRPORTS: readonly Airport[] = [
  { iataCode: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", coordinates: { lat: 41.27533, lng: 28.751944 } },
  { iataCode: "SAW", name: "Sabiha Gökçen International", city: "Istanbul", country: "Turkey", coordinates: { lat: 40.898553, lng: 29.309219 } },
  { iataCode: "LHR", name: "Heathrow", city: "London", country: "United Kingdom", coordinates: { lat: 51.47, lng: -0.4543 } },
  { iataCode: "LGW", name: "Gatwick", city: "London", country: "United Kingdom", coordinates: { lat: 51.1537, lng: -0.1821 } },
  { iataCode: "STN", name: "Stansted", city: "London", country: "United Kingdom", coordinates: { lat: 51.886, lng: 0.2389 } },
  { iataCode: "LTN", name: "Luton", city: "London", country: "United Kingdom", coordinates: { lat: 51.8747, lng: -0.3683 } },
  { iataCode: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France", coordinates: { lat: 49.0097, lng: 2.5479 } },
  { iataCode: "ORY", name: "Orly", city: "Paris", country: "France", coordinates: { lat: 48.7262, lng: 2.3652 } },
  { iataCode: "BVA", name: "Beauvais–Tillé", city: "Paris", country: "France", coordinates: { lat: 49.4544, lng: 2.1128 } },
  { iataCode: "AMS", name: "Schiphol", city: "Amsterdam", country: "Netherlands", coordinates: { lat: 52.3105, lng: 4.7683 } },
  { iataCode: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", coordinates: { lat: 50.0379, lng: 8.5622 } },
  { iataCode: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", coordinates: { lat: 48.3538, lng: 11.7861 } },
  { iataCode: "BCN", name: "Barcelona–El Prat", city: "Barcelona", country: "Spain", coordinates: { lat: 41.2971, lng: 2.0785 } },
  { iataCode: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "Spain", coordinates: { lat: 40.4839, lng: -3.568 } },
  { iataCode: "FCO", name: "Leonardo da Vinci–Fiumicino", city: "Rome", country: "Italy", coordinates: { lat: 41.8003, lng: 12.2389 } },
  { iataCode: "MXP", name: "Malpensa", city: "Milan", country: "Italy", coordinates: { lat: 45.6306, lng: 8.7281 } },
  { iataCode: "ATH", name: "Eleftherios Venizelos", city: "Athens", country: "Greece", coordinates: { lat: 37.9364, lng: 23.9445 } },
  { iataCode: "LIS", name: "Humberto Delgado", city: "Lisbon", country: "Portugal", coordinates: { lat: 38.7813, lng: -9.1357 } },
  { iataCode: "OPO", name: "Francisco Sá Carneiro", city: "Porto", country: "Portugal", coordinates: { lat: 41.2481, lng: -8.6814 } },
  { iataCode: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", coordinates: { lat: 53.4213, lng: -6.2701 } },
  { iataCode: "JFK", name: "John F. Kennedy International", city: "New York", country: "United States", coordinates: { lat: 40.6413, lng: -73.7781 } },
  { iataCode: "EWR", name: "Newark Liberty International", city: "New York", country: "United States", coordinates: { lat: 40.6895, lng: -74.1745 } },
  { iataCode: "LGA", name: "LaGuardia", city: "New York", country: "United States", coordinates: { lat: 40.7769, lng: -73.874 } },
  { iataCode: "SFO", name: "San Francisco International", city: "San Francisco", country: "United States", coordinates: { lat: 37.6213, lng: -122.379 } },
  { iataCode: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "United States", coordinates: { lat: 33.9416, lng: -118.4085 } },
  { iataCode: "SEA", name: "Seattle–Tacoma International", city: "Seattle", country: "United States", coordinates: { lat: 47.4502, lng: -122.3088 } },
  { iataCode: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "Canada", coordinates: { lat: 43.6777, lng: -79.6248 } },
  { iataCode: "NRT", name: "Narita International", city: "Tokyo", country: "Japan", coordinates: { lat: 35.7647, lng: 140.3864 } },
  { iataCode: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan", coordinates: { lat: 35.5494, lng: 139.7798 } },
  { iataCode: "ICN", name: "Incheon International", city: "Seoul", country: "South Korea", coordinates: { lat: 37.4602, lng: 126.4407 } },
  { iataCode: "SIN", name: "Changi Airport", city: "Singapore", country: "Singapore", coordinates: { lat: 1.3644, lng: 103.9915 } },
  { iataCode: "DXB", name: "Dubai International", city: "Dubai", country: "United Arab Emirates", coordinates: { lat: 25.2532, lng: 55.3657 } },
  { iataCode: "DOH", name: "Hamad International", city: "Doha", country: "Qatar", coordinates: { lat: 25.273056, lng: 51.608056 } },
  { iataCode: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia", coordinates: { lat: -33.9461, lng: 151.1772 } },
  { iataCode: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia", coordinates: { lat: -37.6733, lng: 144.8433 } },
  { iataCode: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", coordinates: { lat: 47.4647, lng: 8.5492 } },
  { iataCode: "VIE", name: "Vienna International", city: "Vienna", country: "Austria", coordinates: { lat: 48.1103, lng: 16.5697 } },
  { iataCode: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", coordinates: { lat: 55.618, lng: 12.656 } },
  { iataCode: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden", coordinates: { lat: 59.6519, lng: 17.9186 } },
  { iataCode: "OSL", name: "Oslo Gardermoen", city: "Oslo", country: "Norway", coordinates: { lat: 60.1975, lng: 11.1004 } },
  { iataCode: "HEL", name: "Helsinki-Vantaa", city: "Helsinki", country: "Finland", coordinates: { lat: 60.3172, lng: 24.9633 } },
  { iataCode: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium", coordinates: { lat: 50.9014, lng: 4.484444 } },
  { iataCode: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czech Republic", coordinates: { lat: 50.1008, lng: 14.26 } },
  { iataCode: "WAW", name: "Warsaw Chopin", city: "Warsaw", country: "Poland", coordinates: { lat: 52.1657, lng: 20.9671 } },
  { iataCode: "BUD", name: "Budapest Ferenc Liszt", city: "Budapest", country: "Hungary", coordinates: { lat: 47.4369, lng: 19.2556 } },
] as const;

export const getAirportByIata = (code: string): Airport | undefined => {
  const u = code.trim().toUpperCase();
  return AIRPORTS.find((a) => a.iataCode === u);
};

export const searchAirports = (query: string, limit = 20): Airport[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...AIRPORTS].slice(0, limit);
  }
  return AIRPORTS.filter(
    (a) => a.iataCode.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
  ).slice(0, limit);
};
