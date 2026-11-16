"use client";

import { useCallback, useEffect, useState } from "react";

export type GeoReading = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

export type GeoResult =
  | { status: "ok"; reading: GeoReading }
  | { status: "denied" | "unavailable" | "timeout" | "unsupported" | "insecure" };

export type PermissionStateExt = PermissionState | "unsupported" | "unknown";

/**
 * One-shot location reads only. There is deliberately no watchPosition anywhere in the app:
 * location is read once, when the user explicitly clocks in/out or asks to update it.
 */
export function useGeolocation() {
  const [permission, setPermission] = useState<PermissionStateExt>("unknown");

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermission("unsupported");
      return;
    }
    let status: PermissionStatus | null = null;
    const update = () => status && setPermission(status.state);
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => setPermission("unknown"));
    return () => status?.removeEventListener("change", update);
  }, []);

  const read = useCallback((): Promise<GeoResult> => {
    if (typeof window !== "undefined" && !window.isSecureContext) return Promise.resolve({ status: "insecure" });
    if (!("geolocation" in navigator)) return Promise.resolve({ status: "unsupported" });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            status: "ok",
            reading: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
              capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
            },
          }),
        (err) =>
          resolve({
            status: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable",
          }),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    });
  }, []);

  return { permission, read };
}

export function geoErrorMessage(status: Exclude<GeoResult["status"], "ok">): string {
  switch (status) {
    case "denied":
      return "Location permission is blocked for this site. You can still clock in and add the address yourself.";
    case "timeout":
      return "Couldn't get a GPS fix in time. Your session was still saved, and you can add the address yourself.";
    case "insecure":
      return "Location only works over a secure (https) connection.";
    case "unsupported":
      return "This device doesn't support location.";
    default:
      return "Your location isn't available right now. You can add the address yourself.";
  }
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
