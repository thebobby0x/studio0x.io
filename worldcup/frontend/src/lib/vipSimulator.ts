export interface VipAssetUtilization {
  venueId: string
  venueName: string
  suiteCapacity: number
  occupancy: number
  utilizationRate: number
  packages: Array<{ tier: string; sold: number; available: number }>
}

export function getVipUtilization(venueId: string): VipAssetUtilization {
  return { venueId, venueName: "Estadio Azteca", suiteCapacity: 120, occupancy: 0, utilizationRate: 0, packages: [] };
}
