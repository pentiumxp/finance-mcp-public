"use strict";

const path = require("node:path");
const { createFinanceRepository } = require("./finance-repository");
const { createFinanceTransactionService } = require("./finance-transaction-service");
const { createFinanceReportService } = require("./finance-report-service");
const { createFinanceRecurringService } = require("./finance-recurring-service");
const { createFinanceMemberBindingService } = require("./finance-member-binding-service");
const { createFinancePluginRegistrationService } = require("./finance-plugin-registration-service");
const { createHermesEmbeddedPluginService } = require("./finance-hermes-embedded-plugin-service");
const { createFinanceWacaiImportService } = require("./finance-wacai-import-service");
const { createFinanceUserBindingService } = require("./finance-user-binding-service");
const { createFinanceAttachmentService } = require("./finance-attachment-service");
const { createFinanceTransactionAttachmentService } = require("./finance-transaction-attachment-service");
const { createFinanceImageStore } = require("./finance-image-store");
const { createFinanceLedgerService } = require("./finance-ledger-service");
const { createFinanceReferenceService } = require("./finance-reference-service");
const { createFinanceOwnerAssetService } = require("./finance-owner-asset-service");
const { createFinanceOwnerStockService } = require("./finance-owner-stock-service");

function createFinanceRuntime(options = {}) {
  const dbPath = options.dbPath || process.env.FINANCE_MCP_DB_PATH || path.join(process.cwd(), "data", "finance.sqlite3");
  const repository = createFinanceRepository({ dbPath });
  repository.migrate();
  repository.seedDefaults();
  repository.backfillCategoryIcons();
  const transactionService = createFinanceTransactionService({ repository });
  const reportService = createFinanceReportService({ repository });
  const recurringService = createFinanceRecurringService({ repository, transactionService });
  const ledgerService = createFinanceLedgerService({ repository });
  const referenceService = createFinanceReferenceService({ repository, ledgerService });
  const ownerAssetService = createFinanceOwnerAssetService({ repository, quoteProvider: options.stockQuoteProvider });
  const ownerStockService = createFinanceOwnerStockService({ repository, quoteProvider: options.stockQuoteProvider });
  const memberBindingService = createFinanceMemberBindingService({ repository });
  const userBindingService = createFinanceUserBindingService({ repository });
  const pluginRegistrationService = createFinancePluginRegistrationService({ repository });
  const imageStore = createFinanceImageStore({
    dbPath: options.imageStoreDbPath || process.env.FINANCE_IMAGE_DB_PATH || path.join(path.dirname(dbPath), "finance-images.sqlite3"),
  });
  const attachmentService = createFinanceAttachmentService({
    repository,
    imageStore,
    storageRoot: options.attachmentStorageRoot || path.join(path.dirname(dbPath), "finance-attachments"),
    uploadRoots: options.attachmentUploadRoots,
  });
  attachmentService.backfillOriginalBlobs();
  const transactionAttachmentService = createFinanceTransactionAttachmentService({
    repository,
    transactionService,
    attachmentService,
  });
  const hermesEmbeddedPluginService = createHermesEmbeddedPluginService({
    embeddedAppVersion: options.embeddedAppVersion,
    workspaceAuthorizer: (workspaceId) => Boolean(repository.resolveFinanceUserBinding({
      provider: "hermes_mobile",
      externalWorkspaceId: workspaceId,
      externalUserId: "",
    })),
  });
  const wacaiImportService = createFinanceWacaiImportService({ repository, transactionService });
  return {
    repository,
    imageStore,
    transactionService,
    reportService,
    recurringService,
    ledgerService,
    referenceService,
    ownerAssetService,
    ownerStockService,
    memberBindingService,
    userBindingService,
    pluginRegistrationService,
    attachmentService,
    transactionAttachmentService,
    hermesEmbeddedPluginService,
    wacaiImportService,
    close: () => {
      repository.close();
      imageStore.close();
    },
  };
}

module.exports = {
  createFinanceRuntime,
};
