export type Airport = {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
};

export type FlightSegment = {
  flightNumber: string;
  departureAirport: Airport;
  arrivalAirport: Airport;
  departureTime: string;
  arrivalTime: string;
};
