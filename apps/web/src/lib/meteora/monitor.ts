import { StrategyType } from "@meteora-ag/dlmm";
import type { PositionInfo } from "./positions";

export interface PositionHealth {
  positionKey: string;
  poolAddress: string;
  pairName: string;
  inRange: boolean;
  activeBinId: number;
  lowerBinId: number;
  upperBinId: number;
  /** 0–100: how far through the range the active bin is */
  rangeProgress: number;
  /** 0–100: distance from nearest edge as % of range width */
  edgeProximityPct: number;
  feeX: string;
  feeY: string;
  totalXAmount: string;
  totalYAmount: string;
  /** 0–100: % of total position value that is token X. -1 if price unavailable */
  xValueRatioPct: number;
  lastCheckedAt: number;
  /** Whether rebalance was triggered automatically */
  autoRebalanceTriggered: boolean;
}

export interface RebalanceRecord {
  id: string;
  positionKey: string;
  poolAddress: string;
  pairName: string;
  triggeredAt: number;
  reason: "out_of_range" | "edge_proximity" | "manual";
  txSigs: string[];
  success: boolean;
  error?: string;
}

export interface MonitorSettings {
  enabled: boolean;
  intervalSeconds: number;
  /** Trigger rebalance when position goes out of range */
  triggerOnOutOfRange: boolean;
  /** Trigger when active bin is within this % of range edge (0 = disabled) */
  edgeProximityThresholdPct: number;
  /** Skip positions with total value below this (in token units, rough estimate) */
  minPositionValueUsd: number;
  /** Hide pools with TVL below this threshold */
  minPoolTvl: number;
  /** Default strategy for auto-rebalance */
  defaultStrategyType: StrategyType;
  /** Default number of bins for rebalanced positions */
  defaultNumBins: number;
  /** Only rebalance if token X is between min/max % of total position value */
  compositionCheckEnabled: boolean;
  minXRatioPct: number;
  maxXRatioPct: number;
  /** LP Agent API key for position discovery */
  lpAgentApiKey: string;
}

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  enabled: false,
  intervalSeconds: 60,
  triggerOnOutOfRange: true,
  edgeProximityThresholdPct: 10,
  minPositionValueUsd: 10,
  minPoolTvl: 20_000,
  defaultStrategyType: StrategyType.Spot,
  defaultNumBins: 20,
  compositionCheckEnabled: false,
  minXRatioPct: 40,
  maxXRatioPct: 60,
  lpAgentApiKey: "",
};

export function computePositionHealth(
  position: PositionInfo,
  activeBinId: number,
  pairName: string,
  priceInfo?: { pricePerToken: string; tokenXDecimals: number; tokenYDecimals: number }
): PositionHealth {
  const rangeWidth = position.upperBinId - position.lowerBinId;
  const inRange = activeBinId >= position.lowerBinId && activeBinId <= position.upperBinId;

  const rangeProgress = rangeWidth === 0 ? 50 :
    Math.max(0, Math.min(100, ((activeBinId - position.lowerBinId) / rangeWidth) * 100));

  // Distance from nearest edge as % of range
  const distFromLower = activeBinId - position.lowerBinId;
  const distFromUpper = position.upperBinId - activeBinId;
  const minDist = Math.min(distFromLower, distFromUpper);
  const edgeProximityPct = rangeWidth === 0 ? 0 : Math.max(0, (minDist / rangeWidth) * 100);

  let xValueRatioPct = -1;
  if (priceInfo) {
    const { pricePerToken, tokenXDecimals, tokenYDecimals } = priceInfo;
    const xHuman = Number(position.totalXAmount) / Math.pow(10, tokenXDecimals);
    const yHuman = Number(position.totalYAmount) / Math.pow(10, tokenYDecimals);
    const price = parseFloat(pricePerToken);
    const xValueInY = xHuman * price;
    const total = xValueInY + yHuman;
    xValueRatioPct = total === 0 ? 50 : Math.max(0, Math.min(100, (xValueInY / total) * 100));
  }

  return {
    positionKey: position.publicKey,
    poolAddress: position.lbPair,
    pairName,
    inRange,
    activeBinId,
    lowerBinId: position.lowerBinId,
    upperBinId: position.upperBinId,
    rangeProgress,
    edgeProximityPct,
    feeX: position.feeX,
    feeY: position.feeY,
    totalXAmount: position.totalXAmount,
    totalYAmount: position.totalYAmount,
    xValueRatioPct,
    lastCheckedAt: Date.now(),
    autoRebalanceTriggered: false,
  };
}

export function shouldAutoRebalance(health: PositionHealth, settings: MonitorSettings): string | null {
  if (settings.triggerOnOutOfRange && !health.inRange) {
    if (
      settings.compositionCheckEnabled &&
      health.xValueRatioPct !== -1 &&
      (health.xValueRatioPct < settings.minXRatioPct || health.xValueRatioPct > settings.maxXRatioPct)
    ) {
      return null;
    }
    return "out_of_range";
  }

  // Skip composition check for edge proximity — a drifting position is expected to be one-sided
  if (
    settings.edgeProximityThresholdPct > 0 &&
    health.inRange &&
    health.edgeProximityPct < settings.edgeProximityThresholdPct
  ) {
    return "edge_proximity";
  }

  return null;
}

export function healthColor(health: PositionHealth): "green" | "yellow" | "red" {
  if (!health.inRange) return "red";
  if (health.edgeProximityPct < 10) return "yellow";
  return "green";
}

export function healthLabel(health: PositionHealth): string {
  if (!health.inRange) return "Out of Range";
  if (health.edgeProximityPct < 10) return "Near Edge";
  return "Healthy";
}
