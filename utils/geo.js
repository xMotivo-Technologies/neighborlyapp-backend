const EARTH_RADIUS_KM = 6371;
const BASE_DELIVERY_FEE = 300;
const PER_KM_RATE = 100;
const AVG_SPEED_KMH = 25;
const PREP_MINUTES = 10;

const toRad = (deg) => (deg * Math.PI) / 180;

// coord1/coord2 shape: { lat, lng }
const haversineDistanceKm = (coord1, coord2) => {
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

const estimateDeliveryFee = (distanceKm) => Math.round(BASE_DELIVERY_FEE + distanceKm * PER_KM_RATE);

const estimateDurationMinutes = (distanceKm) =>
  Math.round((distanceKm / AVG_SPEED_KMH) * 60 + PREP_MINUTES);

module.exports = { haversineDistanceKm, estimateDeliveryFee, estimateDurationMinutes };
