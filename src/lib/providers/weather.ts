import { env } from "@/lib/env";
import type { WeatherSnapshot } from "@/lib/types";

type GeocodingResult = {
  name?: string;
  country?: string;
  admin1?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
};

type ForecastResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
    wind_gusts_10m?: number[];
    weather_code?: number[];
  };
};

function normalizeQueryParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function buildLocationLabel(result: GeocodingResult) {
  return normalizeQueryParts([result.name, result.admin1, result.country]);
}

function findNearestHourlyIndex(times: string[], kickoffIso: string) {
  if (!times.length) {
    return -1;
  }

  const kickoffTime = new Date(kickoffIso).getTime();
  let nearestIndex = 0;
  let nearestDistance = Math.abs(new Date(times[0]!).getTime() - kickoffTime);

  for (let index = 1; index < times.length; index += 1) {
    const distance = Math.abs(new Date(times[index]!).getTime() - kickoffTime);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export async function fetchWeatherSnapshot(params: {
  kickoffIso: string;
  city?: string | null;
  venueName?: string | null;
  country?: string | null;
}) {
  const locationQuery = normalizeQueryParts([
    params.city,
    params.venueName && params.venueName !== params.city ? params.venueName : null,
    params.country,
  ]);

  if (!locationQuery) {
    return null;
  }

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.searchParams.set("name", locationQuery);
  geocodingUrl.searchParams.set("count", "1");
  geocodingUrl.searchParams.set("language", "pt");
  geocodingUrl.searchParams.set("format", "json");

  const geocodingResponse = await fetch(geocodingUrl, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!geocodingResponse.ok) {
    return null;
  }

  const geocodingPayload = (await geocodingResponse.json()) as GeocodingResponse;
  const place = geocodingPayload.results?.[0];

  if (
    !place ||
    typeof place.latitude !== "number" ||
    typeof place.longitude !== "number"
  ) {
    return null;
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "weather_code",
    ].join(","),
  );
  forecastUrl.searchParams.set("forecast_days", "3");
  forecastUrl.searchParams.set("timezone", place.timezone ?? env.API_FOOTBALL_TIMEZONE);

  const forecastResponse = await fetch(forecastUrl, {
    cache: "force-cache",
    next: { revalidate: 60 * 30 },
  });

  if (!forecastResponse.ok) {
    return null;
  }

  const forecastPayload = (await forecastResponse.json()) as ForecastResponse;
  const hourlyTimes = forecastPayload.hourly?.time ?? [];
  const nearestIndex = findNearestHourlyIndex(hourlyTimes, params.kickoffIso);

  if (nearestIndex < 0) {
    return null;
  }

  return {
    locationLabel: buildLocationLabel(place) || locationQuery,
    kickoffLocalTime: hourlyTimes[nearestIndex] ?? params.kickoffIso,
    temperatureC: forecastPayload.hourly?.temperature_2m?.[nearestIndex] ?? null,
    apparentTemperatureC:
      forecastPayload.hourly?.apparent_temperature?.[nearestIndex] ?? null,
    precipitationProbability:
      forecastPayload.hourly?.precipitation_probability?.[nearestIndex] ?? null,
    precipitationMm: forecastPayload.hourly?.precipitation?.[nearestIndex] ?? null,
    windSpeedKmh: forecastPayload.hourly?.wind_speed_10m?.[nearestIndex] ?? null,
    windGustsKmh: forecastPayload.hourly?.wind_gusts_10m?.[nearestIndex] ?? null,
    weatherCode: forecastPayload.hourly?.weather_code?.[nearestIndex] ?? null,
  } satisfies WeatherSnapshot;
}
