import { describe, expect, it } from "vitest";
import { accuracyLabel, countRepeatVisits, distanceMetres, matchJobSite } from "./distance";

const westmead = { id: "w", name: "Westmead Residential", latitude: -33.8076, longitude: 150.9878, match_radius_m: 150 };
const parramatta = { id: "p", name: "Parramatta Fit-out", latitude: -33.8151, longitude: 151.0011, match_radius_m: 150 };

describe("geo", () => {
  it("computes distances", () => {
    const d = distanceMetres(westmead, parramatta);
    expect(d).toBeGreaterThan(1400);
    expect(d).toBeLessThan(1600);
  });

  it("matches the nearest saved site inside its radius", () => {
    const point = { latitude: -33.8079, longitude: 150.9881, accuracy: 15 };
    expect(matchJobSite(point, [westmead, parramatta])?.site.id).toBe("w");
  });

  it("does not match far away readings", () => {
    expect(matchJobSite({ latitude: -33.9, longitude: 151.2, accuracy: 10 }, [westmead])).toBeNull();
  });

  it("widens the radius by GPS accuracy, but caps it", () => {
    const p = { latitude: -33.8076, longitude: 150.9878 + 0.0025 }; // ~230 m east
    expect(matchJobSite({ ...p, accuracy: 10 }, [westmead])).toBeNull();
    expect(matchJobSite({ ...p, accuracy: 120 }, [westmead])?.site.id).toBe("w");
    expect(matchJobSite({ latitude: -33.8076, longitude: 151.02, accuracy: 5000 }, [westmead])).toBeNull();
  });

  it("counts repeat visits to unsaved locations", () => {
    const past = [
      { latitude: -33.8077, longitude: 150.9879, job_site_id: null, address: "1 Example St" },
      { latitude: -33.8075, longitude: 150.9877, job_site_id: null, address: null },
      { latitude: -33.8076, longitude: 150.9878, job_site_id: "w", address: null },
      { latitude: -33.9, longitude: 151.2, job_site_id: null, address: null },
    ];
    expect(countRepeatVisits(westmead, past)).toEqual({ count: 2, address: "1 Example St" });
  });

  it("labels accuracy honestly", () => {
    expect(accuracyLabel(12).tone).toBe("success");
    expect(accuracyLabel(80).tone).toBe("warning");
    expect(accuracyLabel(900).label).toContain("approximate");
    expect(accuracyLabel(null).tone).toBe("neutral");
  });
});
