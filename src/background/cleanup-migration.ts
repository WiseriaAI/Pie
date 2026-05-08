export async function cleanupLegacySkipPermissions(): Promise<void> {
  await chrome.storage.local.remove("skip_permissions_enabled");
}
