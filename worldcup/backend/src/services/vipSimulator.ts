// V2 stub — On Location VIP Simulators
// Will integrate with On Location hospitality API for suite utilization metrics

export interface VipAssetUtilization {
  venueId: string
  venueName: string
  suiteCapacity: number
  occupancy: number
  utilizationRate: number // 0-1
  packages: Array<{ tier: string; sold: number; available: number }>
}

export function getVipUtilization(_venueId: string): VipAssetUtilization {
  // TODO V2: replace with live On Location API call
  return {
    venueId: _venueId,
    venueName: "Estadio Azteca",
    suiteCapacity: 120,
    occupancy: 0,
    utilizationRate: 0,
    packages: [],
  };
}
