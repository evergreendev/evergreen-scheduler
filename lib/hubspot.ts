import "server-only";

const HUBSPOT_COMPANY_STATUS_PROPERTY = "faces_production_status";
const HUBSPOT_PHOTOSHOOT_SCHEDULED_STATUS = "Photoshoot/interview scheduled";

function getHubSpotAccessToken() {
  return process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
}

export function isHubSpotConfigured() {
  return Boolean(getHubSpotAccessToken());
}

export async function updateHubSpotCompanyProductionStatus(companyId: string) {
  const accessToken = getHubSpotAccessToken();

  if (!accessToken) {
    throw new Error("HubSpot access token is not configured.");
  }

  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        [HUBSPOT_COMPANY_STATUS_PROPERTY]: HUBSPOT_PHOTOSHOOT_SCHEDULED_STATUS,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`HubSpot company update failed with ${response.status}.${errorBody ? ` ${errorBody}` : ""}`);
  }
}
