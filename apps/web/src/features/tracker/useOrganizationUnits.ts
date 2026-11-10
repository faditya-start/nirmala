import type { MeResponse, OrganizationUnitDto } from "@nirmala/shared";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

/**
 * Eselon I the signed-in person may see (`GET /auth/me` -> `organizationUnits`, already filtered by scope).
 * Returns an empty list until loaded or when the server does not send the field; callers fall back to what the
 * data itself says (for example `chrDocuments` on the tracker list).
 */
export function useOrganizationUnits(): { units: OrganizationUnitDto[]; ready: boolean } {
  const [state, setState] = useState<{ units: OrganizationUnitDto[]; ready: boolean }>({ units: [], ready: false });
  useEffect(() => {
    let cancelled = false;
    api
      .get<Partial<MeResponse>>("/auth/me", { skipUnauthorized: true })
      .then((result) => {
        if (!cancelled) setState({ units: result.organizationUnits ?? [], ready: true });
      })
      .catch(() => {
        if (!cancelled) setState({ units: [], ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
