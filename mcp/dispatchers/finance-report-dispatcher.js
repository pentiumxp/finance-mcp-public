"use strict";

function dispatchReportTool({ name, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.get_summary") return { handled: true, result: runtime.reportService.getSummary(input, context) };
  if (name === "finance.get_report") return { handled: true, result: runtime.reportService.getReport(input, context) };
  return { handled: false };
}

module.exports = {
  dispatchReportTool,
};
