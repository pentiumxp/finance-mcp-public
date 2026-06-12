"use strict";

function dispatchOwnerAssetTool({ name, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.upsert_owner_asset_snapshot") {
    return { handled: true, result: runtime.ownerAssetService.upsertSnapshot(input, context) };
  }
  if (name === "finance.list_owner_asset_snapshots") {
    return { handled: true, result: runtime.ownerAssetService.listSnapshots(input, context) };
  }
  if (name === "finance.get_owner_asset_summary") {
    return { handled: true, result: runtime.ownerAssetService.getSummary(input, context) };
  }
  if (name === "finance.upsert_owner_stock_snapshot") {
    return { handled: true, result: runtime.ownerStockService.upsertSnapshot(input, context) };
  }
  if (name === "finance.apply_owner_stock_position_delta") {
    return { handled: true, result: runtime.ownerStockService.applyPositionDelta(input, context) };
  }
  if (name === "finance.list_owner_stock_snapshots") {
    return { handled: true, result: runtime.ownerStockService.listSnapshots(input, context) };
  }
  if (name === "finance.get_owner_stock_summary") {
    return { handled: true, result: runtime.ownerStockService.getLiveSummary(input, context) };
  }
  return { handled: false };
}

module.exports = {
  dispatchOwnerAssetTool,
};
