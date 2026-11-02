import type { Audit, SiteRun } from "../audit/types.ts";
import { compareReports } from "../judge/compare.ts";
import { countryName } from "../plan/country.ts";
import type { SiteReport } from "../judge/types.ts";

function reportsOf(audit: Audit): SiteReport[] {
  return audit.sites.flatMap((site) => (site.report ? [site.report] : []));
}

function comparisonOf(audit: Audit) {
  const reports = reportsOf(audit);
  return reports.length >= 2 ? compareReports(audit.task, reports) : null;
}

function publicSite({ signInId, ...site }: SiteRun) {
  return { ...site, signedIn: signInId !== null };
}

export function ownerView({ visitorId: _visitorId, ...audit }: Audit) {
  return {
    ...audit,
    /** Worldwide audits, and audits saved before countries were inferred, have none to state. */
    countryName: audit.country ? countryName(audit.country) : null,
    sites: audit.sites.map(publicSite),
    comparison: comparisonOf({ visitorId: "", ...audit }),
  };
}

export function sharedView(audit: Audit) {
  const { shareToken: _shareToken, city: _city, ...view } = ownerView(audit);
  return view;
}

export function summaryView(audit: Audit) {
  return {
    id: audit.id,
    task: audit.task,
    flow: audit.flow,
    createdAt: audit.createdAt,
    status: audit.status,
    sites: audit.sites.map(({ host, state, report }) => ({
      host,
      state,
      found: report?.patterns.filter((entry) => entry.status === "found").length ?? 0,
      notChecked: report?.patterns.filter((entry) => entry.status === "not_checked").length ?? 0,
      total: report?.bill.total ?? null,
      currency: report?.bill.currency ?? null,
      priceLabel: report?.priceLabel ?? "none",
    })),
  };
}
