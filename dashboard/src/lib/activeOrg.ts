const STORAGE_KEY = "hmeayc_active_org_id";

export function getActiveOrgId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveOrgId(orgId: string) {
  localStorage.setItem(STORAGE_KEY, orgId);
}

export function clearActiveOrgId() {
  localStorage.removeItem(STORAGE_KEY);
}
