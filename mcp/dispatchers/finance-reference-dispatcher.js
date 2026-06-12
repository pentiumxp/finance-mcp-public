"use strict";

function dispatchReferenceTool({ name, input = {}, context = {}, runtime } = {}) {
  if (name === "finance.reference_object_types") return { handled: true, result: runtime.referenceService.objectTypes(input, context) };
  if (name === "finance.reference_get") return { handled: true, result: runtime.referenceService.referenceGet(input, context) };
  if (name === "finance.reference_summarize") return { handled: true, result: runtime.referenceService.referenceSummarize(input, context) };
  return { handled: false };
}

module.exports = {
  dispatchReferenceTool,
};
